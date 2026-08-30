import Elliptic from "elliptic";
import { all, call, fork, put, select } from "redux-saga/effects";

// Module-level EC curve singleton — avoids re-initializing on every ECDH handshake.
const ec = new Elliptic.ec("secp256k1");

import { SendMessage } from "./messenger.core";
import { LoadSessionList } from "./messenger.session";
import { dbAPI } from "../../db";
import {
  FLASH_DURATION_MS,
  SessionType,
  DefaultPartition,
} from "../../lib/AppConst";
import { MessageObjectType } from "../../lib/MessengerConst";
import {
  AesEncrypt,
  ConsoleError,
  HalfSHA512,
  QuarterSHA512Message,
} from "../../lib/AppUtil";
import Logger from "../../lib/Logger";
import { mgAPI } from "../../lib/MessageGenerator";
import { GenesisHash } from "../../lib/MessengerConst";
import { DHSequence } from "../../lib/MessengerUtil";
import { setFlashNoticeMessage } from "../slices/CommonSlice";
import {
  setCurrentSession,
  setCurrentSessionMessageList,
  setForwardBulletin,
  setForwardFlag,
} from "../slices/MessengerSlice";

/** Sync private message state with the remote peer via the server. */
export function* SyncPrivateMessage({ payload }) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) {
      return;
    }

    const current_self_msg = yield call(() =>
      dbAPI.getLastPrivateMessage(payload.local, payload.remote),
    );
    let self_sequence = 0;
    if (current_self_msg !== null) {
      self_sequence = current_self_msg.sequence;
    }

    const current_pair_msg = yield call(() =>
      dbAPI.getLastPrivateMessage(payload.remote, payload.local),
    );
    let pair_sequence = 0;
    if (current_pair_msg !== null) {
      pair_sequence = current_pair_msg.sequence;
    }

    Logger.info(
      `[DIAG-PRIV] SyncPrivateMessage remote=${payload.remote} self_seq=${self_sequence} pair_seq=${pair_sequence}`,
    );
    const private_sync_request = yield call(() =>
      mgAPI.genPrivateMessageSync(
        seed,
        payload.remote,
        pair_sequence,
        self_sequence,
      ),
    );
    yield call(SendMessage, { key: payload.key, msg: private_sync_request });
    Logger.info(`[DIAG-PRIV] SyncPrivateMessage SENT to server`);
  } catch (e) {
    Logger.error("[SyncPrivateMessage] failed:", e.message);
  }
}

/**
 * After Declare completes, silently sync private messages with ALL friends.
 * Runs in the background via fork — does not block WebSocket listener.
 */
export function* AutoSyncPrivateMessages() {
  try {
    const self_address = yield select((state) => state.User.Address);
    if (!self_address) {
      return;
    }

    const friends = yield call(() => dbAPI.getMyFriends(self_address));
    if (!friends || friends.length === 0) {
      return;
    }

    Logger.info(
      `[AutoSyncPrivateMessages] syncing ${friends.length} contacts...`,
    );
    // Fork all syncs concurrently — they're fire-and-forget;
    // incoming messages will be handled by processPrivateMessage normally.
    yield all(
      friends.map(
        (f) => () =>
          fork(SyncPrivateMessage, {
            payload: { local: self_address, remote: f.remote },
          }),
      ),
    );

    // Give server time to return synced messages (they arrive as normal WS messages)
    // Then refresh session list so badges reflect newly received unread counts.
    yield call(LoadSessionList);
    Logger.info("[AutoSyncPrivateMessages] done");
  } catch (e) {
    Logger.error("[AutoSyncPrivateMessages] failed:", e.message);
  }
}

/** Initiate an ECDH handshake with a peer. */
export function* InitHandshake(payload) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) {
      return;
    }
    const self_address = yield select((state) => state.User.Address);
    if (payload.pair_address === self_address) {
      return;
    }
    let timestamp = Date.now();
    const ecdh_sk = HalfSHA512(
      GenesisHash + seed + self_address + payload.ecdh_sequence,
    );
    const key_pair = ec.keyFromPrivate(ecdh_sk, "hex");
    const ecdh_pk = key_pair.getPublic("hex");
    const self_json = yield call(() =>
      mgAPI.genECDHHandshake(
        seed,
        DefaultPartition,
        payload.ecdh_sequence,
        ecdh_pk,
        "",
        payload.pair_address,
        timestamp,
      ),
    );
    yield call(() =>
      dbAPI.initHandshakeFromLocal(
        self_address,
        payload.pair_address,
        DefaultPartition,
        payload.ecdh_sequence,
        ecdh_sk,
        ecdh_pk,
        self_json,
      ),
    );
    yield fork(SendMessage, { msg: JSON.stringify(self_json) });
  } catch (e) {
    Logger.error(
      "[InitHandshake] failed with",
      payload.pair_address,
      e.message,
    );
  }
}

