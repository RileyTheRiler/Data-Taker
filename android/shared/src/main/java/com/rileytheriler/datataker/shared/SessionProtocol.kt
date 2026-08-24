package com.rileytheriler.datataker.shared

object SessionProtocol {
    const val PACKAGE_NAME = "com.rileytheriler.datataker"
    const val ACTIVE_SESSION_PATH = "/data-taker/active-session"
    const val OPERATION_PATH = "/data-taker/operation"
    const val REQUEST_STATE_PATH = "/data-taker/request-state"
    const val SESSION_UPDATED_ACTION = "$PACKAGE_NAME.SESSION_UPDATED"

    const val STATUS_CONNECTED = "connected"
    const val STATUS_SYNCING = "syncing"
    const val STATUS_OFFLINE = "offline"
    const val STATUS_FAILED = "failed"
}
