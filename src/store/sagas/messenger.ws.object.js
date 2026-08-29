// Object WebSocket message handlers (ObjectType routing: bulletins, private, group, ECDH).
// Split out of messenger.ws.js (see WebsocketListener for the main loop).

import * as rippleKeyPairs from "ripple-keypairs";
import Elliptic from "elliptic";
import { call, fork, put, select } from "redux-saga/effects";
import { dbAPI } from "../../db";
import {
  FLASH_DURATION_MS,
  SessionType,
  DefaultPartition,
} from "../../lib/AppConst";
import {
  AesDecrypt,
  genAESKey,
  HalfSHA512,
  QuarterSHA512Message,
} from "../../lib/AppUtil";
import Logger from "../../lib/Logger";
import { shortenAddress } from "../../lib/format";
import { getSettingBool } from "../../lib/SettingsUtil";
import { mgAPI } from "../../lib/MessageGenerator";
import {
  GenesisHash,
  ObjectType,
  MessageObjectType,
} from "../../lib/MessengerConst";
import { DHSequence, VerifyJsonSignature } from "../../lib/MessengerUtil";
import {
  setServerAddressList,
  setDisplayBulletinReplyList,
  setTagBulletinList,
  setRandomBulletinList,
} from "../slices/MessengerSlice";
import { setFlashNoticeMessage } from "../slices/CommonSlice";
import { showPushNotification } from "../../services/notificationService";
import { playNotificationSound } from "../../lib/SoundUtil";
import {
  checkBulletinSchema,
  checkECDHHandshakeSchema,
  checkGroupListSchema,
  checkGroupMessageListSchema,
  checkMessageObjectSchema,
  checkPrivateMessageSchema,
  deriveJson,
  checkReplyBulletinListSchema,
  checkTagBulletinListSchema,
  checkAvatarListSchema,
  checkRandomBulletinListSchema,
  checkServerAddressListSchema,
} from "../../lib/MessageSchemaVerifier";
import { SendMessage, safeFork } from "./messenger.core";
import {
  CacheBulletin,
  RequestNextBulletin,
  RequestAvatarFile,
} from "./messenger.bulletin";
import { FetchPrivateChatFile, FetchGroupChatFile } from "./messenger.file";
import {
  SyncPrivateMessage,
  InitHandshake,
  RefreshPrivateMessageList,
} from "./messenger.private";
import { RefreshGroupMessageList, GroupSync } from "./messenger.group";
import { LoadSessionList } from "./messenger.session";
import { LoadGroupList, LoadGroupRequestList } from "./MessengerSaga";

// Module-level EC curve singleton — avoids re-initializing on every ECDH handshake.
const ec = new Elliptic.ec("secp256k1");

// ---------- Object message handlers ----------

function* handleBulletinObject(json) {
  try {
    if (!checkBulletinSchema(json) || !VerifyJsonSignature(json)) return null;
    const ob_address = rippleKeyPairs.deriveAddress(json.PublicKey);
    const autoDownload = yield call(
      getSettingBool,
      "autoDownloadFollowFiles",
      true,
    );
    const bulletin = yield call(CacheBulletin, json, autoDownload);
    const address = yield select((state) => state.User.Address);
    const follow_list = yield select((state) => state.User.FollowList);
    if (follow_list.includes(ob_address) || ob_address === address) {
      yield fork(RequestNextBulletin, {
        key: null,
        payload: { address: ob_address },
      });
    }
    return bulletin;
  } catch (e) {
    Logger.error("[handleBulletinObject] failed for", json.Hash, e.message);
  }
}

function* handleServerAddressListObject(json) {
  if (checkServerAddressListSchema(json)) {
    yield put(setServerAddressList(json));
  }
}

/**
 * Shared helper: process a list of bulletins from a WebSocket message.
 * Validates schema, verifies signatures, caches each bulletin, and dispatches results.
 * @param {object} json - Parsed message with List array
 * @param {function} schemaCheck - AJV schema validator for this list type
 * @param {function} dispatchAction - Redux action creator to dispatch results
 */
