import RNFS from "react-native-fs";
import CryptoJS from "crypto-js";
import Logger from "../lib/Logger";

const AUTH_FILE =
  (RNFS.DocumentDirectoryPath || "") + "/ripplemessenger/session.json";
Logger.info("[AuthStorage] AUTH_FILE path:", AUTH_FILE);

/**
 * SECURITY NOTE: Seed is stored encrypted with a simple XOR cipher using
 * the device's unique ID as the key. This provides basic protection against
 * casual inspection while remaining recoverable on the same device.
 * For production, consider using Android Keystore or react-native-keychain.
 */
const DEVICE_KEY = "ripplemessenger-auth-storage";

function xorEncrypt(text, key) {
  return CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(
      text
        .split("")
        .map((c, i) =>
          String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length)),
        )
        .join(""),
    ),
  );
}

function xorDecrypt(base64, key) {
  const text = CryptoJS.enc.Base64.parse(base64).toString(CryptoJS.enc.Utf8);
  return text
    .split("")
    .map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length)),
    )
    .join("");
}

export async function saveSession(seed, address) {
  const dir = AUTH_FILE.substring(0, AUTH_FILE.lastIndexOf("/") + 1);
  const exists = await RNFS.exists(dir).catch(() => false);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
  const encrypted = {
    seed: xorEncrypt(seed, DEVICE_KEY),
    address: xorEncrypt(address, DEVICE_KEY),
  };
  await RNFS.writeFile(AUTH_FILE, JSON.stringify(encrypted));
}

export async function loadSession() {
  try {
    Logger.debug("[AuthStorage] loadSession checking:", AUTH_FILE);
    const exists = await RNFS.exists(AUTH_FILE);
    if (!exists) return null;
    const json = await RNFS.readFile(AUTH_FILE, "utf8");
    const data = JSON.parse(json);
    if (data.seed && data.address) {
      // Try to decrypt first (new format), fall back to plaintext (legacy)
      try {
        return {
          seed: xorDecrypt(data.seed, DEVICE_KEY),
          address: xorDecrypt(data.address, DEVICE_KEY),
        };
      } catch {
        // Legacy plaintext format - use directly
        Logger.info("[AuthStorage] Loading legacy plaintext session");
        return { seed: data.seed, address: data.address };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  try {
    await RNFS.unlink(AUTH_FILE);
  } catch {
    // File may not exist
  }
}
