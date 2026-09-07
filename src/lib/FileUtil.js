import RNFS from "react-native-fs";
import { buildFileSubPath } from "./MessengerUtil";

const FILE_BASE_DIR =
  (RNFS.DocumentDirectoryPath || "") + "/ripplemessenger/file";

/**
 * Save file content to the standard file path.
 * Path: {baseDir}/{hash[0:3]}/{hash[3:6]}/{hash}
 * @param {string} hash - File hash
 * @param {ArrayBuffer|Uint8Array} data - File content
 */
export async function saveFile(hash, data) {
  const subPath = buildFileSubPath(hash);
  const dir = `${FILE_BASE_DIR}/${subPath[0]}/${subPath[1]}`;
  const filePath = `${dir}/${hash}`;

  // Ensure directory exists
  const dirExists = await RNFS.exists(dir).catch(() => false);
  if (!dirExists) {
    await RNFS.mkdir(dir);
  }

  // Convert ArrayBuffer to base64 for RNFS
  let base64;
  if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  } else if (data instanceof Uint8Array) {
    let binary = "";
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    base64 = btoa(binary);
  } else {
    throw new Error("Unsupported data type for saveFile");
  }

  await RNFS.writeFile(filePath, base64, "base64");
  return true;
}

/**
 * Download a file directly from URL to disk (streaming, no JS heap).
 * Uses RNFS.downloadFile which streams via OkHttp to disk.
 * @param {string} url - Full URL to download from
 * @param {string} hash - File hash (used for path)
 * @returns {Promise<boolean>}
 */
export async function downloadFileToDisk(url, hash) {
  const subPath = buildFileSubPath(hash);
  const dir = `${FILE_BASE_DIR}/${subPath[0]}/${subPath[1]}`;
  const filePath = `${dir}/${hash}`;

  // Ensure directory exists
  const dirExists = await RNFS.exists(dir).catch(() => false);
  if (!dirExists) {
    await RNFS.mkdir(dir);
  }

  // Stream download directly to disk — bypasses JS heap entirely
  return new Promise((resolve, reject) => {
    const task = RNFS.downloadFile(
      {
        fromUrl: url,
        toFile: filePath,
        headers: {},
        progress: false,
      },
      (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      },
    );
    task.catch((e) => reject(e));
  });
}

/**
 * Check if a file exists locally.
 * @param {string} hash - File hash
 * @returns {Promise<boolean>}
 */
export async function fileExists(hash) {
  const subPath = buildFileSubPath(hash);
  const filePath = `${FILE_BASE_DIR}/${subPath[0]}/${subPath[1]}/${hash}`;
  return RNFS.exists(filePath).catch(() => false);
}

/**
 * Read a local file's content into an ArrayBuffer (for LAN sync push).
 * @param {string} hash - File hash
 * @returns {Promise<ArrayBuffer>} file bytes
 */
export async function readFile(hash) {
  const subPath = buildFileSubPath(hash);
  const filePath = `${FILE_BASE_DIR}/${subPath[0]}/${subPath[1]}/${hash}`;
  const exists = await RNFS.exists(filePath).catch(() => false);
  if (!exists) {
    throw new Error(`File not found: ${hash}`);
  }
  const base64 = await RNFS.readFile(filePath, "base64");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