function* processBulletinList(json, schemaCheck, dispatchAction) {
  if (!schemaCheck(json)) return;
  const bulletins = [];
  for (let i = 0; i < json.List.length; i++) {
    const bulletin = json.List[i];
    if (VerifyJsonSignature(bulletin)) {
      const b = yield call(CacheBulletin, bulletin, false);
      if (b) {
        bulletins.push(b);
      }
    }
  }
  yield put(dispatchAction(bulletins, json));
}

function* handleReplyBulletinListObject(json) {
  try {
    yield call(
      processBulletinList,
      json,
      checkReplyBulletinListSchema,
      (list, j) =>
        setDisplayBulletinReplyList({
          List: list,
          Page: j.Page,
          TotalPage: j.TotalPage,
        }),
    );
  } catch (e) {
    Logger.error("[handleReplyBulletinListObject] failed:", e.message);
  }
}

function* handleTagBulletinListObject(json) {
  try {
    yield call(
      processBulletinList,
      json,
      checkTagBulletinListSchema,
      (list, j) =>
        setTagBulletinList({
          List: list,
          Page: j.Page,
          TotalPage: j.TotalPage,
        }),
    );
  } catch (e) {
    Logger.error("[handleTagBulletinListObject] failed:", e.message);
  }
}

function* handleRandomBulletinListObject(json) {
  try {
    yield call(
      processBulletinList,
      json,
      checkRandomBulletinListSchema,
      (list) => setRandomBulletinList(list),
    );
  } catch (e) {
    Logger.error("[handleRandomBulletinListObject] failed:", e.message);
  }
}

function* handleAvatarListObject(json) {
  try {
    if (!checkAvatarListSchema(json)) return;
    Logger.info(
      `[handleAvatarListObject] received ${json.List.length} avatars`,
    );
    for (let i = 0; i < json.List.length; i++) {
      const avatar = json.List[i];
      if (VerifyJsonSignature(avatar)) {
        const avatar_address = rippleKeyPairs.deriveAddress(avatar.PublicKey);
        Logger.info(
          `[handleAvatarListObject] avatar for ${avatar_address}, hash=${avatar.Hash}, size=${avatar.Size}`,
        );
        const db_avatar = yield call(() =>
          dbAPI.getAvatarByAddress(avatar_address),
        );
        Logger.info(
          `[handleAvatarListObject] db_avatar=${db_avatar ? "exists" : "null"}`,
        );
        if (db_avatar) {
          Logger.info(
            `[handleAvatarListObject]   db.signed_at=${db_avatar.signed_at} db.hash=${db_avatar.hash} db.is_saved=${db_avatar.is_saved} avatar.Timestamp=${avatar.Timestamp} avatar.Hash=${avatar.Hash}`,
          );
        }
        if (db_avatar !== null) {
          if (db_avatar.signed_at < avatar.Timestamp) {
            if (db_avatar.hash === avatar.Hash && db_avatar.is_saved) {
              yield call(() =>
                dbAPI.updateAvatar(
                  avatar_address,
                  avatar.Hash,
                  avatar.Size,
                  avatar.Timestamp,
                  Date.now(),
                  avatar,
                  true,
                ),
              );
            } else {
              yield call(() =>
                dbAPI.updateAvatar(
                  avatar_address,
                  avatar.Hash,
                  avatar.Size,
                  avatar.Timestamp,
                  Date.now(),
                  avatar,
                  false,
                ),
              );
              yield call(RequestAvatarFile, {
                key: null,
                address: avatar_address,
                hash: avatar.Hash,
              });
            }
          } else if (
            db_avatar.signed_at === avatar.Timestamp &&
            db_avatar.is_saved === false
          ) {
            yield call(RequestAvatarFile, {
              key: null,
              address: avatar_address,
              hash: avatar.Hash,
            });
          }
        } else {
          // DB record doesn't exist yet — create it with server metadata
          yield call(() =>
            dbAPI.addAvatar(
              avatar_address,
              avatar.Hash,
              avatar.Size,
              avatar.Timestamp,
              Date.now(),
              avatar,
              false,
            ),
          );
          yield call(RequestAvatarFile, {
            key: null,
            address: avatar_address,
            hash: avatar.Hash,
          });
        }
      }
    }
  } catch (e) {
    Logger.error("[handleAvatarListObject] failed:", e.message);
  }
}

