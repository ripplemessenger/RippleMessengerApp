package app.ripplemessenger

import android.media.ToneGenerator
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native sound module using Android's ToneGenerator.
 * Mirrors Client's SoundUtil.js — 6 tone presets.
 *
 * ToneGenerator uses STREAM_MUSIC and generates tones programmatically,
 * similar to the Web Audio API approach in the desktop client.
 */
class SoundModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RMSound"

    private var generator: ToneGenerator? = null

    private fun getGenerator(): ToneGenerator? {
        if (generator == null) {
            try {
                generator = ToneGenerator(android.media.AudioManager.STREAM_MUSIC, 100)
            } catch (e: Exception) {
                return null
            }
        }
        return generator
    }

    /**
     * Play a notification tone.
     * @param tone One of: chime, pop, ping, bloop, ding, blip
     */
    @ReactMethod
    fun playTone(tone: String) {
        val gen = getGenerator() ?: return
        try {
            when (tone) {
                "chime" -> {
                    // Bright bell: TONE_DTMF_8 (880Hz)
                    gen.startTone(ToneGenerator.TONE_DTMF_8, 400)
                }
                "pop" -> {
                    // Short percussive: TONE_DTMF_4 (400Hz)
                    gen.startTone(ToneGenerator.TONE_DTMF_4, 100)
                }
                "ping" -> {
                    // High-pitched: TONE_DTMF_9 (900Hz)
                    gen.startTone(ToneGenerator.TONE_DTMF_9, 250)
                }
                "bloop" -> {
                    // Low double-tone: TONE_DTMF_3 (300Hz)
                    gen.startTone(ToneGenerator.TONE_DTMF_3, 300)
                }
                "ding" -> {
                    // Bell ding: TONE_DTMF_7 (700Hz)
                    gen.startTone(ToneGenerator.TONE_DTMF_7, 500)
                }
                "blip" -> {
                    // Short blip: TONE_DTMF_5 (500Hz)
                    gen.startTone(ToneGenerator.TONE_DTMF_5, 60)
                }
                else -> {
                    // Default: TONE_DTMF_8
                    gen.startTone(ToneGenerator.TONE_DTMF_8, 400)
                }
            }
        } catch (e: Exception) {
            // Fail silently — sound is non-critical
        }
    }

    override fun invalidate() {
        super.invalidate()
        try {
            generator?.release()
        } catch (e: Exception) {
            // ignore
        }
        generator = null
    }
}
