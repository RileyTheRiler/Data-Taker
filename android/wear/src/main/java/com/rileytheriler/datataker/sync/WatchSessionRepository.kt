package com.rileytheriler.datataker.sync

import android.content.Context
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.rileytheriler.datataker.shared.SessionProtocol
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

data class WatchUiState(
    val connection: String = SessionProtocol.STATUS_OFFLINE,
    val sessionId: String? = null,
    val targetId: String? = null,
    val targetLabel: String = "No active session",
    val targetIcon: String = "⌚",
    val correct: Int = 0,
    val total: Int = 0,
    val percent: Int = 0,
    val queued: Int = 0,
    val error: String? = null,
    val acknowledgementCount: Long = 0,
    val appearanceMode: String = "system",
    val colorTheme: String = "teal",
    val highContrast: Boolean = false,
    val reduceMotion: Boolean = false,
)

class WatchSessionRepository(context: Context) : DataClient.OnDataChangedListener {
    private val appContext = context.applicationContext
    private val store = WatchStateStore(appContext)
    private val dataClient = Wearable.getDataClient(appContext)
    private val messageClient = Wearable.getMessageClient(appContext)
    private val nodeClient = Wearable.getNodeClient(appContext)
    private val mutableState = MutableStateFlow(toUiState(store.state()))
    private var lastTapAt = 0L
    private var acknowledgementCount = 0L

    val state: StateFlow<WatchUiState> = mutableState

    fun start() {
        dataClient.addListener(this)
        refreshFromDisk()
        requestState()
        flushQueue()
    }

    fun stop() {
        dataClient.removeListener(this)
    }

    fun record(result: String) {
        val current = mutableState.value
        val now = System.currentTimeMillis()
        if (now - lastTapAt < DOUBLE_TAP_GUARD_MS) return
        lastTapAt = now
        val sessionId = current.sessionId ?: return
        val targetId = current.targetId ?: return
        val operationId = UUID.randomUUID().toString()
        store.enqueue(
            JSONObject()
                .put("id", operationId)
                .put("session_id", sessionId)
                .put("type", "trial")
                .put("datapoint_id", operationId)
                .put("target_id", targetId)
                .put("result", result)
                .put("prompt_levels", JSONArray())
                .put("timestamp", Instant.now().toString())
                .put("source", "watch"),
        )
        mutableState.value = current.copy(
            connection = SessionProtocol.STATUS_SYNCING,
            queued = store.queue().length(),
            error = null,
        )
        flushQueue()
    }

    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED ||
                event.dataItem.uri.path != SessionProtocol.ACTIVE_SESSION_PATH) continue
            val json = DataMapItem.fromDataItem(event.dataItem).dataMap.getString("json") ?: continue
            val stateJson = JSONObject(json)
            store.saveState(stateJson)
            val acknowledgement = stateJson.optString("last_accepted_operation_id")
            if (acknowledgement.isNotBlank() && store.acknowledge(acknowledgement)) {
                acknowledgementCount += 1
            }
            mutableState.value = toUiState(stateJson)
            if (store.queue().length() > 0 && stateJson.optString("rejected_operation_id").isBlank()) {
                flushQueue()
            }
        }
    }

    private fun requestState() {
        nodeClient.connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    setConnection(SessionProtocol.STATUS_OFFLINE)
                } else {
                    nodes.forEach { node ->
                        messageClient.sendMessage(node.id, SessionProtocol.REQUEST_STATE_PATH, byteArrayOf())
                    }
                }
            }
            .addOnFailureListener { setConnection(SessionProtocol.STATUS_OFFLINE) }
    }

    private fun flushQueue() {
        val queue = store.queue()
        if (queue.length() == 0) {
            refreshFromDisk()
            return
        }
        val operation = queue.getJSONObject(0).toString().encodeToByteArray()
        setConnection(SessionProtocol.STATUS_SYNCING)
        nodeClient.connectedNodes
            .addOnSuccessListener { nodes ->
                val node = nodes.firstOrNull()
                if (node == null) {
                    setConnection(SessionProtocol.STATUS_OFFLINE)
                    return@addOnSuccessListener
                }
                messageClient.sendMessage(node.id, SessionProtocol.OPERATION_PATH, operation)
                    .addOnFailureListener { setConnection(SessionProtocol.STATUS_OFFLINE) }
            }
            .addOnFailureListener { setConnection(SessionProtocol.STATUS_OFFLINE) }
    }

    private fun refreshFromDisk() {
        mutableState.value = toUiState(store.state())
    }

    private fun setConnection(connection: String) {
        mutableState.value = mutableState.value.copy(
            connection = connection,
            queued = store.queue().length(),
        )
    }

    private fun toUiState(root: JSONObject): WatchUiState {
        val session = root.optJSONObject("session")
        val queueSize = store.queue().length()
        val error = root.optString("error").takeIf { it.isNotBlank() }
        if (session == null) {
            return WatchUiState(
                connection = root.optString("status", SessionProtocol.STATUS_OFFLINE),
                queued = queueSize,
                error = error,
                acknowledgementCount = acknowledgementCount,
                appearanceMode = root.optString("appearance_mode", "system"),
                colorTheme = root.optString("color_theme", "teal"),
                highContrast = root.optBoolean("high_contrast"),
                reduceMotion = root.optBoolean("reduce_motion"),
            )
        }
        val targetId = session.optString("active_target_id")
        val targets = session.optJSONArray("targets") ?: JSONArray()
        var activeTarget = JSONObject()
        for (index in 0 until targets.length()) {
            val candidate = targets.getJSONObject(index)
            if (candidate.optString("id") == targetId) activeTarget = candidate
        }
        val connection = when {
            error != null -> SessionProtocol.STATUS_FAILED
            queueSize > 0 -> SessionProtocol.STATUS_SYNCING
            else -> root.optString("status", SessionProtocol.STATUS_CONNECTED)
        }
        return WatchUiState(
            connection = connection,
            sessionId = session.optString("id").takeIf { it.isNotBlank() },
            targetId = targetId.takeIf { it.isNotBlank() },
            targetLabel = activeTarget.optString("label", "Target"),
            targetIcon = activeTarget.optString("icon", "🎯"),
            correct = session.optInt("correct"),
            total = session.optInt("total"),
            percent = session.optInt("percent"),
            queued = queueSize,
            error = error,
            acknowledgementCount = acknowledgementCount,
            appearanceMode = root.optString("appearance_mode", "system"),
            colorTheme = root.optString("color_theme", "teal"),
            highContrast = root.optBoolean("high_contrast"),
            reduceMotion = root.optBoolean("reduce_motion"),
        )
    }

    companion object {
        private const val DOUBLE_TAP_GUARD_MS = 180L
    }
}
