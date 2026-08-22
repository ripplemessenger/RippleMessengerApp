/**
 * Play notification sounds using Android's native ToneGenerator.
 * Mirrors Client's SoundUtil.js — 6 tone presets (chime/pop/ping/bloop/ding/blip) + none.
 *
 * Uses the RMSound native module (SoundModule.kt) which wraps Android's ToneGenerator API.
 */
import { NativeModules } from "react-native";

import { getSettingString } from "./SettingsUtil";

const RMSound = NativeModules.RMSound;

/**
 * Play the configured notification sound.
 * Reads the tone from settings (default: 'chime').
 * Fails silently if sound is disabled or playback errors.
 */
export async function playNotificationSound() {
   try {
      const tone = await getSettingString("messageSound", "chime");
      if (tone === "none") return;
      if (RMSound && typeof RMSound.playTone === "function") {
         RMSound.playTone(tone);
      }
   } catch {
      // fail silently — sound is non-critical
   }
}

/**
 * Play a specific tone by name (for preview in settings).
 * @param {string} tone - One of: chime, pop, ping, bloop, ding, blip
 */
export function previewSound(tone) {
   if (tone === "none") return;
   try {
      if (RMSound && typeof RMSound.playTone === "function") {
         RMSound.playTone(tone);
      }
   } catch {
      // fail silently
   }
}
