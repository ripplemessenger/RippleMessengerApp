import CryptoJS from "crypto-js";
import * as rippleKeyPairs from "ripple-keypairs";
import Logger from "./Logger";
import {
 ConsoleWarn,
 HalfSHA512,
 Int2Bool,
 QuarterSHA512Message,
 QuarterSHA512WordArray,
 sortedAddressPair,
} from "./AppUtil";
import { Epoch } from "./MessengerConst";
import { NonceMax } from "./AppConst";

const HASH_PREFIX_LENGTH = 6;

/**
 * Safely parse the json string field on a message/bulletin record.
 * @param {object} msg - Record with a json string field
 * @returns {boolean} True if JSON.parse succeeded
 */
function safeJsonParseMsg(msg) {
 try {
  msg.json = JSON.parse(msg.json);
  return true;
 } catch (e) {
  Logger.warn("Failed to parse message json:", msg.hash, e.message);
  msg.json = {};
  return false;
 }
}

/**
 * Transform a raw bulletin record into a display-ready object.
 */
function bulletin2Display(bulletin) {
 if (safeJsonParseMsg(bulletin)) {
  bulletin.content = bulletin.json.Content || "";
  bulletin.tag = bulletin.json.Tag !== undefined ? bulletin.json.Tag : [];
  bulletin.file = bulletin.json.File !== undefined ? bulletin.json.File : [];
  bulletin.quote = bulletin.json.Quote !== undefined ? bulletin.json.Quote : [];
 } else {
  bulletin.content = bulletin.content || "";
  bulletin.tag = bulletin.tag || [];
  bulletin.file = bulletin.file || [];
  bulletin.quote = bulletin.quote || [];
 }
 bulletin.is_marked = Int2Bool(bulletin.is_marked);
 return bulletin;
}

/**
 * Common transformation for private/group messages.
 */
function parseMessageCommon(msg) {
 safeJsonParseMsg(msg);
 msg.is_confirmed = Int2Bool(msg.is_confirmed);
 msg.is_marked = Int2Bool(msg.is_marked);
 msg.is_readed = Int2Bool(msg.is_readed);
 msg.is_object = Int2Bool(msg.is_object);
 if (msg.is_object && typeof msg.content === "string") {
  try {
   msg.content = JSON.parse(msg.content);
  } catch (e) {
   Logger.warn("Failed to parse message content:", msg.hash, e.message);
  }
 }
 return msg;
}

/**
 * Transform a raw private message record into a display-ready object.
 */
function privateMessage2Display(msg) {
 return parseMessageCommon(msg);
}

/**
 * Transform a raw group message record into a display-ready object.
 */
function groupMessage2Display(msg) {
 return parseMessageCommon(msg);
}

/**
 * Calculate the DH sequence number for a private message.
 * Used to partition messages into time-based buckets for sync efficiency.
 */
function DHSequence(partition, timestamp, address1, address2) {
 const [a, b] = sortedAddressPair(address1, address2);
 let tmpInt = parseInt(HalfSHA512(a + b).substring(0, HASH_PREFIX_LENGTH), 16);
 let cursor = (tmpInt % partition) * 1000;
 let seq = parseInt((timestamp - (Epoch + cursor)) / (partition * 1000));
 return seq;
}

/**
 * Sign a message string using the Ripple keypairs library with a private key.
 */
function Sign(msg, sk) {
 let sig = rippleKeyPairs.sign(msg, sk);
 return sig;
}

/**
 * Generate a random integer in [min, max].
 */
function genRandomInt(min, max) {
 const range = max - min + 1;
 return min + Math.floor(Math.random() * range);
}

/**
 * Generate a unique nonce value in the range [0, NonceMax].
 */
function genNonce() {
 return genRandomInt(0, NonceMax);
}

// ==================== File hashing ====================

/**
 * Compute the file hash (Quarter SHA-512) of a binary buffer.
 * @param {Uint8Array} buffer - Raw file data
 * @returns {string} 32-character uppercase hex hash
 */