function* handleECDHHandshakeObject(json, address, seed) {
  try {
    const schema_ok = checkECDHHandshakeSchema(json);
    const to_ok = json.To === address;
    const sig_ok = VerifyJsonSignature(json);
    Logger.info(
      `[DIAG-PRIV] handleECDHHandshakeObject IN from=${json.PublicKey ? "ok" : "?"} To=${json.To} self_addr=${address} schema=${schema_ok} to_ok=${to_ok} sig_ok=${sig_ok} Seq=${json.Sequence} Pair=${JSON.stringify(json.Pair)}`,
    );
    if (!schema_ok || !to_ok || !sig_ok) {
      Logger.warn(
        `[DIAG-PRIV] handleECDHHandshakeObject REJECTED schema=${schema_ok} to_ok=${to_ok} sig_ok=${sig_ok}`,
      );
      return;
    }
    const ob_address = rippleKeyPairs.deriveAddress(json.PublicKey);
    const friend = yield call(() => dbAPI.getFriend(address, ob_address));
    const total_member_list = yield select(
      (state) => state.Messenger.TotalGroupMemberList,
    );
    if (friend !== null || total_member_list.includes(ob_address)) {
      const ecdh = yield call(() =>
        dbAPI.getHandshake(
          address,
          ob_address,
          DefaultPartition,
          json.Sequence,
        ),
      );
      if (ecdh === null) {
        const ecdh_sk = HalfSHA512(
          GenesisHash + seed + address + json.Sequence,
        );
        const self_key_pair = ec.keyFromPrivate(ecdh_sk, "hex");
        const ecdh_pk = self_key_pair.getPublic("hex");
        const timestamp = Date.now();
        const self_json = yield call(() =>
          mgAPI.genECDHHandshake(
            seed,
            DefaultPartition,
            json.Sequence,
            ecdh_pk,
            json.Self,
            ob_address,
            timestamp,
          ),
        );
        const pair_key_pair = ec.keyFromPublic(json.Self, "hex");
        if (!pair_key_pair.validate().result) {
          Logger.error(
            "[handleECDHHandshakeObject] Remote ECDH public key not on secp256k1 curve",
          );
          return;
        }
        const shared_key = self_key_pair
          .derive(pair_key_pair.getPublic())
          .toString("hex");
        const aes_key = genAESKey(
          shared_key,
          address,
          ob_address,
          json.Sequence,
        );
        yield call(() =>
          dbAPI.initHandshakeFromRemote(
            address,
            ob_address,
            DefaultPartition,
            json.Sequence,
            aes_key,
            ecdh_sk,
            ecdh_pk,
            self_json,
            json,
          ),
        );
        yield call(SendMessage, { msg: JSON.stringify(self_json) });
      } else {
        const self_key_pair = ec.keyFromPrivate(ecdh.private_key, "hex");
        const timestamp = Date.now();
        const self_json = yield call(() =>
          mgAPI.genECDHHandshake(
            seed,
            DefaultPartition,
            json.Sequence,
            ecdh.public_key,
            json.Self,
            ob_address,
            timestamp,
          ),
        );
        const pair_key_pair = ec.keyFromPublic(json.Self, "hex");
        if (!pair_key_pair.validate().result) {
          Logger.error(
            "[handleECDHHandshakeObject] Remote ECDH public key not on secp256k1 curve (update)",
          );
          return;
        }
        const shared_key = self_key_pair
          .derive(pair_key_pair.getPublic())
          .toString("hex");
        const aes_key = genAESKey(
          shared_key,
          address,
          ob_address,
          json.Sequence,
        );
        yield call(() =>
          dbAPI.updateHandshake(
            address,
            ob_address,
            DefaultPartition,
            json.Sequence,
            aes_key,
            self_json,
            json,
          ),
        );
        if (json.Pair === "") {
          yield call(SendMessage, { msg: JSON.stringify(self_json) });
        }
      }
    }
  } catch (e) {
    Logger.error("[handleECDHHandshakeObject] failed:", e.message);
  }
}

