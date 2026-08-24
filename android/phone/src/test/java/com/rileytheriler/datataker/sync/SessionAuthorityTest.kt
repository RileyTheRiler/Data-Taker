package com.rileytheriler.datataker.sync

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SessionAuthorityTest {
    private lateinit var authority: SessionAuthority

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.getSharedPreferences("data_taker_authority", Context.MODE_PRIVATE).edit().clear().commit()
        authority = SessionAuthority(context)
        authority.initialize(
            JSONObject()
                .put("session", baseSession())
                .put("cues", JSONArray().put("Visual"))
                .put("target_icons", JSONObject().put("target-1", "🎯"))
                .toString(),
        )
    }

    @Test
    fun duplicateOperationIsAcknowledgedWithoutDuplicatingTrial() {
        val operation = trial("operation-1", "+")

        val first = authority.applyOperation(operation.toString())
        val retry = authority.applyOperation(operation.toString())

        assertTrue(first.getBoolean("accepted"))
        assertFalse(first.getBoolean("duplicate"))
        assertTrue(retry.getBoolean("duplicate"))
        assertEquals(1, retry.getJSONObject("session").getJSONArray("datapoints").length())
    }

    @Test
    fun delayedRetryAfterAnotherOperationCannotChangeOrderOrCounts() {
        val first = trial("operation-1", "+")
        val second = trial("operation-2", "-")

        authority.applyOperation(first.toString())
        authority.applyOperation(second.toString())
        authority.applyOperation(first.toString())

        val session = authority.getSession("session-1").getJSONObject("session")
        assertEquals("operation-1", session.getJSONArray("datapoints").getJSONObject(0).getString("id"))
        assertEquals("operation-2", session.getJSONArray("datapoints").getJSONObject(1).getString("id"))
        assertEquals(2, session.getJSONArray("datapoints").length())
    }

    @Test
    fun simultaneousPhoneAndWatchWritesCannotCorruptCounts() {
        val phone = trial("phone-operation", "+").put("source", "phone")
        val watch = trial("watch-operation", "-")
        val secondAuthority = SessionAuthority(ApplicationProvider.getApplicationContext())
        val first = Thread { authority.applyOperation(phone.toString()) }
        val second = Thread { secondAuthority.applyOperation(watch.toString()) }

        first.start()
        second.start()
        first.join()
        second.join()

        val session = authority.getSession("session-1").getJSONObject("session")
        val datapoints = session.getJSONArray("datapoints")
        assertEquals(2, datapoints.length())
        assertEquals(2, session.getJSONArray("accepted_operation_ids").length())
    }

    @Test
    fun watchStateExcludesClientLabelAndAcknowledgesOnlyCommittedOperation() {
        authority.applyOperation(trial("operation-1", "+").toString())

        val state = authority.watchState(lastAcceptedOperationId = "operation-1")

        assertEquals("operation-1", state.getString("last_accepted_operation_id"))
        assertFalse(state.toString().contains("Client A"))
        assertEquals(1, state.getJSONObject("session").getInt("total"))
    }

    private fun baseSession() = JSONObject()
        .put("id", "session-1")
        .put("client_label", "Client A")
        .put("target_ids", JSONArray().put("target-1"))
        .put(
            "target_snapshots",
            JSONObject().put("target-1", JSONObject().put("id", "target-1").put("label", "Long target label")),
        )
        .put("start_time", "2026-08-24T12:00:00Z")
        .put("end_time", JSONObject.NULL)
        .put("datapoints", JSONArray())

    private fun trial(id: String, result: String) = JSONObject()
        .put("id", id)
        .put("session_id", "session-1")
        .put("type", "trial")
        .put("datapoint_id", id)
        .put("target_id", "target-1")
        .put("result", result)
        .put("prompt_levels", JSONArray().put("Visual"))
        .put("timestamp", "2026-08-24T12:00:00Z")
        .put("source", "watch")
}