function FileHash(buffer) {
 const wordArray = CryptoJS.lib.WordArray.create(buffer);
 const hash = QuarterSHA512WordArray(wordArray);
 return hash;
}

/**
 * Create a new incremental SHA-512 hash state.
 * Feed chunks with updateFileHash(), then call finalizeFileHash() to get the result.
 * This avoids reading the whole file at the end (which froze the JS main thread).
 * @returns {import('crypto-js').Algo.SHA512} Hash state
 */
function createFileHash() {
 return CryptoJS.algo.SHA512.create();
}

/**
 * Update an incremental SHA-512 hash state with a chunk of data.
 * @param {import('crypto-js').Algo.SHA512} state - Hash state from createFileHash()
 * @param {Uint8Array} buffer - Chunk data (the exact bytes appended to the file)
 */
function updateFileHash(state, buffer) {
 state.update(CryptoJS.lib.WordArray.create(buffer));
}

/**
 * Finalize an incremental SHA-512 hash state and return the Quarter SHA-512 hash.
 * Equivalent to FileHash() over the concatenation of all fed chunks.
 * @param {import('crypto-js').Algo.SHA512} state - Hash state from createFileHash()
 * @returns {string} 32-character uppercase hex hash
 */
function finalizeFileHash(state) {
 return state.finalize().toString().toUpperCase().substring(0, 32);
}

// ==================== Signature verification ====================

/**
 * Verify the digital signature of a JSON message object.
 * Creates a shallow copy, removes Signature, hashes, and verifies against PublicKey.
 * Does not mutate the input object.
 * @param {object} json - Message object with Signature and PublicKey fields
 * @returns {boolean} True if the signature is valid
 */
function VerifyJsonSignature(json) {
 const sig = json["Signature"];
 const copy = Object.assign({}, json);
 delete copy["Signature"];
 const json_hash = QuarterSHA512Message(copy);
 if (rippleKeyPairs.verify(json_hash, sig, json.PublicKey)) {
  return true;
 } else {
  ConsoleWarn("signature invalid...");
  Logger.debug(json);
  return false;
 }
}

// ==================== Binary conversion helpers (no Node.js Buffer) ====================

/**
 * Convert a Uint32 number to a 4-byte Uint8Array.
 * @param {number} num - Unsigned 32-bit integer (0-4294967295)
 * @param {boolean} [isBigEndian=true] - Byte order
 * @returns {Uint8Array|false} 4-byte array, or false if out of range
 */
function Uint32ToBuffer(num, isBigEndian = true) {
 if (num < 0 || num > NonceMax) {
  return false;
 }
 const buffer = new ArrayBuffer(4);
 const view = new DataView(buffer);
 if (isBigEndian) {
  view.setUint32(0, num, false);
 } else {
  view.setUint32(0, num, true);
 }
 return new Uint8Array(buffer);
}

/**
 * Read the first 4 bytes of an ArrayBuffer as a Uint32.
 * @param {ArrayBuffer|Uint8Array} arrayBuffer - Buffer containing at least 4 bytes
 * @param {boolean} [isBigEndian=true] - Byte order
 * @returns {number} Unsigned 32-bit integer
 */
function ArrayBufferToUint32(arrayBuffer, isBigEndian = true) {
 const buf =
  arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
 const view = new DataView(buf.buffer, buf.byteOffset, 4);
 return isBigEndian ? view.getUint32(0, false) : view.getUint32(0, true);
}

// ==================== Group member helpers ====================

/**
 * Get the index of a member in a sorted group member list.
 * @param {string[]} members - Array of XRPL addresses
 * @param {string} member - Address to find
 * @returns {number} Index in sorted order, or -1 if not found
 */
function getMemberIndex(members, member) {
 const sortedMembers = [...members];
 sortedMembers.sort();
 const index = sortedMembers.findIndex((m) => m === member);
 return index;
}

/**
 * Get the member at a given index from a sorted group member list.
 * @param {string[]} members - Array of XRPL addresses
 * @param {number} index - Index in sorted order
 * @returns {string} XRPL address at the given index
 */
