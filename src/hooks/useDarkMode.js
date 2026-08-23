/**
 * useDarkMode — shared dark-mode preference backed by a file (single source of
 * truth), so the app root and every screen stay consistent.
 *
 * Uses a module-level pub-sub so all hook instances (AppShell, SettingScreen,
 * etc.) stay in sync when any one of them calls toggle().
 */
import { useState, useCallback, useEffect } from "react";
import { Appearance } from "react-native";
import RNFS from "react-native-fs";

const DARK_MODE_FILE =
  (RNFS.DocumentDirectoryPath || "") + "/ripplemessenger/darkmode.txt";

// --- Module-level shared state + pub-sub ---
let currentMode = "dark";
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(currentMode));
}

async function _load() {
  try {
    if (await RNFS.exists(DARK_MODE_FILE)) {
      const v = await RNFS.readFile(DARK_MODE_FILE);
      if (v === "dark" || v === "light") return v;
    }
  } catch {
    // fall through to default
  }
  return "dark";
}

// NativeWind v4 (react-native-css-interop) resolves the :root / .dark:root
// CSS-variable palettes from Appearance's color scheme — the `dark` class on
// the root View alone does NOT switch them. So every mode change must also
// push the scheme into Appearance, or the palette silently follows the OS.
function applyScheme(mode) {
  try {
    Appearance.setColorScheme(mode === "dark" ? "dark" : "light");
  } catch {
    // non-critical
  }
}

async function _save(value) {
  try {
    const dir = DARK_MODE_FILE.substring(
      0,
      DARK_MODE_FILE.lastIndexOf("/") + 1,
    );
    if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
    await RNFS.writeFile(DARK_MODE_FILE, value);
  } catch {
    // non-critical
  }
}

export default function useDarkMode() {
  const [darkMode, setDarkMode] = useState(currentMode);

  useEffect(() => {
    let mounted = true;
    _load().then((v) => {
      if (mounted && v) {
        currentMode = v;
        setDarkMode(v);
        applyScheme(v);
      }
    });
    const unsub = (v) => {
      if (mounted) setDarkMode(v);
    };
    listeners.add(unsub);
    return () => {
      mounted = false;
      listeners.delete(unsub);
    };
  }, []);

  const isDark = darkMode === "dark";

  const toggle = useCallback(() => {
    const next = currentMode === "dark" ? "light" : "dark";
    currentMode = next;
    _save(next);
    applyScheme(next);
    notify();
  }, []);

  return { darkMode, isDark, toggle };
}
