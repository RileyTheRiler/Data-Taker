package com.rileytheriler.datataker.sync

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import com.rileytheriler.datataker.shared.SessionProtocol
import org.json.JSONObject

class WatchDataLayerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        val store = WatchStateStore(applicationContext)
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED ||
                event.dataItem.uri.path != SessionProtocol.ACTIVE_SESSION_PATH) continue
            val json = DataMapItem.fromDataItem(event.dataItem).dataMap.getString("json") ?: continue
            val state = JSONObject(json)
            store.saveState(state)
            state.optString("last_accepted_operation_id")
                .takeIf { it.isNotBlank() }
                ?.let(store::acknowledge)
        }
    }
}
