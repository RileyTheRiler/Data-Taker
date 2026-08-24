package com.rileytheriler.datataker.sync

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * The phone-side transaction boundary for an active session.
 *
 * Every caller—phone WebView or paired watch—submits the same operation shape.
 * The synchronized, durable commit and accepted-operation ledger make retries
 * idempotent and serialize simultaneous phone/watch taps.
 */
class SessionAuthority(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    @Synchronized
    fun initialize(payloadText: String): JSONObject {
        val payload = JSONObject(payloadText)
        val session = JSONObject(payload.getJSONObject("session").toString())
        require(session.optString("id").isNotBlank()) { "Session ID is required." }
        require(session.isNull("end_time")) { "Only an active session can be shared with the watch." }

        preferences.edit()
            .putString(KEY_SESSION, session.toString())
            .putString(KEY_CUES, payload.optJSONArray("cues")?.toString() ?: "[]")
            .putString(KEY_ICONS, payload.optJSONObject("target_icons")?.toString() ?: "{}")
            .putString(KEY_APPEARANCE, payload.optJSONObject("preferences")?.toString() ?: "{}")
            .putLong(KEY_REVISION, preferences.getLong(KEY_REVISION, 0L) + 1L)
            .commit()

        return accepted(session, operationId = null, duplicate = false)
    }

    @Synchronized
    fun getSession(sessionId: String): JSONObject {
        val session = activeSession() ?: return rejected("No active phone-owned session.")
        if (session.optString("id") != sessionId) return rejected("The active session does not match.")
        return accepted(
            session,
            session.optString("last_operation_id").takeIf { it.isNotBlank() },
            duplicate = false,
        )
    }

    @Synchronized
    fun applyOperation(operationText: String): JSONObject {
        val operation = JSONObject(operationText)
        val operationId = operation.optString("id").trim()
        val sessionId = operation.optString("session_id").trim()
        require(operationId.isNotEmpty()) { "The operation has no stable ID." }
        require(sessionId.isNotEmpty()) { "The operation has no session ID." }

        val session = activeSession() ?: return rejected("No active phone-owned session.")
        if (session.optString("id") != sessionId) return rejected("The active session does not match.")
        if (!session.isNull("end_time")) return rejected("The session has ended.")

        val acceptedIds = session.optJSONArray("accepted_operation_ids") ?: JSONArray()
        if (acceptedIds.contains(operationId)) {
            return accepted(session, operationId, duplicate = true)
        }

        when (operation.optString("type")) {
            "trial" -> applyTrial(session, operation, operationId)
            "undo" -> applyUndo(session, operation)
            else -> return rejected("Unsupported operation type.")
        }

        acceptedIds.put(operationId)
        session.put("accepted_operation_ids", acceptedIds.tail(256))
        session.put("last_operation_id", operationId)
        val committed = preferences.edit()
            .putString(KEY_SESSION, session.toString())
            .putLong(KEY_REVISION, preferences.getLong(KEY_REVISION, 0L) + 1L)
            .commit()
        if (!committed) return rejected("The phone could not durably save the operation.")
        return accepted(session, operationId, duplicate = false)
    }

    @Synchronized
    fun updateUi(payloadText: String): JSONObject {
        val payload = JSONObject(payloadText)
        val session = activeSession() ?: return rejected("No active phone-owned session.")
        if (session.optString("id") != payload.optString("session_id")) {
            return rejected("The active session does not match.")
        }
        val targetId = payload.optString("active_target_id")
        if (targetId.isNotBlank() &&
            !(session.optJSONArray("target_ids") ?: JSONArray()).contains(targetId)) {
            return rejected("Target is not part of this session.")
        }
        session.put("active_target_id", targetId)
        preferences.edit()
            .putString(KEY_SESSION, session.toString())
            .putLong(KEY_REVISION, preferences.getLong(KEY_REVISION, 0L) + 1L)
            .commit()
        return accepted(session, operationId = null, duplicate = false)
    }

    @Synchronized
    fun updatePreferences(payloadText: String): JSONObject {
        val session = activeSession() ?: return rejected("No active phone-owned session.")
        val value = JSONObject(payloadText)
        preferences.edit()
            .putString(KEY_APPEARANCE, value.toString())
            .putLong(KEY_REVISION, preferences.getLong(KEY_REVISION, 0L) + 1L)
            .commit()
        return accepted(session, operationId = null, duplicate = false)
    }

    @Synchronized
    fun end(payloadText: String): JSONObject {
        val payload = JSONObject(payloadText)
        val session = activeSession() ?: return rejected("No active phone-owned session.")
        if (session.optString("id") != payload.optString("session_id")) {
            return rejected("The active session does not match.")
        }
        session.put("end_time", payload.optString("end_time"))
        preferences.edit()
            .putString(KEY_SESSION, session.toString())
            .putLong(KEY_REVISION, preferences.getLong(KEY_REVISION, 0L) + 1L)
            .commit()
        return accepted(
            session,
            session.optString("last_operation_id").takeIf { it.isNotBlank() },
            duplicate = false,
        )
    }

    @Synchronized
    fun watchState(
        lastAcceptedOperationId: String? = null,
        rejectedOperationId: String? = null,
        error: String? = null,
    ): JSONObject {
        val session = activeSession()
        val state = JSONObject()
            .put("schema_version", 1)
            .put("revision", preferences.getLong(KEY_REVISION, 0L))
            .put("status", if (error == null) "connected" else "failed")
            .put("last_accepted_operation_id", lastAcceptedOperationId ?: JSONObject.NULL)
            .put("rejected_operation_id", rejectedOperationId ?: JSONObject.NULL)
            .put("error", error ?: JSONObject.NULL)
        val appearance = JSONObject(preferences.getString(KEY_APPEARANCE, "{}") ?: "{}")
        state.put("appearance_mode", appearance.optString("appearance_mode", "system"))
            .put("color_theme", appearance.optString("color_theme", "teal"))
            .put("high_contrast", appearance.optBoolean("high_contrast"))
            .put("reduce_motion", appearance.optBoolean("reduce_motion"))

        if (session == null || !session.isNull("end_time")) {
            return state.put("session", JSONObject.NULL)
        }

        val datapoints = session.optJSONArray("datapoints") ?: JSONArray()
        val snapshots = session.optJSONObject("target_snapshots") ?: JSONObject()
        val icons = JSONObject(preferences.getString(KEY_ICONS, "{}") ?: "{}")
        val targetIds = session.optJSONArray("target_ids") ?: JSONArray()
        val targets = JSONArray()
        var overallCorrect = 0

        for (index in 0 until targetIds.length()) {
            val targetId = targetIds.getString(index)
            val snapshot = snapshots.optJSONObject(targetId) ?: JSONObject().put("label", "Target")
            var correct = 0
            var total = 0
            for (pointIndex in 0 until datapoints.length()) {
                val point = datapoints.getJSONObject(pointIndex)
                if (point.optString("target_id") == targetId) {
                    total += 1
                    if (point.optString("result") == "+") correct += 1
                }
            }
            overallCorrect += correct
            targets.put(
                JSONObject()
                    .put("id", targetId)
                    .put("label", snapshot.optString("label", "Target"))
                    .put("icon", icons.optString(targetId, "🎯"))
                    .put("correct", correct)
                    .put("total", total)
                    .put("percent", if (total == 0) 0 else (100 * correct / total)),
            )
        }

        val activeTargetId = session.optString("active_target_id")
            .takeIf { it.isNotBlank() && targetIds.contains(it) }
            ?: targetIds.optString(0)
        val sessionState = JSONObject()
            .put("id", session.getString("id"))
            .put("active_target_id", activeTargetId)
            .put("targets", targets)
            .put("cues", JSONArray(preferences.getString(KEY_CUES, "[]") ?: "[]"))
            .put("correct", overallCorrect)
            .put("total", datapoints.length())
            .put("percent", if (datapoints.length() == 0) 0 else (100 * overallCorrect / datapoints.length()))
        return state.put("session", sessionState)
    }

    private fun applyTrial(session: JSONObject, operation: JSONObject, operationId: String) {
        val targetId = operation.optString("target_id")
        require((session.optJSONArray("target_ids") ?: JSONArray()).contains(targetId)) {
            "Target is not part of this session."
        }
        val result = operation.optString("result")
        require(result == "+" || result == "-") { "Result must be '+' or '-'." }

        val datapoints = session.optJSONArray("datapoints") ?: JSONArray()
        val datapointId = operation.optString("datapoint_id", operationId)
        for (index in 0 until datapoints.length()) {
            val existing = datapoints.getJSONObject(index)
            if (existing.optString("id") == datapointId || existing.optString("operation_id") == operationId) {
                return
            }
        }

        val allowedCues = JSONArray(preferences.getString(KEY_CUES, "[]") ?: "[]")
        val requested = operation.optJSONArray("prompt_levels") ?: JSONArray()
        val prompts = JSONArray()
        for (index in 0 until requested.length()) {
            val cue = requested.optString(index)
            if (allowedCues.contains(cue)) prompts.put(cue)
        }
        datapoints.put(
            JSONObject()
                .put("id", datapointId)
                .put("operation_id", operationId)
                .put("target_id", targetId)
                .put("result", result)
                .put("prompt_levels", prompts)
                .put("timestamp", operation.optString("timestamp"))
                .put("source", if (operation.optString("source") == "watch") "watch" else "phone"),
        )
        session.put("datapoints", datapoints)
    }

    private fun applyUndo(session: JSONObject, operation: JSONObject) {
        val datapointId = operation.optString("datapoint_id")
        val datapoints = session.optJSONArray("datapoints") ?: JSONArray()
        val kept = JSONArray()
        var found = false
        for (index in 0 until datapoints.length()) {
            val point = datapoints.getJSONObject(index)
            if (point.optString("id") == datapointId) found = true else kept.put(point)
        }
        require(found) { "Trial not found." }
        session.put("datapoints", kept)
    }

    private fun activeSession(): JSONObject? {
        val raw = preferences.getString(KEY_SESSION, null) ?: return null
        return JSONObject(raw)
    }

    private fun accepted(session: JSONObject, operationId: String?, duplicate: Boolean) = JSONObject()
        .put("accepted", true)
        .put("duplicate", duplicate)
        .put("operation_id", operationId ?: JSONObject.NULL)
        .put("session", session)

    private fun rejected(message: String) = JSONObject()
        .put("accepted", false)
        .put("error", message)

    private fun JSONArray.contains(value: String): Boolean {
        for (index in 0 until length()) if (optString(index) == value) return true
        return false
    }

    private fun JSONArray.tail(limit: Int): JSONArray {
        val result = JSONArray()
        val start = (length() - limit).coerceAtLeast(0)
        for (index in start until length()) result.put(get(index))
        return result
    }

    companion object {
        private const val PREFERENCES = "data_taker_authority"
        private const val KEY_SESSION = "active_session"
        private const val KEY_CUES = "active_cues"
        private const val KEY_ICONS = "target_icons"
        private const val KEY_APPEARANCE = "appearance"
        private const val KEY_REVISION = "revision"
    }
}
