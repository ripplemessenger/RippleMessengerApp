/**
 * useDarkMode — shared dark-mode preference backed by a file (single source of
 * truth), so the app root and every screen stay consistent.
 *
 * Values: "auto" | "dark" | "light"
 *   - "auto"  → follows the system color scheme (useColorScheme)
 *   - "dark"  → always dark
 *   - "light" → always light
 *
 * The preference is persisted to ripplemessenger/darkmode.txt so it survives
 * app restarts. The `dark` class itself is applied once on the app root View
 * (App.tsx), which switches the CSS-variable palette for the whole app.
 */
import { useState, useCallback, useEffect } from "react";
import { useColorScheme } from "react-native";
import RNFS from "react-native-fs";
const DARK_MODE_FILE =
  (RNFS.DocumentDirectoryPath || "") + "/ripplemessenger/darkmode.txt";

async function _load() {
  try {
    if (await RNFS.exists(DARK_MODE_FILE)) {
      return await RNFS.readFile(DARK_MODE_FILE);
    }
  } catch {
    // fall through to default
  }
  return "auto";
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
    // non-critical — dark mode preference failing to persist is acceptable
  }
}

export default function useDarkMode() {
  const [darkMode, setDarkMode] = useState("auto");
  const systemScheme = useColorScheme();

  useEffect(() => {
    let mounted = true;
    _load().then((v) => {
      if (mounted && v) setDarkMode(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const isDark =
    darkMode === "auto" ? systemScheme === "dark" : darkMode === "dark";

  const toggle = useCallback(() => {
    setDarkMode((prev) => {
      const next =
        prev === "auto" ? "dark" : prev === "dark" ? "light" : "auto";
      _save(next);
      return next;
    });
  }, []);

  return { darkMode, isDark, toggle };
}
