// Action WebSocket message handlers (Action code routing: file requests, sync).
// Split out of messenger.ws.js (see WebsocketListener for the main loop).

import * as rippleKeyPairs from "ripple-keypairs";
import { call, fork, select } from "redux-saga/effects";
import { dbAPI } from "../../db";
import * as fileService from "../../services/fileService";
import { DefaultPartition, FileChunkSize } from "../../lib/AppConst";
import { AesEncrypt, AesEncryptBuffer } from "../../lib/AppUtil";
import Logger from "../../lib/Logger";
import { mgAPI } from "../../lib/MessageGenerator";
import {
  ActionCode,
  FileRequestType,
  ObjectType,
  Epoch,
} from "../../lib/MessengerConst";
import {
  DHSequence,
  VerifyJsonSignature,
  getMemberIndex,
  Uint32ToBuffer,
  concatUint8Arrays,
} from "../../lib/MessengerUtil";
import {
  checkAvatarRequestSchema,
  checkBulletinRequestSchema,
  checkFileRequestSchema,
  checkGroupMessageSyncSchema,
  checkGroupSyncSchema,
  checkPrivateMessageSyncSchema,
} from "../../lib/MessageSchemaVerifier";
import { SendMessage, safeFork } from "./messenger.core";
import { RequestNextBulletin } from "./messenger.bulletin";
import { InitHandshake } from "./messenger.private";
import { GroupSync } from "./messenger.group";

// ---------- Action message handlers ----------

function* handleAvatarRequestAction(json, action) {
  try {
    if (checkAvatarRequestSchema(json) && VerifyJsonSignature(json)) {
      let new_list = [];
      for (let i = 0; i < json.List.length; i++) {
        const avatar = json.List[i];
        const db_avatar = yield call(() =>
          dbAPI.getAvatarByAddress(avatar.Address),
        );
        if (
          db_avatar !== null &&
          db_avatar.signed_at > avatar.SignedAt &&
          db_avatar.json !== null
        ) {
          new_list.push(db_avatar.json);
        }
      }
      if (new_list.length > 0) {
        let avatar_response = {
          ObjectType: ObjectType.AvatarList,
          List: new_list,
        };
        yield call(SendMessage, {
          key: action.key,
          msg: JSON.stringify(avatar_response),
        });
      }
    }
  } catch (e) {
    Logger.error("[handleAvatarRequestAction] failed:", e.message);
  }
}

function* handleBulletinRequestAction(json, action, address, seed) {
  try {
    if (checkBulletinRequestSchema(json) && VerifyJsonSignature(json)) {
      let bulletin = null;
      if (json.Hash) {
        bulletin = yield call(() => dbAPI.getBulletinByHash(json.Hash));
      } else {
        bulletin = yield call(() =>
          dbAPI.getBulletinBySequence(json.Address, json.Sequence),
        );
      }
      if (bulletin !== null) {
        yield call(SendMessage, {
          key: action.key,
          msg: JSON.stringify(bulletin.json),
        });
      } else if (json.Address === address) {
        const last_bulletin = yield call(() =>
          dbAPI.getLastBulletin(json.Address),
        );
        if (last_bulletin === null) {
          if (json.Sequence > 1) {
            const msg = yield call(() =>
              mgAPI.genBulletinRequest(seed, address, 1, address),
            );
            yield call(SendMessage, { key: action.key, msg: msg });
          }
        } else if (last_bulletin.sequence + 1 < json.Sequence) {
          yield call(RequestNextBulletin, {
            key: action.key,
            payload: { address: address },
          });
        }
      }
    }
  } catch (e) {
    Logger.error("[handleBulletinRequestAction] failed:", e.message);
  }
}

/**
 * Handle incoming FileRequest from a peer.
 * Reads the requested file chunk from local storage and sends it back as binary data
 * with a 4-byte nonce prefix. For private/group files, encrypts using ECDH AES key.
 */