/** Load a private chat session, establishing ECDH if needed. */
export function* LoadPrivateSession({ payload }) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) {
      return;
    }
    const self_address = yield select((state) => state.User.Address);
    let timestamp = Date.now();
    const pair_address = payload.address;
    const ecdh_sequence = DHSequence(
      DefaultPartition,
      timestamp,
      self_address,
      pair_address,
    );
    let session = {
      type: SessionType.Private,
      remote: pair_address,
      partition_sequence: ecdh_sequence,
    };

    const ecdh = yield call(() =>
      dbAPI.getHandshake(
        self_address,
        pair_address,
        DefaultPartition,
        ecdh_sequence,
      ),
    );
    let ecdh_detail = "null";
    if (ecdh !== null) {
      let sj = {};
      try {
        sj = JSON.parse(ecdh.self_json);
      } catch (e) {
        sj = { parse_error: e.message };
      }
      ecdh_detail = `seq=${ecdh.sequence} aes_key=${ecdh.aes_key === null ? "null" : "ready"} self_json.Seq=${sj.Sequence} self_json.Pair=${JSON.stringify(sj.Pair)} self_json.To=${sj.To}`;
    }
    Logger.info(
      `[DIAG-PRIV] LoadPrivateSession remote=${pair_address} cur_ecdh_seq=${ecdh_sequence} local=[${ecdh_detail}]`,
    );
    if (ecdh !== null) {
      let sj_str = "?";
      try {
        sj_str = JSON.stringify(ecdh.self_json);
      } catch (e) {
        sj_str = "stringify_error:" + e.message;
      }
      Logger.info(
        `[DIAG-PRIV] self_json OBJ (first 400): ${sj_str.substring(0, 400)}`,
      );
    }
    if (ecdh === null) {
      Logger.info(`[DIAG-PRIV] -> InitHandshake (no local handshake)`);
      yield call(InitHandshake, {
        ecdh_sequence: ecdh_sequence,
        pair_address: pair_address,
      });
    } else {
      if (ecdh.aes_key !== null) {
        session.aes_key = ecdh.aes_key;
        Logger.info(`[DIAG-PRIV] -> SyncPrivateMessage (aes_key ready)`);
        yield call(SyncPrivateMessage, {
          payload: { local: self_address, remote: pair_address },
        });
      } else {
        Logger.info(`[DIAG-PRIV] -> resend handshake self_json`);
        yield fork(SendMessage, { msg: JSON.stringify(ecdh.self_json) });
      }
    }

    let all_msgs = yield call(() =>
      dbAPI.getPrivateSession(self_address, pair_address),
    );
    // Only use the user's own messages for sequence/hash (per-sender sequence)
    let my_msgs =
      all_msgs && all_msgs.length > 0
        ? all_msgs.filter((m) => m.sour === self_address)
        : [];
    let current_msg = my_msgs.length > 0 ? my_msgs[my_msgs.length - 1] : null;
    if (current_msg !== null) {
      session.current_sequence = current_msg.sequence;
      session.current_hash = current_msg.hash;
    } else {
      session.current_sequence = 0;
      session.current_hash = GenesisHash;
    }
    yield put(setCurrentSession(session));
    yield call(() => dbAPI.readPrivateSession(self_address, pair_address));
    yield call(LoadSessionList);
    yield call(RefreshPrivateMessageList);
  } catch (e) {
    Logger.error(
      "[LoadPrivateSession] failed with",
      payload.address,
      e.message,
    );
  }
}

