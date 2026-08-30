/**
 * messenger.file.js (mobile)
 *
 * File transfer saga generators for RMS mobile app.
 * Implements: bulletin file download, private chat file download/upload,
 * group chat file download/upload, and file chunk reassembly via WebSocket binary messages.
 */

import RNFS from "react-native-fs";
import { NativeModules } from "react-native";

const RMMediaStore = NativeModules.RMMediaStore;

const MIME_MAP = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  pdf: "application/pdf",
  txt: "text/plain",
  html: "text/html",
  zip: "application/zip",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
function guessMimeType(ext) {
  return (
    MIME_MAP[(ext || "").replace(".", "").toLowerCase()] ||
    "application/octet-stream"
  );
}

import { call, put, select, fork } from "redux-saga/effects";

import { dbAPI } from "../../db";
import * as fileService from "../../services/fileService";
import {
  FLASH_DURATION_MS,
  FileChunkSize,
  FileMaxSize,
  DefaultPartition,
  SessionType,
} from "../../lib/AppConst";
import { filesize_format } from "../../lib/AppUtil";
import Logger from "../../lib/Logger";
import { mgAPI } from "../../lib/MessageGenerator";
import { FileRequestType, MessageObjectType } from "../../lib/MessengerConst";
import {
  DHSequence,
  PrivateFileEHash,
  GroupFileEHash,
  FileHash,
  base64ToUint8Array,
} from "../../lib/MessengerUtil";
import { setFlashNoticeMessage } from "../slices/CommonSlice";
import { setFileSavedToken } from "../slices/MessengerSlice";

// Core messaging — SendMessage, file request list helpers
import {
  SendMessage,
  getFileRequestList,
  setFileRequestList,
  pushFileRequest,
  genFileNonce,
  safeFork,
} from "./messenger.core";
import { getSettingBool } from "../../lib/SettingsUtil";

// MessengerSaga — SendContent dispatcher and saveLocalFile re-export
import { SendContent } from "./MessengerSaga";
import { FILE_REQUEST_TTL_MS } from "../../lib/AppConst";

/**
 * Fetch the next chunk of a bulletin attachment from connected peers via server relay.
 */
export function* FetchBulletinFile({ payload }) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) return;

    let file = yield call(() => dbAPI.getFileByHash(payload.hash));
    if (file === null) {
      if (!payload.size) return;
      const chunk_length = Math.ceil(payload.size / FileChunkSize);
      yield call(() =>
        dbAPI.addFile(
          payload.hash,
          payload.size,
          Date.now(),
          chunk_length,
          0,
          false,
        ),
      );
      file = yield call(() => dbAPI.getFileByHash(payload.hash));
    }
    if (file.is_saved) return;

    const nonce = genFileNonce();
    const cursor = file.chunk_cursor + 1;

    // Clean stale requests and push new one
    setFileRequestList(
      getFileRequestList().filter(
        (r) =>
          r.Timestamp + (r.TTL || FILE_REQUEST_TTL_MS) > Date.now() &&
          r.Hash !== file.hash,
      ),
    );
    pushFileRequest({
      Type: FileRequestType.File,
      Nonce: nonce,
      Hash: file.hash,
      ChunkCursor: cursor,
      Timestamp: Date.now(),
    });

    const file_request = yield call(() =>
      mgAPI.genFileRequest(
        seed,
        FileRequestType.File,
        file.hash,
        nonce,
        cursor,
      ),
    );
    yield call(SendMessage, { msg: file_request });
  } catch (e) {
    Logger.error(
      "[FetchBulletinFile] FAILED for",
      payload.hash,
      e.message,
      e.stack,
    );
  }
}

/**
 * Save a bulletin file to the device document directory.
 * If already downloaded, copies to shared location. Otherwise requests from server.
 */