function* handleFileRequestAction(json, action, address, ob_address) {
  try {
    if (!checkFileRequestSchema(json) || !VerifyJsonSignature(json)) return;

    const nonceBytes = Uint32ToBuffer(json.Nonce);

    if (json.FileType === FileRequestType.File) {
      // Bulletin file — no encryption
      yield call(sendBulletinFileChunk, json, action, address, nonceBytes);
    } else if (json.FileType === FileRequestType.PrivateChatFile) {
      // Private chat file — AES encrypted per peer pair
      yield call(
        sendPrivateChatFileChunk,
        json,
        action,
        address,
        ob_address,
        nonceBytes,
      );
    } else if (json.FileType === FileRequestType.GroupChatFile) {
      // Group chat file — AES encrypted + sender index prefix
      yield call(
        sendGroupChatFileChunk,
        json,
        action,
        address,
        ob_address,
        nonceBytes,
      );
    }
  } catch (e) {
    Logger.error("[handleFileRequestAction] failed:", e.message, e.stack);
  }
}

/**
 * Send a bulletin file chunk to the requesting peer.
 * No encryption — raw bytes over WebSocket.
 */
function* sendBulletinFileChunk(json, action, _address, nonceBytes) {
  const file = yield call(() => dbAPI.getFileByHash(json.Hash));
  if (!file || !file.is_saved) return;

  const filePath = fileService.getFileFullPath(json.Hash);

  let content;
  if (file.size <= FileChunkSize) {
    content = yield call(() => fileService.readFile(filePath));
  } else {
    // Read specific chunk from the full file
    const allContent = yield call(() => fileService.readFile(filePath));
    const start = (json.ChunkCursor - 1) * FileChunkSize;
    const length = Math.min(FileChunkSize, file.size - start);
    content = allContent.slice(start, start + length);
  }

  // Send: [nonce][content]
  const message = concatUint8Arrays([nonceBytes, content]);
  yield call(SendMessage, { key: action.key, msg: message });
}

/**
 * Send a private chat file chunk to the requesting peer.
 * Encrypts using the ECDH AES key for this peer pair.
 */
function* sendPrivateChatFileChunk(
  json,
  action,
  address,
  ob_address,
  nonceBytes,
) {
  const private_chat_file = yield call(() =>
    dbAPI.getPrivateFileByEHash(json.Hash),
  );
  if (!private_chat_file) return;

  const file = yield call(() => dbAPI.getFileByHash(private_chat_file.hash));
  if (!file || !file.is_saved) return;

  const filePath = fileService.getFileFullPath(file.hash);

  let content;
  if (file.size <= FileChunkSize) {
    content = yield call(() => fileService.readFile(filePath));
  } else {
    const allContent = yield call(() => fileService.readFile(filePath));
    const start = (json.ChunkCursor - 1) * FileChunkSize;
    const length = Math.min(FileChunkSize, file.size - start);
    content = allContent.slice(start, start + length);
  }

  // Encrypt with ECDH AES key
  const ecdh_sequence = DHSequence(
    DefaultPartition,
    json.Timestamp,
    address,
    ob_address,
  );
  const ecdh = yield call(() =>
    dbAPI.getHandshake(address, ob_address, DefaultPartition, ecdh_sequence),
  );
  if (!ecdh?.aes_key) return;

  const encryptedContent = AesEncryptBuffer(content, ecdh.aes_key);
  const message = concatUint8Arrays([nonceBytes, encryptedContent]);
  yield call(SendMessage, { key: action.key, msg: message });
}

/**
 * Send a group chat file chunk to the requesting peer.
 * Encrypts using per-peer ECDH AES key and includes sender index.
 * Format: [nonce][sender_index_4bytes][AES_encrypted_chunk]
 */
