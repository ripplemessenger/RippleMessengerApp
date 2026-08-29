// Binary WebSocket message handlers — file/avatar chunk reception.
// Split out of messenger.ws.js (see WebsocketListener for the main loop).

import { call, put } from "redux-saga/effects";
import { dbAPI } from "../../db";
import * as fileService from "../../services/fileService";
import { DefaultPartition } from "../../lib/AppConst";
import { AesDecryptBuffer } from "../../lib/AppUtil";
import Logger from "../../lib/Logger";
import { FileRequestType } from "../../lib/MessengerConst";
import {
  DHSequence,
  FileHash,
  getMemberByIndex,
  ArrayBufferToUint32,
  uint8ArrayToBase64,
} from "../../lib/MessengerUtil";
import { getFileRequestList, setFileRequestList } from "./messenger.core";
import {
  FetchBulletinFile,
  FetchPrivateChatFile,
  FetchGroupChatFile,
} from "./messenger.file";
import {
  setFileSavedToken,
  setFileProgress,
  setAvatarSavedToken,
} from "../slices/MessengerSlice";
import { FILE_REQUEST_TTL_MS } from "../../lib/AppConst";

// ---------- Binary message handlers (file chunk reception) ----------

/**
 * Handle incoming binary chunk for a bulletin file.
 * No encryption — raw bytes received over WebSocket.
 */
function* handleBinaryBulletinFile(request, content) {
  try {
    const filePath = fileService.getFileFullPath(request.Hash);
    const file = yield call(() => dbAPI.getFileByHash(request.Hash));
    if (file === null) return;

    // First chunk — ensure directory exists
    if (request.ChunkCursor === 1) {
      yield call(() => fileService.ensureDir("files"));
    }

    yield call(receiveFileChunk, {
      filePath,
      content,
      request,
      file,
      fetchNext: FetchBulletinFile,
      fetchNextPayload: { hash: request.Hash },
    });
  } catch (e) {
    Logger.error(
      "[handleBinaryBulletinFile] failed for",
      request.Hash,
      e.message,
      e.stack,
    );
  }
}

/**
 * Handle incoming binary chunk for a private chat file.
 * Content is AES-encrypted using the ECDH-derived key for this peer pair.
 */
function* handleBinaryPrivateFile(request, content) {
  try {
    const filePath = fileService.getFileFullPath(request.Hash);
    const file = yield call(() => dbAPI.getFileByHash(request.Hash));
    if (file === null) return;

    if (request.ChunkCursor === 1) {
      yield call(() => fileService.ensureDir("files"));
    }

    // Decrypt chunk using ECDH AES key
    const decryptedContent = AesDecryptBuffer(content, request.aes_key);
    yield call(receiveFileChunk, {
      filePath,
      content: decryptedContent,
      request,
      file,
      fetchNext: FetchPrivateChatFile,
      fetchNextPayload: {
        hash: request.Hash,
        size: request.Size,
        remote: request.Address,
      },
    });
  } catch (e) {
    Logger.error(
      "[handleBinaryPrivateFile] failed for",
      request.Hash,
      e.message,
    );
  }
}

/**
 * Handle incoming binary chunk for a group chat file.
 * Format: [4-byte nonce][4-byte sender index][AES-encrypted chunk]
 * Each group member encrypts separately with their own ECDH key.
 */
function* handleBinaryGroupFile(request, content, action) {
  try {
    const file = yield call(() => dbAPI.getFileByHash(request.Hash));
    if (
      file === null ||
      !(
        file.chunk_cursor < file.chunk_length &&
        file.chunk_cursor + 1 === request.ChunkCursor
      )
    )
      return;

    // Extract sender index from bytes 4-8 of the raw binary message
    const rawData = action.data;
    const senderIndex = ArrayBufferToUint32(rawData.slice(4, 8));
    const from = getMemberByIndex(request.GroupMember, senderIndex);
    const ecdh_sequence = DHSequence(
      DefaultPartition,
      Date.now(),
      request.SelfAddress,
      from,
    );
    const ecdh = yield call(() =>
      dbAPI.getHandshake(
        request.SelfAddress,
        from,
        DefaultPartition,
        ecdh_sequence,
      ),
    );

    if (ecdh?.aes_key) {
      const filePath = fileService.getFileFullPath(request.Hash);
      if (request.ChunkCursor === 1) {
        yield call(() => fileService.ensureDir("files"));
      }
      const decryptedContent = AesDecryptBuffer(content, ecdh.aes_key);
      yield call(receiveFileChunk, {
        filePath,
        content: decryptedContent,
        request,
        file,
        fetchNext: FetchGroupChatFile,
        fetchNextPayload: {
          hash: request.Hash,
          size: request.Size,
          group_hash: request.GroupHash,
        },
      });
    }
  } catch (e) {
    Logger.error("[handleBinaryGroupFile] failed for", request.Hash, e.message);
  }
}

/**
 * Shared helper: save a file chunk to disk, update cursor, then either
 * request the next chunk or verify the completed file.
 * Re-imported from messenger.file.js (defined there as an internal function).
 */