export function* SaveBulletinFile({ payload }) {
  try {
    const file = yield call(() => dbAPI.getFileByHash(payload.hash));
    if (file && file.is_saved) {
      const sourcePath = fileService.getFileFullPath(payload.hash);
      const displayName = `${payload.name}${payload.ext}`;
      const mimeType = guessMimeType(payload.ext);
      yield call(() =>
        RMMediaStore.saveToGallery(sourcePath, displayName, mimeType),
      );
      yield put(
        setFlashNoticeMessage({
          message: "File saved to gallery",
          duration: 2000,
        }),
      );
    } else if (file) {
      yield put(
        setFlashNoticeMessage({
          message: `Fetching file (${file.chunk_cursor}/${file.chunk_length})...`,
          duration: 2000,
        }),
      );
      yield call(FetchBulletinFile, {
        payload: { hash: payload.hash, size: payload.size },
      });
    } else {
      yield put(
        setFlashNoticeMessage({
          message: "File record not found, fetching from server...",
          duration: 2000,
        }),
      );
      yield call(FetchBulletinFile, {
        payload: { hash: payload.hash, size: payload.size },
      });
    }
  } catch (e) {
    Logger.error("[SaveBulletinFile] FAILED:", e.message, e.stack);
  }
}

/**
 * Fetch the next chunk of a private chat file from the remote peer.
 */
export function* FetchPrivateChatFile({ payload }) {
  try {
    Logger.info(
      `[FetchPrivateChatFile] START hash=${payload.hash} size=${payload.size} remote=${payload.remote}`,
    );
    const seed = yield select((state) => state.User.Seed);
    if (!seed) {
      Logger.info("[FetchPrivateChatFile] ABORT: no seed");
      return;
    }

    const self_address = yield select((state) => state.User.Address);
    const ehash = PrivateFileEHash(self_address, payload.remote, payload.hash);

    let private_chat_file = yield call(() =>
      dbAPI.getPrivateFileByEHash(ehash),
    );
    if (private_chat_file === null) {
      yield call(() =>
        dbAPI.addPrivateFile(
          ehash,
          self_address,
          payload.remote,
          payload.hash,
          payload.size,
        ),
      );
    }

    const chunk_length = Math.ceil(payload.size / FileChunkSize);
    let file = yield call(() => dbAPI.getFileByHash(payload.hash));
    if (file === null) {
      yield call(() =>
        dbAPI.addFile(
          payload.hash,
          payload.size,
          Date.now(),
          chunk_length,
          0,
          false,
        ),
      );
    }

    file = yield call(() => dbAPI.getFileByHash(payload.hash));
    Logger.info(
      `[FetchPrivateChatFile] file=${file ? `is_saved=${file.is_saved} cursor=${file.chunk_cursor}/${file.chunk_length}` : "null"}`,
    );
    if (file && !file.is_saved) {
      const timestamp = Date.now();
      const ecdh_sequence = DHSequence(
        DefaultPartition,
        timestamp,
        self_address,
        payload.remote,
      );
      const ecdh = yield call(() =>
        dbAPI.getHandshake(
          self_address,
          payload.remote,
          DefaultPartition,
          ecdh_sequence,
        ),
      );
      Logger.info(
        `[FetchPrivateChatFile] ecdh=${ecdh ? `aes_key=${ecdh.aes_key ? "ready" : "null"}` : "null"}`,
      );

      if (ecdh?.aes_key) {
        const nonce = genFileNonce();
        setFileRequestList(
          getFileRequestList().filter(
            (r) =>
              r.Timestamp + (r.TTL || FILE_REQUEST_TTL_MS) > Date.now() &&
              r.EHash !== ehash,
          ),
        );
        pushFileRequest({
          Type: FileRequestType.PrivateChatFile,
          Nonce: nonce,
          EHash: ehash,
          Hash: payload.hash,
          Size: payload.size,
          ChunkCursor: file.chunk_cursor + 1,
          Address: payload.remote,
          aes_key: ecdh.aes_key,
          Timestamp: timestamp,
        });

        const file_request = yield call(() =>
          mgAPI.genFileRequest(
            seed,
            FileRequestType.PrivateChatFile,
            ehash,
            nonce,
            file.chunk_cursor + 1,
            payload.remote,
          ),
        );
        Logger.info(
          `[FetchPrivateChatFile] SENDING FileRequest nonce=${nonce} chunk=${file.chunk_cursor + 1}`,
        );
        yield call(SendMessage, { key: payload.key, msg: file_request });
      } else {
        Logger.info("[FetchPrivateChatFile] ABORT: no aes_key");
      }
    } else {
      Logger.info("[FetchPrivateChatFile] ABORT: file is_saved or null");
    }
  } catch (e) {
    Logger.error("[FetchPrivateChatFile] failed:", e.message);
  }
}

