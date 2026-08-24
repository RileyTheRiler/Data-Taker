package com.rileytheriler.datataker.sync

import android.content.Context
import android.content.ContentValues
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import org.json.JSONObject

class WebAppBridge(context: Context) {
    private val appContext = context.applicationContext
    private val authority = SessionAuthority(appContext)

    @JavascriptInterface
    fun initializeSession(payload: String): String = safely {
        authority.initialize(payload).also {
            PhoneStatePublisher.publish(appContext, authority.watchState().toString())
        }
    }

    @JavascriptInterface
    fun applyOperation(operation: String): String = safely {
        val response = authority.applyOperation(operation)
        val operationId = response.optString("operation_id").takeIf { it.isNotBlank() }
        PhoneStatePublisher.publish(appContext, authority.watchState(operationId).toString())
        response
    }

    @JavascriptInterface
    fun getSession(sessionId: String): String = safely { authority.getSession(sessionId) }

    @JavascriptInterface
    fun updateSessionUi(payload: String): String = safely {
        authority.updateUi(payload).also {
            PhoneStatePublisher.publish(appContext, authority.watchState().toString())
        }
    }

    @JavascriptInterface
    fun updatePreferences(payload: String): String = safely {
        authority.updatePreferences(payload).also {
            PhoneStatePublisher.publish(appContext, authority.watchState().toString())
        }
    }

    @JavascriptInterface
    fun endSession(payload: String): String = safely {
        authority.end(payload).also {
            PhoneStatePublisher.publish(appContext, authority.watchState().toString())
        }
    }

    @JavascriptInterface
    fun saveBackup(filename: String, content: String): Boolean {
        return try {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Data Taker")
            }
            val uri = appContext.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: return false
            appContext.contentResolver.openOutputStream(uri)?.use { stream ->
                stream.write(content.encodeToByteArray())
            } ?: return false
            true
        } catch (_error: Exception) {
            false
        }
    }

    private inline fun safely(block: () -> JSONObject): String = try {
        block().toString()
    } catch (error: Exception) {
        JSONObject()
            .put("accepted", false)
            .put("error", error.message ?: "The phone companion could not process the action.")
            .toString()
    }
}
