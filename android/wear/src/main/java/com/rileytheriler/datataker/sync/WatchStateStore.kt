package com.rileytheriler.datataker.sync

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class WatchStateStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    @Synchronized
    fun state(): JSONObject = JSONObject(preferences.getString(KEY_STATE, EMPTY_STATE) ?: EMPTY_STATE)

    @Synchronized
    fun saveState(state: JSONObject) {
        preferences.edit().putString(KEY_STATE, state.toString()).commit()
    }

    @Synchronized
    fun queue(): JSONArray = JSONArray(preferences.getString(KEY_QUEUE, "[]") ?: "[]")

    @Synchronized
    fun enqueue(operation: JSONObject) {
        val queue = queue().put(operation)
        preferences.edit().putString(KEY_QUEUE, queue.toString()).commit()
    }

    @Synchronized
    fun acknowledge(operationId: String): Boolean {
        val queue = queue()
        val remaining = JSONArray()
        var found = false
        for (index in 0 until queue.length()) {
            val operation = queue.getJSONObject(index)
            if (!found && operation.optString("id") == operationId) {
                found = true
            } else if (found || operation.optString("id") != operationId) {
                remaining.put(operation)
            }
        }
        if (found) preferences.edit().putString(KEY_QUEUE, remaining.toString()).commit()
        return found
    }

    companion object {
        private const val PREFERENCES = "data_taker_watch"
        private const val KEY_STATE = "state"
        private const val KEY_QUEUE = "operation_queue"
        private const val EMPTY_STATE = "{\"schema_version\":1,\"status\":\"offline\",\"session\":null}"
    }
}