/**
 * Fetch the next chunk of a group chat file from any available group member.
 */
export function* FetchGroupChatFile({ payload }) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) return;

    const self_address = yield select((state) => state.User.Address);
    const ehash = GroupFileEHash(payload.group_hash, payload.hash);

    let group_chat_file = yield call(() => dbAPI.getGroupFileByEHash(ehash));
    if (group_chat_file === null) {
      yield call(() =>
        dbAPI.addGroupFile(
          ehash,
          payload.group_hash,
          payload.hash,
          payload.size,
        ),
      );
    }

    const chunk_length = Math.ceil(payload.size / FileChunkSize);
    let file = yield call(() => dbAPI.getFileByHash(payload.hash));
    if (file === null) {
      yield call(() =>
        dbAPI.addFile(
          payload.hash,
          payload.size,
          Date.now(),
          chunk_length,
          0,
          false,
        ),
      );
    }

    file = yield call(() => dbAPI.getFileByHash(payload.hash));
    if (file && !file.is_saved) {
      const timestamp = Date.now();
      const nonce = genFileNonce();
      const group_member_map = yield select(
        (state) => state.Messenger.GroupMemberMap,
      );

      setFileRequestList(
        getFileRequestList().filter(
          (r) =>
            r.Timestamp + (r.TTL || FILE_REQUEST_TTL_MS) > Date.now() &&
            r.EHash !== ehash,
        ),
      );
      pushFileRequest({
        Type: FileRequestType.GroupChatFile,
        Nonce: nonce,
        EHash: ehash,
        Hash: payload.hash,
        Size: payload.size,
        ChunkCursor: file.chunk_cursor + 1,
        GroupHash: payload.group_hash,
        GroupMember: group_member_map[payload.group_hash],
        SelfAddress: self_address,
        Timestamp: timestamp,
      });

      const file_request = yield call(() =>
        mgAPI.genGroupFileRequest(
          seed,
          payload.group_hash,
          ehash,
          nonce,
          file.chunk_cursor + 1,
        ),
      );
      yield call(SendMessage, { key: payload.key, msg: file_request });
    }
  } catch (e) {
    Logger.error("[FetchGroupChatFile] failed:", e.message);
  }
}

/**
 * Entry point for fetching chat files — routes to private or group handler.
 */
export function* FetchChatFile({ payload }) {
  try {
    const current_session = yield select(
      (state) => state.Messenger.CurrentSession,
    );
    if (current_session.type === SessionType.Private) {
      yield call(FetchPrivateChatFile, {
        payload: {
          key: payload.key,
          remote: current_session.remote,
          hash: payload.hash,
          size: payload.size,
        },
      });
    } else if (current_session.type === SessionType.Group) {
      yield call(FetchGroupChatFile, {
        payload: {
          key: payload.key,
          group_hash: current_session.hash,
          hash: payload.hash,
          size: payload.size,
        },
      });
    }
  } catch (e) {
    Logger.error("[FetchChatFile] failed:", e.message);
  }
}

/**
 * Save a chat file to the device document directory.
 */
export function* SaveChatFile({ payload }) {
  try {
    const file = yield call(() => dbAPI.getFileByHash(payload.hash));
    if (file && file.is_saved) {
      const sourcePath = fileService.getFileFullPath(payload.hash);
      const displayName = `${payload.name}${payload.ext}`;
      const mimeType = yield call(() => guessMimeType(payload.ext));
      yield call(() =>
        RMMediaStore.saveToGallery(sourcePath, displayName, mimeType),
      );
      yield put(
        setFlashNoticeMessage({
          message: "File saved to gallery",
          duration: 2000,
        }),
      );
    } else if (file) {
      yield put(
        setFlashNoticeMessage({
          message: `Fetching file (${file.chunk_cursor}/${file.chunk_length}) from contact...`,
          duration: FLASH_DURATION_MS,
        }),
      );
      yield call(FetchChatFile, {
        payload: { hash: payload.hash, size: payload.size },
      });
    } else {
      yield put(
        setFlashNoticeMessage({
          message: "File record not found, fetching from contact...",
          duration: FLASH_DURATION_MS,
        }),
      );
      yield call(FetchChatFile, {
        payload: { hash: payload.hash, size: payload.size },
      });
    }
  } catch (e) {
    Logger.error("[SaveChatFile] failed:", e.message);
  }
}

