import { call, delay, select } from "redux-saga/effects";
import Logger from "../../lib/Logger";
import { dbAPI } from "../../db";
import {
  createMultiWsChannel,
  sendToAllConn,
  sendToFirstConn,
  sendToSingleConn,
} from "../../lib/WebsocketUtil";
import { genNonce } from "../../lib/MessengerUtil";
import { FILE_REQUEST_TTL_MS } from "../../lib/AppConst";

/** Module-level mutable state for tracking active file transfer requests. */
let _FileRequestList = [];

export function getFileRequestList() {
  return _FileRequestList;
}

export function setFileRequestList(value) {
  _FileRequestList = value;
}

/**
 * Calculate dynamic TTL based on file size.
 * Slow network (100KB/s): 64MB needs ~10.7 minutes.
 * Fast network (1MB/s): 64MB needs ~1.1 minutes.
 * Use a generous formula: base TTL + (fileSize / estimatedSpeed)
 */
function calculateFileTTL(fileSize) {
  // Assume minimum 50KB/s network speed
  const estimatedSeconds = fileSize / (50 * 1024) + 30; // 30s overhead
  return Math.max(
    FILE_REQUEST_TTL_MS,
    Math.min(estimatedSeconds * 1000, 15 * 60 * 1000),
  ); // cap at 15 min
}

export function pushFileRequest(item) {
  const now = Date.now();
  // Use dynamic TTL from item if available, otherwise default
  _FileRequestList = _FileRequestList.filter((r) => {
    const itemTTL = r.TTL || FILE_REQUEST_TTL_MS;
    return r.Timestamp + itemTTL > now;
  });
  // If no TTL set, calculate from file size
  if (!item.TTL && item.Size) {
    item.TTL = calculateFileTTL(item.Size);
  }
  _FileRequestList.push(item);
}

/**
 * Safe fork wrapper — runs a saga in the background and catches any errors.
 * `fork` never rejects its Task, so errors in forked sagas are silently swallowed.
 * Use as: yield fork(safeFork, sagaFn, ...args)
 */
export function* safeFork(sagaFn, ...args) {
  try {
    yield call(sagaFn, ...args);
  } catch (e) {
    Logger.error(`[safeFork] error in ${sagaFn.name}:`, e.message);
  }
}

/**
 * Unified message sender.
 * Routes to a specific connection (payload.key), highest-priority server (payload.flag), or all connections.
 */
export function* SendMessage(payload) {
  try {
    if (payload.key) {
      yield call(sendToSingleConn, payload.key, payload.msg);
    } else if (payload.flag) {
      const priority_server_list = yield call(() =>
        dbAPI.getServerListByPriority(),
      );
      yield call(sendToFirstConn, priority_server_list, payload.msg);
    } else {
      yield call(sendToAllConn, payload.msg);
    }
  } catch (e) {
    Logger.error("[SendMessage] failed to send message:", e.message, {
      key: payload.key,
      flag: payload.flag,
    });
  }
}

/** Connect to all servers marked as is_connect in the ServerList. */
export function* ConnectServer() {
  try {
    const ServerList = yield select((state) => state.Messenger.ServerList);
    const configs = ServerList.filter((s) => s.is_connect);
    // 500ms grace before opening WebSocket connections: allows any pending
    // Redux actions (e.g., server list updates from a prior navigation) to
    // settle so we connect against the latest config rather than a stale one.
    yield delay(500);
    yield call(createMultiWsChannel, configs);
  } catch (e) {
    Logger.error("[ConnectServer] failed to connect servers:", e.message);
  }
}

/** Generate a unique nonce that does not collide with existing file requests. */
export function genFileNonce() {
  for (let attempts = 0; attempts < 10; attempts++) {
    let nonce = genNonce();
    let collision = false;
    for (let i = 0; i < _FileRequestList.length; i++) {
      if (_FileRequestList[i].Nonce === nonce) {
        collision = true;
        break;
      }
    }
    if (!collision) return nonce;
  }
  throw new Error("Cannot generate unique file nonce after 10 attempts");
}