/** Send a message in the current private chat session. */
export function* SendPrivateContent({ payload }) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) {
      return;
    }
    let timestamp = Date.now();
    const self_address = yield select((state) => state.User.Address);
    const CurrentSession = yield select(
      (state) => state.Messenger.CurrentSession,
    );
    if (!CurrentSession) {
      return false;
    }

    if (CurrentSession.aes_key !== undefined) {
      let content = AesEncrypt(payload.content, CurrentSession.aes_key);

      const last_unconfirmed_msg = yield call(() =>
        dbAPI.getLastUnconfirmPrivateMessage(
          CurrentSession.remote,
          self_address,
        ),
      );
      Logger.info(
        `[DIAG-CONFIRM] remote=${CurrentSession.remote} self=${self_address} last_unconfirmed=${last_unconfirmed_msg === null ? "null" : `seq=${last_unconfirmed_msg.sequence} hash=${last_unconfirmed_msg.hash}`}`,
      );
      let to_confirm_msg = null;

      if (last_unconfirmed_msg !== null) {
        to_confirm_msg = {
          Sequence: last_unconfirmed_msg.sequence,
          Hash: last_unconfirmed_msg.hash,
        };
      }

      if (to_confirm_msg !== null) {
        yield call(() =>
          dbAPI.confirmPrivateMessage(
            CurrentSession.remote,
            self_address,
            to_confirm_msg.Sequence,
          ),
        );
      }

      const msg_json = yield call(() =>
        mgAPI.genPrivateMessage(
          seed,
          CurrentSession.current_sequence + 1,
          CurrentSession.current_hash,
          to_confirm_msg,
          content,
          CurrentSession.remote,
          timestamp,
        ),
      );
      let hash = QuarterSHA512Message(msg_json);
      yield call(() =>
        dbAPI.addPrivateMessage(
          hash,
          self_address,
          CurrentSession.remote,
          CurrentSession.current_sequence + 1,
          CurrentSession.current_hash,
          payload.content,
          msg_json,
          timestamp,
          false,
          false,
          true,
          typeof payload.content === "object",
        ),
      );

      let tmp_session = { ...CurrentSession };
      tmp_session.current_sequence = CurrentSession.current_sequence + 1;
      tmp_session.current_hash = hash;
      yield put(setCurrentSession(tmp_session));

      yield call(RefreshPrivateMessageList);

      yield call(SendMessage, { msg: JSON.stringify(msg_json) });
      return true;
    } else {
      ConsoleError("aeskey not ready...");
      yield put(
        setFlashNoticeMessage({
          message: "Handshake not complete, please try again",
          duration: FLASH_DURATION_MS,
        }),
      );
      return false;
    }
  } catch (e) {
    Logger.error("[SendPrivateContent] failed:", e.message);
    return false;
  }
}

export function* RefreshPrivateMessageList() {
  try {
    const CurrentSession = yield select(
      (state) => state.Messenger.CurrentSession,
    );
    if (!CurrentSession) {
      return;
    }
    const self_address = yield select((state) => state.User.Address);
    const raw_list = yield call(() =>
      dbAPI.getPrivateSession(self_address, CurrentSession.remote),
    );
    const current_msg_list = raw_list.map((m) => {
      if (m.is_object && typeof m.content === "string") {
        try {
          m.content = JSON.parse(m.content);
        } catch {
          /* ignore */
        }
      }
      return m;
    });
    Logger.info(
      `[DIAG-PRIV] RefreshPrivateMessageList remote=${CurrentSession.remote} count=${current_msg_list.length}`,
    );
    yield put(setCurrentSessionMessageList(current_msg_list));
  } catch (e) {
    Logger.error("[RefreshPrivateMessageList] failed:", e.message);
  }
}

export function* ShowForwardBulletin({ payload }) {
  yield put(setForwardBulletin(payload));
  yield put(setForwardFlag(true));
}

export function* ForwardBulletin({ payload }) {
  try {
    yield put(setForwardFlag(false));
    yield call(LoadPrivateSession, { payload: payload.session });
    const forward_bulletin = yield select(
      (state) => state.Messenger.ForwardBulletin,
    );
    // Ensure the bulletin object has ObjectType set for addPrivateMessage
    const content = {
      ...forward_bulletin,
      ObjectType: MessageObjectType.Bulletin,
    };
    const success = yield call(SendPrivateContent, {
      payload: {
        content: content,
      },
    });
    if (success) {
      yield put(
        setFlashNoticeMessage({
          message: "Bulletin forwarded successfully",
          duration: FLASH_DURATION_MS,
        }),
      );
    }
  } catch (e) {
    Logger.error("[ForwardBulletin] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to forward bulletin",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}