function getMemberByIndex(members, index) {
 const sortedMembers = [...members];
 sortedMembers.sort();
 return sortedMembers[index];
}

// ==================== File path helpers ====================

/**
 * Build the subdirectory path for a file hash. Splits hash into 3-char segments.
 * @param {string} hash - File hash string
 * @returns {string[]} Two-element array of subdirectory names
 */
function buildFileSubPath(hash) {
 return [hash.substring(0, 3), hash.substring(3, 6)];
}

/**
 * Build the full file path segments from base directories and a file hash.
 * @param {string} baseDir - Base storage directory
 * @param {string} fileDir - File category directory (e.g., "avatars", "private")
 * @param {string} hash - File hash string
 * @returns {string[]} Array of path segments
 */
function buildFileFullPath(baseDir, fileDir, hash) {
 const parts = buildFileSubPath(hash);
 return [baseDir, fileDir, ...parts, hash];
}

// ==================== Uint8Array concat helper (replaces Buffer.concat) ====================

/**
 * Concatenate multiple TypedArrays into a single Uint8Array.
 * Accepts Uint8Array, ArrayBuffer, or number[] elements.
 * @param {Array<Uint8Array|ArrayBuffer|number[]>} arrays - Arrays to concatenate
 * @returns {Uint8Array} Combined result
 */
function concatUint8Arrays(arrays) {
 let totalLength = 0;
 for (const arr of arrays) {
  totalLength += arr.length;
 }
 const result = new Uint8Array(totalLength);
 let offset = 0;
 for (const arr of arrays) {
  const u8 =
   arr instanceof Uint8Array ? arr : new Uint8Array(arr.buffer || arr);
  result.set(u8, offset);
  offset += u8.length;
 }
 return result;
}

// ==================== Base64 <-> binary helpers (for expo-file-system) ====================

/**
 * Convert a base64 string to a Uint8Array.
 * Handles padding and standard/URL-safe base64 alphabets.
 * @param {string} b64 - Base64-encoded string
 * @returns {Uint8Array} Decoded binary data
 */
function base64ToUint8Array(b64) {
 const binaryString = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
 const bytes = new Uint8Array(binaryString.length);
 for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
 }
 return bytes;
}

/**
 * Convert a Uint8Array to a base64 string.
 * @param {Uint8Array} bytes - Binary data
 * @returns {string} Base64-encoded string
 */
function uint8ArrayToBase64(bytes) {
 let binary = "";
 for (let i = 0; i < bytes.length; i++) {
  binary += String.fromCharCode(bytes[i]);
 }
 return btoa(binary);
}

// ==================== Encrypted file hash helpers ====================

/**
 * Compute the encrypted hash for a private chat file.
 * @param {string} address1 - First XRPL address
 * @param {string} address2 - Second XRPL address
 * @param {string} hash - Original file hash
 * @returns {string} 32-character uppercase hex encrypted hash
 */
function PrivateFileEHash(address1, address2, hash) {
 const [a, b] = sortedAddressPair(address1, address2);
 return QuarterSHA512Message(a + b + hash);
}

/**
 * Compute the encrypted hash for a group chat file.
 * @param {string} group_hash - Group identifier hash
 * @param {string} file_hash - Original file hash
 * @returns {string} 32-character uppercase hex encrypted hash
 */
function GroupFileEHash(group_hash, file_hash) {
 return QuarterSHA512Message(group_hash + file_hash);
}

export {
 bulletin2Display,
 privateMessage2Display,
 groupMessage2Display,
 DHSequence,
 Sign,
 VerifyJsonSignature,
 FileHash,
 createFileHash,
 updateFileHash,
 finalizeFileHash,
 Uint32ToBuffer,
 ArrayBufferToUint32,
 getMemberIndex,
 getMemberByIndex,
 buildFileSubPath,
 buildFileFullPath,
 genRandomInt,
 genNonce,
 concatUint8Arrays,
 base64ToUint8Array,
 uint8ArrayToBase64,
 PrivateFileEHash,
 GroupFileEHash,
};
