// WebSocket Listener — main incoming-message router.
//
// This is the top-level saga that consumes globalWsChannel and dispatches
// each incoming message to the appropriate handler module:
//   - binary chunks  -> messenger.ws.binary.js  (handleBinaryMessage)
//   - Action codes   -> messenger.ws.action.js  (handleActionMessage)
//   - Object types   -> messenger.ws.object.js  (handleObjectMessage)
//   - control plane  -> handleControlMessage (below)

import { cancelled, call, fork, put, select, take } from "redux-saga/effects";
import { FLASH_DURATION_MS } from "../../lib/AppConst";
import Logger from "../../lib/Logger";
import { mgAPI } from "../../lib/MessageGenerator";
import { ActionCode, ObjectType, MessageCode, ControlActionCode, ErrorMessageMap } from "../../lib/MessengerConst";
import { globalWsChannel } from "../../lib/WebsocketUtil";
import { setFlashNoticeMessage } from "../slices/CommonSlice";
import { SendMessage } from "./messenger.core";
import { AvatarRequest, SubscribeFollow, FetchFollowBulletin } from "./messenger.bulletin";
import { AutoSyncPrivateMessages } from "./messenger.private";
import { UpdateConnStatus } from "./MessengerSaga";

import { handleBinaryMessage } from "./messenger.ws.binary";
import { handleActionMessage } from "./messenger.ws.action";
import { handleObjectMessage } from "./messenger.ws.object";

function handleControlMessage(json) {
  const msgCode = json.MessageCode;
  const msgText = json.ErrorMessage || ErrorMessageMap[msgCode];

  // Error codes (701-704): Show FlashNotice warning
  if (msgCode >= 701 && msgCode <= 704) {
    Logger.warn(`[ServerNotify] Error ${msgCode}: ${msgText}`, json);
    return setFlashNoticeMessage({
      message: msgText,
      duration: FLASH_DURATION_MS * 2,
    });
  }

  // Notification codes (710-712): Show FlashNotice info
  if (msgCode >= 710 && msgCode <= 712) {
    Logger.info(`[ServerNotify] Notification ${msgCode}: ${msgText}`, json);
    return setFlashNoticeMessage({
      message: msgText,
      duration: FLASH_DURATION_MS,
    });
  }

  // Cache confirmation codes (720/721/723): Silent — server just confirming storage
  if (
    msgCode === MessageCode.BulletinCached ||
    msgCode === MessageCode.PrivateMsgCached ||
    msgCode === MessageCode.HandshakeCached
  ) {
    Logger.debug(`[ServerNotify] Cache confirmation ${msgCode}`);
    return null; // No UI update needed
  }

  // File transfer progress codes (730-732)
  if (msgCode >= 730 && msgCode <= 732) {
    Logger.info(
      `[ServerNotify] File transfer ${msgCode}: ${json.Hash || "unknown"}`,
      json,
    );
    let progressText = "";
    if (msgCode === MessageCode.FileChunkReceived && json.ProgressInfo) {
      const { ReceivedBytes, TotalBytes } = json.ProgressInfo;
      const pct = TotalBytes
        ? Math.round((ReceivedBytes / TotalBytes) * 100)
        : "?";
      progressText = `Upload chunk: ${pct}% (${ReceivedBytes}/${TotalBytes} bytes)`;
    } else if (msgCode === MessageCode.FileTransferComplete) {
      progressText = "File transfer complete";
    } else if (msgCode === MessageCode.FileTransferFailed) {
      progressText = "File transfer failed";
    }
    if (progressText) {
      return setFlashNoticeMessage({
        message: progressText,
        duration: FLASH_DURATION_MS,
      });
    }
  }

  // Unknown MessageCode
  Logger.warn(`[ServerNotify] Unknown MessageCode: ${msgCode}`, json);
  return null;
}

// ---------- WebSocket Listener ----------
export function* WebsocketListener() {
  const channel = globalWsChannel;
  let cachedSeed = null;
  let cachedAddress = null;
  let isFirstMessage = true;

  try {
    while (true) {
      try {
        const action = yield take(channel);
        switch (action.type) {
          case "status":
            Logger.info("!!!conn status change:", action);
            if (action.status === WebSocket.OPEN) {
              yield call(UpdateConnStatus, action);
              cachedSeed = yield select((state) => state.User.Seed);
              cachedAddress = yield select((state) => state.User.Address);
              if (!cachedSeed) {
                continue;
              }
              const msg = yield call(() => mgAPI.genDeclare(cachedSeed));
              yield call(SendMessage, { key: action.key, msg: msg });
              Logger.info(`[WS] Declare sent to ${action.key}`);
              // Background-sync private messages with ALL friends after Declare
              yield fork(AutoSyncPrivateMessages);
              yield call(AvatarRequest, { payload: { flag: true } });
              yield call(SubscribeFollow);
              yield call(FetchFollowBulletin);
            } else if (action.status === WebSocket.CLOSED) {
              yield call(UpdateConnStatus, action);
              cachedSeed = null;
              cachedAddress = null;
            } else if (action.status === "error") {
              yield call(UpdateConnStatus, action);
            } else if (action.status === "retries_exhausted") {
              Logger.warn(
                `[WS] Retries exhausted for ${action.key}, cleared declared state`,
              );
            }
            break;
          case "message":
            Logger.debug("!!!received message: ", action);
            if (isFirstMessage) {
              Logger.info(
                "[WS] First message received from server:",
                action.key,
              );
              isFirstMessage = false;
            }
            if (!cachedSeed) {
              continue;
            }
            if (action.isBinary) {
              yield call(handleBinaryMessage, action);
            } else {
              const json = action.data;
              // Control-plane messages (ActionCode 8xx) — server notifications/errors
              if (
                json.ActionCode === ControlActionCode.ServerNotify ||
                json.ActionCode === ControlActionCode.ServerNotifyAckReq
              ) {
                const controlAction = handleControlMessage(json);
                if (controlAction) {
                  yield put(controlAction);
                }
                // If ServerNotifyAckReq, send ACK back
                if (json.ActionCode === ControlActionCode.ServerNotifyAckReq) {
                  yield call(SendMessage, {
                    key: action.key,
                    msg: JSON.stringify({
                      ActionCode: ControlActionCode.ClientAck,
                      AckFor: json.MessageCode,
                    }),
                  });
                }
              } else if (
                json.Action &&
                (json.To === undefined || json.To === cachedAddress)
              ) {
                yield call(
                  handleActionMessage,
                  json,
                  action,
                  cachedAddress,
                  cachedSeed,
                );
              } else if (json.ObjectType) {
                yield call(
                  handleObjectMessage,
                  json,
                  action,
                  cachedAddress,
                  cachedSeed,
                );
              } else {
                Logger.warn(
                  "[WS] DROPPED text message — no Action/ObjectType/ActionCode",
                  typeof json,
                  "keys:",
                  Object.keys(json).slice(0, 8).join(","),
                );
              }
            }
            break;
        }
      } catch (e) {
        Logger.error(
          "[WebsocketListener] unhandled error processing message:",
          e.message,
          e.stack,
        );
      }
    }
  } finally {
    if (yield cancelled()) {
      Logger.info("[WebsocketListener] saga cancelled, terminating cleanly");
    }
  }
}
