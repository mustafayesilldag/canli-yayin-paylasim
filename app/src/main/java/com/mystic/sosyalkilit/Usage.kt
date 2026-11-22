package com.mystic.sosyalkilit

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Limits {
    const val PER_APP_SEC = 45 * 60   // uygulama başı 45 dk
    const val TOTAL_SEC = 90 * 60     // toplam 90 dk

    private val PACKAGES = mapOf(
        "com.zhiliaoapp.musically" to "TikTok",
        "com.ss.android.ugc.trill" to "TikTok",
        "com.zhiliaoapp.musically.go" to "TikTok",
        "com.instagram.android" to "Instagram",
        "com.instagram.lite" to "Instagram",
    )
    val APPS = listOf("TikTok", "Instagram")

    fun appKey(pkg: String): String? = PACKAGES[pkg]
}

object Usage {
    private fun prefs(c: Context) = c.getSharedPreferences("usage", Context.MODE_PRIVATE)
    private fun today() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    private fun key(app: String) = "${today()}_$app"

    fun get(c: Context, app: String) = prefs(c).getInt(key(app), 0)
    fun total(c: Context) = Limits.APPS.sumOf { get(c, it) }

    fun add(c: Context, app: String, sec: Int) {
        prefs(c).edit().putInt(key(app), get(c, app) + sec).apply()
    }

    fun isBlocked(c: Context, app: String) =
        get(c, app) >= Limits.PER_APP_SEC || total(c) >= Limits.TOTAL_SEC
}
