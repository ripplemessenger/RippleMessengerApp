/**
 * Settings helpers — read/write settings via RNFS (JSON file).
 * Mirrors Client's SettingsUtil.js (localStorage → RNFS).
 *
 * Settings are stored in a single JSON file: settings.json
 */
import RNFS from 'react-native-fs';

const SETTINGS_FILE = (RNFS.DocumentDirectoryPath || '') + '/ripplemessenger/settings.json';

let _cache = null;

async function _ensureDir() {
  const dir = RNFS.DocumentDirectoryPath + '/ripplemessenger';
  const exists = await RNFS.exists(dir).catch(() => false);
  if (!exists) await RNFS.mkdir(dir);
}

async function _load() {
  if (_cache !== null) return _cache;
  try {
    const exists = await RNFS.exists(SETTINGS_FILE);
    if (exists) {
      const json = await RNFS.readFile(SETTINGS_FILE, 'utf8');
      _cache = JSON.parse(json);
    } else {
      _cache = {};
    }
  } catch {
    _cache = {};
  }
  return _cache;
}

async function _save(data) {
  _cache = data;
  await _ensureDir();
  await RNFS.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/** Read a boolean setting with default fallback */
export async function getSettingBool(key, defaultValue = false) {
  const data = await _load();
  const v = data[key];
  if (v === null || v === undefined) return defaultValue;
  return v === true || v === 'true';
}

/** Read a string setting with default fallback */
export async function getSettingString(key, defaultValue = '') {
  const data = await _load();
  const v = data[key];
  if (v === null || v === undefined || v === '') return defaultValue;
  return String(v);
}

/** Write a setting value */
export async function setSetting(key, value) {
  const data = await _load();
  data[key] = value;
  await _save(data);
}

/** Get all settings */
export async function getAllSettings() {
  return await _load();
}