/**
 * Send a file to the current chat session (private or group).
 * Reads the file from the given URI, computes hash, stores locally, then sends metadata message.
 * Payload: { file_uri: string } — a mobile-compatible URI
 */
export function* SendFile({ payload }) {
  try {
    const self_address = yield select((state) => state.User.Address);
    const currentSession = yield select(
      (state) => state.Messenger.CurrentSession,
    );

    const file_uri = payload.file_uri || payload.file_path;
    if (!file_uri) {
      yield put(
        setFlashNoticeMessage({
          message: "No file URI provided",
          duration: FLASH_DURATION_MS,
        }),
      );
      return;
    }

    // Get file info and read content
    const fileExists = yield call(() => RNFS.exists(file_uri));
    if (!fileExists) {
      yield put(
        setFlashNoticeMessage({
          message: "File not found",
          duration: FLASH_DURATION_MS,
        }),
      );
      return;
    }

    const fileInfo = yield call(() => RNFS.stat(file_uri));
    if (fileInfo.size > FileMaxSize) {
      yield put(
        setFlashNoticeMessage({
          message: `File too large (more than ${filesize_format(FileMaxSize)})`,
          duration: FLASH_DURATION_MS,
        }),
      );
      return;
    }

    const fileName = file_uri.split("/").pop() || "file";
    const extIndex = fileName.lastIndexOf(".");
    const ext = extIndex >= 0 ? `.${fileName.slice(extIndex + 1)}` : "";
    const name = extIndex >= 0 ? fileName.slice(0, extIndex) : fileName;

    // Read binary content as base64, convert to Uint8Array
    const fileBase64 = yield call(() => RNFS.readFile(file_uri, "base64"));
    const content = base64ToUint8Array(fileBase64);

    const hash = FileHash(content);
    // saveLocalFile is defined below — forward reference via saga call
    yield call(saveLocalFile, hash, content);

    const chunk_length = Math.ceil(fileInfo.size / FileChunkSize);
    let file = yield call(() => dbAPI.getFileByHash(hash));
    if (file === null) {
      yield call(() =>
        dbAPI.addFile(
          hash,
          fileInfo.size,
          Date.now(),
          chunk_length,
          chunk_length,
          true,
        ),
      );
    } else {
      yield call(() => dbAPI.localFileSaved(hash, chunk_length, Date.now()));
      yield put(setFileSavedToken({ hash, timestamp: Date.now() }));
    }

    if (currentSession.type === SessionType.Private) {
      const ehash = PrivateFileEHash(self_address, currentSession.remote, hash);
      let private_chat_file = yield call(() =>
        dbAPI.getPrivateFileByEHash(ehash),
      );
      if (private_chat_file === null) {
        yield call(() =>
          dbAPI.addPrivateFile(
            ehash,
            self_address,
            currentSession.remote,
            hash,
            fileInfo.size,
          ),
        );
      }
      yield call(SendContent, {
        payload: {
          content: {
            ObjectType: MessageObjectType.PrivateChatFile,
            Name: name,
            Ext: ext,
            Size: fileInfo.size,
            Hash: hash,
          },
        },
      });
    } else if (currentSession.type === SessionType.Group) {
      const ehash = GroupFileEHash(currentSession.hash, hash);
      let group_chat_file = yield call(() => dbAPI.getGroupFileByEHash(ehash));
      if (group_chat_file === null) {
        yield call(() =>
          dbAPI.addGroupFile(ehash, currentSession.hash, hash, fileInfo.size),
        );
      }
      yield call(SendContent, {
        payload: {
          content: {
            ObjectType: MessageObjectType.GroupChatFile,
            Name: name,
            Ext: ext,
            Size: fileInfo.size,
            Hash: hash,
          },
        },
      });
    }
  } catch (e) {
    Logger.error("[SendFile] failed:", e.message);
  }
}