function* handlePrivateMessageObject(json, address) {
  try {
    if (!checkPrivateMessageSchema(json) || !VerifyJsonSignature(json)) {
      Logger.warn(
        `[DIAG-PRIV] handlePrivateMessageObject REJECTED (schema=${checkPrivateMessageSchema(json)}, sig=${VerifyJsonSignature(json)}) seq=${json.Sequence}`,
      );
      return;
    }
    let ob_address = rippleKeyPairs.deriveAddress(json.PublicKey);
    if (json.To !== address && ob_address !== address) {
      return;
    }
    Logger.info(
      `[DIAG-PRIV] handlePrivateMessageObject RECEIVED from=${ob_address} seq=${json.Sequence} preHash=${(json.PreHash || "").slice(0, 8)}.. to=${json.To}`,
    );
    yield call(processPrivateMessage, json, address, ob_address);
  } catch (e) {
    Logger.error("[handlePrivateMessageObject] failed:", e.message);
  }
}

function* processPrivateMessage(json, address, ob_address) {
  try {
    const is_self = ob_address === address;
    const remote = is_self ? json.To : ob_address;

    const friend = yield call(() => dbAPI.getFriend(address, remote));
    if (friend === null) {
      Logger.warn(
        `[DIAG-PRIV] processPrivateMessage SKIP: no friend record for ${remote}`,
      );
      return;
    }

    const ecdh_sequence = DHSequence(
      DefaultPartition,
      json.Timestamp,
      address,
      remote,
    );
    const ecdh = yield call(() =>
      dbAPI.getHandshake(address, remote, DefaultPartition, ecdh_sequence),
    );
    if (ecdh === null || ecdh.aes_key === null) {
      Logger.info(
        `[DIAG-PRIV] processPrivateMessage: no aes_key yet -> InitHandshake seq=${json.Sequence}`,
      );
      yield call(InitHandshake, {
        key: null,
        ecdh_sequence: ecdh_sequence,
        pair_address: remote,
      });
      return;
    }

    let content = AesDecrypt(json.Content, ecdh.aes_key);
    if (content === null) {
      return;
    }
    let content_json = deriveJson(content);
    if (content_json && checkMessageObjectSchema(content_json)) {
      content = content_json;
    }
    Logger.info(
      `[DIAG-PRIV] processPrivateMessage decrypted content type=${typeof content} ObjectType=${content?.ObjectType} keys=${typeof content === "object" ? Object.keys(content).join(",") : "N/A"}`,
    );

    if (
      typeof content === "object" &&
      content.ObjectType === MessageObjectType.PrivateChatFile
    ) {
      const autoDownload = yield call(
        getSettingBool,
        "autoDownloadPrivateFiles",
        true,
      );
      if (autoDownload) {
        yield fork(safeFork, FetchPrivateChatFile, {
          payload: { remote: remote, hash: content.Hash, size: content.Size },
        });
      }
    }

    const CurrentSession = yield select(
      (state) => state.Messenger.CurrentSession,
    );
    let is_readed = false;
    if (
      CurrentSession &&
      CurrentSession.type === SessionType.Private &&
      CurrentSession.remote === remote
    ) {
      is_readed = true;
    }

    // Check if message already exists (duplicate from sync) — skip chain validation
    const msg_hash = QuarterSHA512Message(json);
    const existing = yield call(() => dbAPI.getPrivateMessageByHash(msg_hash));
    if (existing !== null) {
      Logger.info(
        `[DIAG-PRIV] processPrivateMessage: duplicate seq=${json.Sequence} (already in DB)`,
      );
      return;
    }

    // Chain validation must compare against the LAST message in the SAME direction
    // as the incoming message (ob_address -> json.To). Private messages form TWO
    // independent hash-chains (A->B and B->A), each numbered from 1.
    let last_msg = yield call(() =>
      dbAPI.getLastPrivateMessage(ob_address, json.To),
    );
    Logger.info(
      `[DIAG-PRIV] processPrivateMessage chain check: incoming seq=${json.Sequence} preHash=${(json.PreHash || "").slice(0, 8)}.. last_msg=${last_msg === null ? "null" : `seq=${last_msg.sequence} hash=${last_msg.hash.slice(0, 8)}..`}`,
    );
    let add_result = false;
    if (last_msg === null || json.Sequence === 1) {
      if (json.Sequence === 1 && json.PreHash === GenesisHash) {
        add_result = yield call(() =>
          dbAPI.addPrivateMessage(
            msg_hash,
            ob_address,
            json.To,
            json.Sequence,
            json.PreHash,
            content,
            json,
            json.Timestamp,
            false,
            false,
            is_readed,
            typeof content === "object",
          ),
        );
      } else if (last_msg !== null) {
        Logger.warn(
          `[processPrivateMessage] chain mismatch (last_seq=${last_msg.sequence}, incoming_seq=${json.Sequence})`,
        );
        yield call(SyncPrivateMessage, {
          payload: { key: null, local: address, remote: remote },
        });
      }
    } else {
      if (
        last_msg.sequence + 1 === json.Sequence &&
        last_msg.hash === json.PreHash
      ) {
        add_result = yield call(() =>
          dbAPI.addPrivateMessage(
            msg_hash,
            ob_address,
            json.To,
            json.Sequence,
            json.PreHash,
            content,
            json,
            json.Timestamp,
            false,
            false,
            is_readed,
            typeof content === "object",
          ),
        );
      } else if (last_msg.sequence + 1 < json.Sequence) {
        Logger.warn(
          `[processPrivateMessage] chain gap (last_seq=${last_msg.sequence}, incoming_seq=${json.Sequence})`,
        );
        yield call(SyncPrivateMessage, {
          payload: { key: null, local: address, remote: remote },
        });
      } else {
        Logger.warn(
          `[processPrivateMessage] chain hash mismatch (last_hash=${last_msg.hash.slice(0, 8)}.., preHash=${json.PreHash.slice(0, 8)}..)`,
        );
      }
    }

    if (add_result) {
      Logger.info(
        `[DIAG-PRIV] processPrivateMessage SAVED seq=${json.Sequence} from=${ob_address}`,
      );
      if (
        CurrentSession &&
        CurrentSession.type === SessionType.Private &&
        CurrentSession.remote === remote
      ) {
        yield call(RefreshPrivateMessageList);
      }
      yield call(LoadSessionList);
      // Mobile adaptation: replace Tauri invoke('start_message_flash') with Redux action
      yield put(
        setFlashNoticeMessage({
          message: "New message",
          duration: FLASH_DURATION_MS,
        }),
      );
      // Push notification for private messages — title "New message", body = contact nickname or address
      const notifBody = json.Nickname || remote;
      showPushNotification("New message", notifBody);
      playNotificationSound();
    }
  } catch (e) {
    Logger.error("[processPrivateMessage] failed:", e.message);
  }
}

