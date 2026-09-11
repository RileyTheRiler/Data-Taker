package com.rileytheriler.datataker.sync

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WatchStateStoreTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("data_taker_watch", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun offlineQueueSurvivesProcessRecreationAndKeepsActionOrder() {
        val firstStore = WatchStateStore(context)
        firstStore.enqueue(operation("operation-1"))
        firstStore.enqueue(operation("operation-2"))

        val reopened = WatchStateStore(context).queue()

        assertEquals(2, reopened.length())
        assertEquals("operation-1", reopened.getJSONObject(0).getString("id"))
        assertEquals("operation-2", reopened.getJSONObject(1).getString("id"))
    }

    @Test
    fun delayedOrOutOfOrderAcknowledgementRemovesOnlyItsOperation() {
        val store = WatchStateStore(context)
        store.enqueue(operation("operation-1"))
        store.enqueue(operation("operation-2"))

        assertTrue(store.acknowledge("operation-2"))
        assertEquals(1, store.queue().length())
        assertEquals("operation-1", store.queue().getJSONObject(0).getString("id"))
        assertFalse(store.acknowledge("unknown-operation"))
        assertEquals(1, store.queue().length())
    }

    private fun operation(id: String) = JSONObject()
        .put("id", id)
        .put("session_id", "session-1")
        .put("type", "trial")
}
