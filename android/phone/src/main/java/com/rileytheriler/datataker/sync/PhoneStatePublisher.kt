package com.rileytheriler.datataker.sync

import android.content.Context
import android.content.Intent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.rileytheriler.datataker.shared.SessionProtocol

object PhoneStatePublisher {
    fun publish(context: Context, stateJson: String) {
        val request = PutDataMapRequest.create(SessionProtocol.ACTIVE_SESSION_PATH).run {
            dataMap.putString("json", stateJson)
            dataMap.putLong("published_at", System.currentTimeMillis())
            asPutDataRequest().setUrgent()
        }
        Wearable.getDataClient(context).putDataItem(request)
        context.sendBroadcast(
            Intent(SessionProtocol.SESSION_UPDATED_ACTION).setPackage(context.packageName),
        )
    }
}