function* handleGroupListObject(json, address) {
  try {
    if (!checkGroupListSchema(json)) return;
    for (let i = 0; i < json.List.length; i++) {
      const group_json = json.List[i];
      const db_g = yield call(() => dbAPI.getGroupByHash(group_json.Hash));
      if (
        group_json.ObjectType === ObjectType.GroupCreate &&
        VerifyJsonSignature(group_json)
      ) {
        if (
          db_g !== null &&
          db_g.cleared_at !== null &&
          db_g.cleared_at !== undefined
        ) {
          continue;
        }
        if (db_g === null) {
          const created_by = rippleKeyPairs.deriveAddress(group_json.PublicKey);
          if (created_by === address) {
            yield call(() =>
              dbAPI.createGroup(
                group_json.Hash,
                group_json.Name,
                created_by,
                group_json.Member,
                group_json.Timestamp,
                group_json,
                true,
              ),
            );
            yield call(LoadSessionList);
            yield call(LoadGroupList);
          } else if (group_json.Member.includes(address)) {
            yield call(() =>
              dbAPI.createGroup(
                group_json.Hash,
                group_json.Name,
                created_by,
                group_json.Member,
                group_json.Timestamp,
                group_json,
                false,
              ),
            );
            yield call(LoadGroupRequestList);
          }
        }
      } else if (
        group_json.ObjectType === ObjectType.GroupDelete &&
        VerifyJsonSignature(group_json)
      ) {
        if (
          db_g !== null &&
          db_g.cleared_at !== null &&
          db_g.cleared_at !== undefined
        ) {
          continue;
        }
        if (db_g !== null) {
          yield call(() =>
            dbAPI.updateGroupDelete(group_json.Hash, group_json),
          );
        }
      }
    }
  } catch (e) {
    Logger.error("[handleGroupListObject] failed:", e.message);
  }
}

