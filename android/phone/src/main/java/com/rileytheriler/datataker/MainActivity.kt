package com.rileytheriler.datataker

import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import com.rileytheriler.datataker.shared.SessionProtocol
import com.rileytheriler.datataker.sync.WebAppBridge

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var pendingFileChoice: ValueCallback<Array<android.net.Uri>>? = null

    private val filePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        pendingFileChoice?.onReceiveValue(uri?.let { arrayOf(it) })
        pendingFileChoice = null
    }

    private val sessionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            webView.post {
                webView.evaluateJavascript(
                    "window.DataTakerWatchSync && window.DataTakerWatchSync();",
                    null,
                )
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWebView()
        setContentView(webView)
        registerSessionReceiver()
        showStorageBoundaryOnce()
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            addJavascriptInterface(WebAppBridge(this@MainActivity), "DataTakerNative")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView,
                    filePathCallback: ValueCallback<Array<android.net.Uri>>,
                    fileChooserParams: FileChooserParams,
                ): Boolean {
                    pendingFileChoice?.onReceiveValue(null)
                    pendingFileChoice = filePathCallback
                    filePicker.launch("application/json")
                    return true
                }
            }
            loadUrl(APP_URL)
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    }

    private fun registerSessionReceiver() {
        ContextCompat.registerReceiver(
            this,
            sessionReceiver,
            IntentFilter(SessionProtocol.SESSION_UPDATED_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    private fun showStorageBoundaryOnce() {
        val preferences = getSharedPreferences("companion_onboarding", MODE_PRIVATE)
        if (preferences.getBoolean("storage_boundary_acknowledged", false)) return
        AlertDialog.Builder(this)
            .setTitle("Import your existing Data Taker data")
            .setMessage(
                "The Android companion cannot read Samsung Internet or Chrome storage. " +
                    "Export a JSON backup from your current browser app, then import it in this app " +
                    "before starting watch-controlled sessions. This avoids an unnoticed second dataset.",
            )
            .setPositiveButton("I understand") { _, _ ->
                preferences.edit().putBoolean("storage_boundary_acknowledged", true).apply()
            }
            .setCancelable(false)
            .show()
    }

    override fun onDestroy() {
        unregisterReceiver(sessionReceiver)
        pendingFileChoice?.onReceiveValue(null)
        webView.removeJavascriptInterface("DataTakerNative")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val APP_URL = "https://appassets.androidplatform.net/index.html"
    }
}