/**
 * saveLocalFile — save raw file bytes to the RMS document storage directory.
 * Used by both SendFile and BulletinFileAdd.
 */
export function* saveLocalFile(hash, content) {
  try {
    const filePath = fileService.getFileFullPath(hash);
    yield call(() => fileService.writeFile(filePath, content));
  } catch (e) {
    Logger.error("[saveLocalFile] failed for", hash, e.message);
  }
}

// ==================== Incomplete file resume (auto-download) ====================

/**
 * Startup: scan all incomplete files (is_saved=0) and resume downloading them.
 * Respects the autoDownload* settings. Orphan files (no source) are skipped.
 * Private/group files abort gracefully if ECDH handshake is not ready yet.
 */
export function* ResumeIncompleteFiles({ payload } = {}) {
  try {
    const self_address =
      payload?.address || (yield select((state) => state.User.Address));
    if (!self_address) return;

    const files = yield call(() => dbAPI.getIncompleteFiles(self_address));
    for (const f of files) {
      if (f.type === "bulletin") {
        const auto = yield call(
          getSettingBool,
          "autoDownloadFollowFiles",
          true,
        );
        if (auto) {
          yield fork(safeFork, FetchBulletinFile, {
            payload: { hash: f.hash, size: f.size },
          });
        }
      } else if (f.type === "private" && f.private_remote) {
        const auto = yield call(
          getSettingBool,
          "autoDownloadPrivateFiles",
          true,
        );
        if (auto) {
          yield fork(safeFork, FetchPrivateChatFile, {
            payload: { remote: f.private_remote, hash: f.hash, size: f.size },
          });
        }
      } else if (f.type === "group" && f.group_hash) {
        const auto = yield call(getSettingBool, "autoDownloadGroupFiles", true);
        if (auto) {
          yield fork(safeFork, FetchGroupChatFile, {
            payload: { group_hash: f.group_hash, hash: f.hash, size: f.size },
          });
        }
      }
      // orphan: no source, skip
    }
  } catch (e) {
    Logger.error("[ResumeIncompleteFiles] failed:", e.message);
  }
}

/**
 * Page-entry (bulletin detail): resume incomplete files for this bulletin.
 * payload: { hash: bulletin_hash }
 */
export function* ResumeBulletinFiles({ payload }) {
  try {
    const auto = yield call(getSettingBool, "autoDownloadFollowFiles", true);
    if (!auto) return;
    const files = yield call(() =>
      dbAPI.getIncompleteBulletinFiles(payload.hash),
    );
    for (const f of files) {
      yield fork(safeFork, FetchBulletinFile, {
        payload: { hash: f.hash, size: f.size },
      });
    }
  } catch (e) {
    Logger.error("[ResumeBulletinFiles] failed:", e.message);
  }
}

/**
 * Page-entry (private/group chat): resume incomplete files for this session.
 * payload: { type: 'private'|'group', remote?, group_hash? }
 */
export function* ResumeChatFiles({ payload }) {
  try {
    const self_address = yield select((state) => state.User.Address);
    if (!self_address) return;

    if (payload.type === "private" && payload.remote) {
      const auto = yield call(getSettingBool, "autoDownloadPrivateFiles", true);
      if (!auto) return;
      const files = yield call(() =>
        dbAPI.getIncompletePrivateFiles(self_address, payload.remote),
      );
      for (const f of files) {
        yield fork(safeFork, FetchPrivateChatFile, {
          payload: { remote: payload.remote, hash: f.hash, size: f.size },
        });
      }
    } else if (payload.type === "group" && payload.group_hash) {
      const auto = yield call(getSettingBool, "autoDownloadGroupFiles", true);
      if (!auto) return;
      const files = yield call(() =>
        dbAPI.getIncompleteGroupFiles(payload.group_hash),
      );
      for (const f of files) {
        yield fork(safeFork, FetchGroupChatFile, {
          payload: {
            group_hash: payload.group_hash,
            hash: f.hash,
            size: f.size,
          },
        });
      }
    }
  } catch (e) {
    Logger.error("[ResumeChatFiles] failed:", e.message);
  }
}