function* receiveFileChunk({
  filePath,
  content,
  request,
  file,
  fetchNext,
  fetchNextPayload,
}) {
  if (
    file.chunk_cursor < file.chunk_length &&
    file.chunk_cursor + 1 === request.ChunkCursor
  ) {
    // Append chunk to file on disk
    yield call(() => fileService.writeFile(filePath, content, true));

    setFileRequestList(
      getFileRequestList().filter((r) => r.Nonce !== request.Nonce),
    );
    const current_chunk_cursor = file.chunk_cursor + 1;
    yield call(() =>
      dbAPI.updateFileChunkCursor(
        request.Hash,
        current_chunk_cursor,
        Date.now(),
      ),
    );

    // Report download progress to the UI (mirrors Client FileStatusMap)
    yield put(
      setFileProgress({
        hash: request.Hash,
        cursor: current_chunk_cursor,
        length: file.chunk_length,
      }),
    );

    if (current_chunk_cursor < file.chunk_length) {
      // More chunks needed — request next one
      yield call(fetchNext, { payload: fetchNextPayload });
    } else {
      // All chunks received — verify hash
      const verifiedHash = FileHash(
        yield call(() => fileService.readFile(filePath)),
      );
      if (verifiedHash === request.Hash) {
        yield call(() => dbAPI.remoteFileSaved(request.Hash, Date.now()));
        yield put(
          setFileSavedToken({ hash: request.Hash, timestamp: Date.now() }),
        );
      } else {
        Logger.error(
          "[receiveFileChunk] Hash mismatch for",
          request.Hash,
          "got",
          verifiedHash,
        );
        yield call(() => fileService.deleteFile(filePath));
        yield call(() =>
          dbAPI.updateFileChunkCursor(request.Hash, 0, Date.now()),
        );
        // Progress reset — download restarts from chunk 1
        yield put(
          setFileProgress({
            hash: request.Hash,
            cursor: 0,
            length: file.chunk_length,
          }),
        );
        // Re-request from start
        yield call(fetchNext, { payload: fetchNextPayload });
      }
    }
  } else if (file.chunk_cursor + 1 !== request.ChunkCursor) {
    // Out-of-order chunk — re-request the expected cursor instead of silently dropping
    Logger.warn(
      "[receiveFileChunk] Unexpected chunk order for",
      request.Hash,
      ": db_cursor=",
      file.chunk_cursor,
      ", received_chunk=",
      request.ChunkCursor,
    );
    setFileRequestList(
      getFileRequestList().filter((r) => r.Nonce !== request.Nonce),
    );
    yield call(fetchNext, { payload: fetchNextPayload }); // Re-request expected chunk
  } else {
    // File already fully fetched — no-op (silent success)
    setFileRequestList(
      getFileRequestList().filter((r) => r.Nonce !== request.Nonce),
    );
  }
}

/**
 * Handle incoming binary data for an avatar file.
 * Avatar files are small (typically <100KB), so the entire file arrives in one chunk.
 */
function* handleBinaryAvatar(request, content) {
  try {
    const avatarPath = fileService.getAvatarPath(request.Address);
    yield call(() => fileService.ensureDir("avatars"));
    yield call(() => fileService.writeFile(avatarPath, content));

    // Verify hash if we have it
    const receivedHash = FileHash(content);
    if (receivedHash === request.Hash) {
      yield call(() =>
        dbAPI.updateAvatarIsSaved(request.Address, true, Date.now()),
      );
      // Also save base64 to DB for fast access without file I/O
      const base64 = uint8ArrayToBase64(content);
      yield call(() => dbAPI.saveAvatarImage(request.Address, base64));
      // Notify UI so useAvatarData re-renders and picks up the new image
      yield put(
        setAvatarSavedToken({
          address: request.Address,
          timestamp: Date.now(),
        }),
      );
    } else {
      Logger.error(
        "[handleBinaryAvatar] Hash mismatch for",
        request.Address,
        "expected",
        request.Hash,
        "got",
        receivedHash,
      );
      yield call(() => fileService.deleteFile(avatarPath));
    }
  } catch (e) {
    Logger.error(
      "[handleBinaryAvatar] failed for",
      request.Address,
      e.message,
      e.stack,
    );
  }
}

/**
 * Main binary message dispatcher.
 * Extracts nonce from first 4 bytes, matches against active file requests,
 * then routes to the appropriate handler based on FileRequestType.
 */
export function* handleBinaryMessage(action) {
  try {
    const nonce = ArrayBufferToUint32(action.data.slice(0, 4));

    // Filter stale file requests (use dynamic TTL from item, fallback to default)
    setFileRequestList(
      getFileRequestList().filter(
        (r) => r.Timestamp + (r.TTL || FILE_REQUEST_TTL_MS) > Date.now(),
      ),
    );
    const fileRequests = getFileRequestList();

    for (let i = 0; i < fileRequests.length; i++) {
      const request = fileRequests[i];
      if (request.Nonce === nonce) {
        switch (request.Type) {
          case FileRequestType.Avatar:
            yield call(
              handleBinaryAvatar,
              request,
              new Uint8Array(action.data.slice(4)),
            );
            break;
          case FileRequestType.File:
            yield call(
              handleBinaryBulletinFile,
              request,
              new Uint8Array(action.data.slice(4)),
            );
            break;
          case FileRequestType.PrivateChatFile:
            yield call(
              handleBinaryPrivateFile,
              request,
              new Uint8Array(action.data.slice(4)),
            );
            break;
          case FileRequestType.GroupChatFile:
            yield call(
              handleBinaryGroupFile,
              request,
              new Uint8Array(action.data.slice(8)),
              action,
            );
            break;
          default:
            Logger.warn(
              "[handleBinaryMessage] unknown FileRequestType",
              request.Type,
            );
        }
        return; // Only handle one nonce per binary message
      }
    }
    Logger.debug(
      "[handleBinaryMessage] no matching file request for nonce",
      nonce,
    );
  } catch (e) {
    Logger.error("[handleBinaryMessage] failed:", e.message, e.stack);
  }
}