function* handleGroupMessageListObject(json, address, seed) {
  try {
    if (!checkGroupMessageListSchema(json)) return;
    const ob_address = rippleKeyPairs.deriveAddress(json.PublicKey);
    const group = yield call(() => dbAPI.getGroupByHash(json.GroupHash));
    if (group === null) {
      yield call(GroupSync, { key: null });
      return;
    }
    if (group.cleared_at !== null && group.cleared_at !== undefined) return;
    if (group.is_accepted !== true) return;

    const ecdh_sequence = DHSequence(
      DefaultPartition,
      json.Timestamp,
      address,
      ob_address,
    );
    let ecdh = yield call(() =>
      dbAPI.getHandshake(address, ob_address, DefaultPartition, ecdh_sequence),
    );
    if (ecdh === null) {
      yield call(InitHandshake, {
        key: null,
        ecdh_sequence: ecdh_sequence,
        pair_address: ob_address,
      });
      ecdh = yield call(() =>
        dbAPI.getHandshake(
          address,
          ob_address,
          DefaultPartition,
          ecdh_sequence,
        ),
      );
      if (ecdh === null) return;
    }
    if (ecdh.aes_key === null) {
      yield fork(safeFork, SendMessage, {
        msg: JSON.stringify(ecdh.self_json),
      });
      return;
    }

    let unCachedMessageAddress = [];
    for (let i = 0; i < json.List.length; i++) {
      const group_msg = json.List[i];
      const msg_address = rippleKeyPairs.deriveAddress(group_msg.PublicKey);
      const pre_message = yield call(() =>
        dbAPI.getGroupMessageByHash(json.GroupHash, group_msg.PreHash),
      );
      if (
        pre_message === undefined &&
        !(group_msg.Sequence === 1 && group_msg.PreHash === GenesisHash)
      ) {
        unCachedMessageAddress.push(msg_address);
        continue;
      }

      let content = AesDecrypt(group_msg.Content, ecdh.aes_key);
      if (content === null) {
        Logger.error("[GroupMessage] Failed to decrypt message content");
        continue;
      }
      let content_json = deriveJson(content);
      if (content_json && checkMessageObjectSchema(content_json)) {
        content = content_json;
      }

      let verify_json = {
        ObjectType: ObjectType.GroupMessage,
        GroupHash: json.GroupHash,
        Sequence: group_msg.Sequence,
        PreHash: group_msg.PreHash,
        Confirm: group_msg.Confirm,
        Content: content,
        Timestamp: group_msg.Timestamp,
        PublicKey: group_msg.PublicKey,
        Signature: group_msg.Signature,
      };
      if (verify_json.Confirm === undefined) {
        delete verify_json["Confirm"];
      }

      if (!VerifyJsonSignature(verify_json)) continue;

      const hash = QuarterSHA512Message(verify_json);
      if (
        typeof verify_json.Content === "object" &&
        verify_json.Content.ObjectType === MessageObjectType.GroupChatFile
      ) {
        const autoDownload = yield call(
          getSettingBool,
          "autoDownloadGroupFiles",
          true,
        );
        if (autoDownload) {
          yield call(FetchGroupChatFile, {
            payload: {
              key: null,
              group_hash: json.GroupHash,
              hash: verify_json.Content.Hash,
              size: verify_json.Content.Size,
            },
          });
        }
      }

      let is_readed = false;
      const CurrentSession = yield select(
        (state) => state.Messenger.CurrentSession,
      );
      if (
        CurrentSession &&
        CurrentSession.type === SessionType.Group &&
        CurrentSession.hash === json.GroupHash
      ) {
        is_readed = true;
      }

      const add_result = yield call(() =>
        dbAPI.addGroupMessage(
          hash,
          json.GroupHash,
          msg_address,
          verify_json.Sequence,
          verify_json.PreHash,
          verify_json.Content,
          verify_json,
          verify_json.Timestamp,
          false,
          false,
          is_readed,
          typeof verify_json.Content === "object",
        ),
      );
      if (add_result) {
        if (
          CurrentSession &&
          CurrentSession.type === SessionType.Group &&
          CurrentSession.hash === json.GroupHash
        ) {
          yield call(RefreshGroupMessageList);
        }
        yield call(LoadSessionList);
        // Mobile adaptation: replace Tauri invoke('start_message_flash') with Redux action
        yield put(
          setFlashNoticeMessage({
            message: "New group message",
            duration: FLASH_DURATION_MS,
          }),
        );
        // Push notification for group messages — title "Group message", body = group name + sender
        const groupNotifBody = `${group.Name}: ${shortenAddress(msg_address)}`;
        showPushNotification("Group message", groupNotifBody);
        playNotificationSound();
      }
    }

    unCachedMessageAddress = [...new Set(unCachedMessageAddress)];
    for (let i = 0; i < unCachedMessageAddress.length; i++) {
      const msg_address = unCachedMessageAddress[i];
      const last_msg = yield call(() =>
        dbAPI.getMemberLastGroupMessage(json.GroupHash, msg_address),
      );
      let sequence = 0;
      if (last_msg !== null) {
        sequence = last_msg.sequence;
      }
      const group_msg_sync_request = yield call(() =>
        mgAPI.genGroupMessageSync(
          seed,
          json.GroupHash,
          msg_address,
          sequence,
          ob_address,
        ),
      );
      yield call(SendMessage, { msg: JSON.stringify(group_msg_sync_request) });
    }
  } catch (e) {
    Logger.error(
      "[handleGroupMessageListObject] failed for group",
      json.GroupHash,
      e.message,
    );
  }
}

