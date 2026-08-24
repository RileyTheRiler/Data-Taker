package com.rileytheriler.datataker.sync

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.rileytheriler.datataker.shared.SessionProtocol
import org.json.JSONObject

class PhoneDataLayerService : WearableListenerService() {
    private val authority by lazy { SessionAuthority(applicationContext) }

    override fun onMessageReceived(event: MessageEvent) {
        when (event.path) {
            SessionProtocol.REQUEST_STATE_PATH -> publish(authority.watchState())
            SessionProtocol.OPERATION_PATH -> applyWatchOperation(event.data.decodeToString())
        }
    }

    private fun applyWatchOperation(operationText: String) {
        val operationId = runCatching { JSONObject(operationText).optString("id") }.getOrDefault("")
        try {
            val response = authority.applyOperation(operationText)
            if (!response.optBoolean("accepted")) {
                publish(authority.watchState(rejectedOperationId = operationId, error = response.optString("error")))
                return
            }
            publish(authority.watchState(lastAcceptedOperationId = operationId))
        } catch (error: Exception) {
            publish(authority.watchState(rejectedOperationId = operationId, error = error.message ?: "Action failed."))
        }
    }

    private fun publish(state: JSONObject) {
        PhoneStatePublisher.publish(applicationContext, state.toString())
    }
}