function* sendGroupChatFileChunk(
  json,
  action,
  address,
  ob_address,
  nonceBytes,
) {
  const group_member_map = yield select(
    (state) => state.Messenger.GroupMemberMap,
  );
  const members = group_member_map[json.GroupHash];
  if (!members || !members.includes(ob_address)) return;

  const senderIndex = getMemberIndex(members, address);
  const indexBytes = Uint32ToBuffer(senderIndex);

  const group_chat_file = yield call(() =>
    dbAPI.getGroupFileByEHash(json.Hash),
  );
  if (!group_chat_file) return;

  const file = yield call(() => dbAPI.getFileByHash(group_chat_file.hash));
  if (!file || !file.is_saved) return;

  const filePath = fileService.getFileFullPath(file.hash);

  let content;
  if (file.size <= FileChunkSize) {
    content = yield call(() => fileService.readFile(filePath));
  } else {
    const allContent = yield call(() => fileService.readFile(filePath));
    const start = (json.ChunkCursor - 1) * FileChunkSize;
    const length = Math.min(FileChunkSize, file.size - start);
    content = allContent.slice(start, start + length);
  }

  // Encrypt with per-peer ECDH AES key
  // Use json.Timestamp to match the requester's ECDH sequence
  const ecdh_sequence = DHSequence(
    DefaultPartition,
    json.Timestamp,
    address,
    ob_address,
  );
  const ecdh = yield call(() =>
    dbAPI.getHandshake(address, ob_address, DefaultPartition, ecdh_sequence),
  );
  if (!ecdh?.aes_key) return;

  const encryptedContent = AesEncryptBuffer(content, ecdh.aes_key);
  const message = concatUint8Arrays([nonceBytes, indexBytes, encryptedContent]);
  yield call(SendMessage, { key: action.key, msg: message });
}

function* handlePrivateMessageSyncAction(json, action, address, ob_address) {
  try {
    if (checkPrivateMessageSyncSchema(json) && VerifyJsonSignature(json)) {
      const friend = yield call(() => dbAPI.getFriend(address, ob_address));
      if (friend !== null) {
        const unsyncMessageList = yield call(() =>
          dbAPI.getUnsyncPrivateSession(
            address,
            ob_address,
            json.PairSequence,
            json.SelfSequence,
          ),
        );
        for (let i = 0; i < unsyncMessageList.length; i++) {
          const msg = unsyncMessageList[i];
          yield call(SendMessage, { key: action.key, msg: msg.json });
        }
      }
    }
  } catch (e) {
    Logger.error("[handlePrivateMessageSyncAction] failed:", e.message);
  }
}

function* handleGroupSyncAction(json, action) {
  try {
    if (checkGroupSyncSchema(json) && VerifyJsonSignature(json)) {
      const group_list = yield select((state) => state.Messenger.GroupList);
      let tmp_list = [];
      for (let i = 0; i < group_list.length; i++) {
        const group = group_list[i];
        if (group.delete_json !== null) {
          tmp_list.push(group.delete_json);
        } else {
          tmp_list.push(group.create_json);
        }
      }
      if (tmp_list.length > 0) {
        let group_response = {
          ObjectType: ObjectType.GroupList,
          List: tmp_list,
        };
        yield call(SendMessage, {
          key: action.key,
          msg: JSON.stringify(group_response),
        });
      }
    }
  } catch (e) {
    Logger.error("[handleGroupSyncAction] failed:", e.message);
  }
}

