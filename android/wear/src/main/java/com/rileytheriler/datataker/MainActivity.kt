package com.rileytheriler.datataker

import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import com.rileytheriler.datataker.shared.SessionProtocol
import com.rileytheriler.datataker.sync.WatchSessionRepository
import com.rileytheriler.datataker.sync.WatchStateStore
import com.rileytheriler.datataker.sync.WatchUiState
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var repository: WatchSessionRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.DEBUG && intent.getBooleanExtra("screenshot_demo", false)) {
            WatchStateStore(applicationContext).saveState(screenshotDemoState())
        }
        repository = WatchSessionRepository(applicationContext)
        setContent {
            val state by repository.state.collectAsStateWithLifecycle()
            DataTakerWatchScreen(
                state = state,
                recordCorrect = { repository.record("+") },
                recordIncorrect = { repository.record("-") },
                acknowledge = ::confirmWithHaptic,
            )
        }
    }

    override fun onStart() {
        super.onStart()
        repository.start()
    }

    override fun onStop() {
        repository.stop()
        super.onStop()
    }

    private fun confirmWithHaptic() {
        val vibrator = getSystemService(Vibrator::class.java) ?: return
        vibrator.vibrate(VibrationEffect.createOneShot(32L, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    private fun screenshotDemoState() = JSONObject()
        .put("schema_version", 1)
        .put("status", SessionProtocol.STATUS_CONNECTED)
        .put("session", JSONObject()
            .put("id", "screenshot-session")
            .put("active_target_id", "target-1")
            .put("correct", 7)
            .put("total", 10)
            .put("percent", 70)
            .put("targets", JSONArray().put(JSONObject()
                .put("id", "target-1")
                .put("label", "Initial /r/ in conversational sentences")
                .put("icon", "🗣️"))))
}

@Composable
private fun DataTakerWatchScreen(
    state: WatchUiState,
    recordCorrect: () -> Unit,
    recordIncorrect: () -> Unit,
    acknowledge: () -> Unit,
) {
    LaunchedEffect(state.acknowledgementCount) {
        if (state.acknowledgementCount > 0) acknowledge()
    }

    val dark = when (state.appearanceMode) {
        "light" -> false
        "dark" -> true
        else -> isSystemInDarkTheme()
    }
    val background = if (dark) Color.Black else Color(0xFFF8FAF9)
    val foreground = if (dark) Color.White else Color(0xFF121414)
    val accent = when (state.colorTheme) {
        "ocean" -> Color(0xFF4FC3F7)
        "violet" -> Color(0xFFB39DDB)
        "rose" -> Color(0xFFF48FB1)
        else -> Color(0xFF4DB6AC)
    }

    MaterialTheme {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .background(background),
        ) {
            val safePadding = maxWidth * 0.09f
            val buttonSize = if (maxWidth < 225.dp) 64.dp else 72.dp
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = safePadding, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                StatusLine(state, foreground)

                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = state.targetIcon,
                        fontSize = 24.sp,
                        modifier = Modifier.semantics { contentDescription = "Target icon" },
                        color = accent,
                    )
                    Text(
                        text = state.targetLabel,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        lineHeight = 16.sp,
                        color = foreground,
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        text = "${state.percent}%  •  ${state.correct}/${state.total}",
                        textAlign = TextAlign.Center,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (state.highContrast) foreground else accent,
                        modifier = Modifier.semantics {
                            contentDescription =
                                "${state.percent} percent, ${state.correct} correct of ${state.total} trials"
                        },
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TrialButton(
                        symbol = "−",
                        label = "Incorrect",
                        color = Color(0xFFB3261E),
                        size = buttonSize,
                        enabled = state.sessionId != null,
                        foreground = foreground,
                        onClick = recordIncorrect,
                    )
                    TrialButton(
                        symbol = "+",
                        label = "Correct",
                        color = Color(0xFF137333),
                        size = buttonSize,
                        enabled = state.sessionId != null,
                        foreground = foreground,
                        onClick = recordCorrect,
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusLine(state: WatchUiState, foreground: Color) {
    val (label, color) = when (state.connection) {
        SessionProtocol.STATUS_CONNECTED -> "Connected" to Color(0xFF81C995)
        SessionProtocol.STATUS_SYNCING -> "Syncing${if (state.queued > 0) " • ${state.queued}" else ""}" to Color(0xFFFDD663)
        SessionProtocol.STATUS_FAILED -> "Not saved" to Color(0xFFF28B82)
        else -> "Offline${if (state.queued > 0) " • ${state.queued} queued" else ""}" to Color(0xFFFDD663)
    }
    Text(
        text = state.error?.let { "$label: $it" } ?: label,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        color = if (state.highContrast && state.connection == SessionProtocol.STATUS_CONNECTED) foreground else color,
        fontSize = 11.sp,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
private fun TrialButton(
    symbol: String,
    label: String,
    color: Color,
    size: androidx.compose.ui.unit.Dp,
    enabled: Boolean,
    foreground: Color,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .semantics {
                    role = Role.Button
                    contentDescription = "Record $label response"
                },
            colors = ButtonDefaults.buttonColors(containerColor = color),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(symbol, fontSize = 34.sp, fontWeight = FontWeight.Bold)
            }
        }
        Text(label, fontSize = 10.sp, color = foreground)
    }
}