// ---------- Object message dispatcher ----------
export function* handleObjectMessage(json, _action, address, seed) {
  try {
    if (json.ObjectType === ObjectType.Bulletin) {
      yield call(handleBulletinObject, json);
    } else if (json.ObjectType === ObjectType.ServerAddressList) {
      yield call(handleServerAddressListObject, json);
    } else if (json.ObjectType === ObjectType.ReplyBulletinList) {
      yield call(handleReplyBulletinListObject, json);
    } else if (json.ObjectType === ObjectType.TagBulletinList) {
      yield call(handleTagBulletinListObject, json);
    } else if (json.ObjectType === ObjectType.RandomBulletinList) {
      yield call(handleRandomBulletinListObject, json);
    } else if (json.ObjectType === ObjectType.AvatarList) {
      yield call(handleAvatarListObject, json);
    } else if (json.ObjectType === ObjectType.ECDH) {
      yield call(handleECDHHandshakeObject, json, address, seed);
    } else if (json.ObjectType === ObjectType.PrivateMessage) {
      yield call(handlePrivateMessageObject, json, address);
    } else if (json.ObjectType === ObjectType.GroupList) {
      yield call(handleGroupListObject, json, address);
    } else if (json.ObjectType === ObjectType.GroupMessageList) {
      yield call(handleGroupMessageListObject, json, address, seed);
    } else {
      Logger.warn("[handleObjectMessage] unknown ObjectType", json.ObjectType);
    }
  } catch (e) {
    Logger.error(
      "[handleObjectMessage] failed for ObjectType",
      json.ObjectType,
      e.message,
    );
  }
}

/**
 * Handle control-plane messages from server (ActionCode 800 ServerNotify).
 * Routes MessageCode 7xx to appropriate UI response:
 * - 701-704: Error -> FlashNotice warning
 * - 710-712: Notification -> FlashNotice info
 * - 720/721/723: Cache confirmation -> silent (optional brief indicator)
 * - 730-732: File transfer progress -> FlashNotice update
 */