function* handleGroupMessageSyncAction(
  json,
  action,
  address,
  ob_address,
  seed,
) {
  try {
    if (checkGroupMessageSyncSchema(json) && VerifyJsonSignature(json)) {
      let timestamp = Date.now();
      const group = yield call(() => dbAPI.getGroupByHash(json.Hash));
      if (group === null) {
        yield call(GroupSync, { key: action.key });
      } else if (
        group.is_accepted === true &&
        (group.created_by === ob_address || group.member.includes(ob_address))
      ) {
        const ecdh_sequence = DHSequence(
          DefaultPartition,
          timestamp,
          address,
          ob_address,
        );
        let ecdh = yield call(() =>
          dbAPI.getHandshake(
            address,
            ob_address,
            DefaultPartition,
            ecdh_sequence,
          ),
        );
        if (ecdh === null && address !== ob_address) {
          yield call(InitHandshake, {
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
        }
        if (ecdh === null || ecdh.aes_key === null) {
          if (ecdh) {
            yield fork(safeFork, SendMessage, {
              key: action.key,
              msg: JSON.stringify(ecdh.self_json),
            });
          }
        } else {
          let tmp_msg_list = [];
          if (json.Sequence === 0) {
            tmp_msg_list = yield call(() =>
              dbAPI.getUnsyncGroupSession(json.Hash, Epoch),
            );
          } else {
            const current_msg = yield call(() =>
              dbAPI.getGroupMessageBySequence(
                json.Hash,
                json.Address,
                json.Sequence,
              ),
            );
            if (current_msg !== null) {
              tmp_msg_list = yield call(() =>
                dbAPI.getUnsyncGroupSession(json.Hash, current_msg.signed_at),
              );
            } else {
              const last_group_member_msg = yield call(() =>
                dbAPI.getLastGroupMemberMessage(json.Hash, json.Address),
              );
              let group_member_sequence = 0;
              if (last_group_member_msg !== null) {
                group_member_sequence = last_group_member_msg.sequence;
              }
              const group_msg_sync_request = yield call(() =>
                mgAPI.genGroupMessageSync(
                  seed,
                  json.Hash,
                  json.Address,
                  group_member_sequence,
                  json.Address,
                ),
              );
              yield call(SendMessage, {
                key: action.key,
                msg: JSON.stringify(group_msg_sync_request),
              });
            }
          }
          if (tmp_msg_list.length > 0) {
            let list = [];
            for (let i = 0; i < tmp_msg_list.length; i++) {
              const tmp_msg = tmp_msg_list[i];
              let tmp_msg_json = JSON.parse(tmp_msg.json);
              // Re-encrypt with our ECDH key for this peer
              let encrypt_content = AesEncrypt(
                tmp_msg_json.Content,
                ecdh.aes_key,
              );
              tmp_msg_json.Content = encrypt_content;
              delete tmp_msg_json["ObjectType"];
              delete tmp_msg_json["GroupHash"];
              list.push(tmp_msg_json);
            }
            const group_msg_list_json = yield call(() =>
              mgAPI.genGroupMessageList(
                seed,
                json.Hash,
                ob_address,
                list,
                timestamp,
              ),
            );
            yield call(SendMessage, {
              key: action.key,
              msg: JSON.stringify(group_msg_list_json),
            });
          }
        }
      }
    }
  } catch (e) {
    Logger.error("[handleGroupMessageSyncAction] failed:", e.message);
  }
}

// ---------- Action message dispatcher ----------
export function* handleActionMessage(json, action, address, seed) {
  try {
    let ob_address = rippleKeyPairs.deriveAddress(json.PublicKey);
    switch (json.Action) {
      case ActionCode.AvatarRequest:
        yield call(handleAvatarRequestAction, json, action);
        break;
      case ActionCode.BulletinRequest:
        yield call(handleBulletinRequestAction, json, action, address, seed);
        break;
      case ActionCode.FileRequest:
        yield call(handleFileRequestAction, json, action, address, ob_address);
        break;
      case ActionCode.PrivateMessageSync:
        yield call(
          handlePrivateMessageSyncAction,
          json,
          action,
          address,
          ob_address,
        );
        break;
      case ActionCode.GroupSync:
        yield call(handleGroupSyncAction, json, action);
        break;
      case ActionCode.GroupMessageSync:
        yield call(
          handleGroupMessageSyncAction,
          json,
          action,
          address,
          ob_address,
          seed,
        );
        break;
      case ActionCode.Declare:
        // Server sends its own Declare to identify itself; nothing to do
        break;
      default:
        Logger.warn("[handleActionMessage] unknown ActionCode", json.Action);
    }
  } catch (e) {
    Logger.error(
      "[handleActionMessage] failed for Action",
      json.Action,
      e.message,
    );
  }
}
