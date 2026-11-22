package com.mystic.sosyalkilit

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {

    private lateinit var info: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        info = TextView(this).apply { textSize = 20f }
        val btn = Button(this).apply {
            text = "Erişilebilirlik iznini aç"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
            addView(info)
            addView(btn)
        })
    }

    override fun onResume() {
        super.onResume()
        fun m(s: Int) = "${s / 60} dk"
        val sb = StringBuilder("Bugün kalan süre\n\n")
        Limits.APPS.forEach { app ->
            val left = (Limits.PER_APP_SEC - Usage.get(this, app)).coerceAtLeast(0)
            sb.append("$app: ${m(left)}\n")
        }
        val totalLeft = (Limits.TOTAL_SEC - Usage.total(this)).coerceAtLeast(0)
        sb.append("\nToplam: ${m(totalLeft)}\n")
        info.text = sb.toString()
    }
}
