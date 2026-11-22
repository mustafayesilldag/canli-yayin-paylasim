package com.mystic.sosyalkilit

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast

class BlockerService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private var current: String? = null

    // Her saniye: ön plandaki uygulama hedefse ve ekran açıksa süreyi say
    private val tick = object : Runnable {
        override fun run() {
            val app = current?.let { Limits.appKey(it) }
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (app != null && pm.isInteractive) {
                Usage.add(this@BlockerService, app, 1)
                if (Usage.isBlocked(this@BlockerService, app)) block(app)
            }
            handler.postDelayed(this, 1000)
        }
    }

    override fun onServiceConnected() {
        handler.post(tick)
    }

    override fun onAccessibilityEvent(e: AccessibilityEvent) {
        if (e.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = e.packageName?.toString() ?: return
        // Bildirim paneli / klavye açılınca sayım kesilmesin
        if (pkg in IGNORED || pkg.contains("inputmethod") || pkg.contains("keyboard")) return
        current = pkg
        Limits.appKey(pkg)?.let { if (Usage.isBlocked(this, it)) block(it) }
    }

    private fun block(app: String) {
        performGlobalAction(GLOBAL_ACTION_HOME)
        current = null
        Toast.makeText(this, "$app için bugünkü süre doldu ⛔", Toast.LENGTH_LONG).show()
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    companion object {
        private val IGNORED = setOf("com.android.systemui", "com.mystic.sosyalkilit")
    }
}
