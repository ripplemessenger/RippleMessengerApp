/**
 * messenger.bulletin.js (mobile)
 *
 * Bulletin saga generators — full implementation including CacheBulletin
 * (the critical path for incoming bulletins from the server).
 */

import RNFS from "react-native-fs";
import * as rippleKeyPairs from "ripple-keypairs";

import { all, call, put, select, fork, delay } from "redux-saga/effects";

import { dbAPI } from "../../db";
import {
  FLASH_DURATION_MS,
  BulletinPageSize,
  FileChunkSize,
  FileMaxSize,
  Hour,
} from "../../lib/AppConst";
import { filesize_format, QuarterSHA512Message } from "../../lib/AppUtil";
import Logger from "../../lib/Logger";
import { mgAPI } from "../../lib/MessageGenerator";
import {
  Epoch,
  FileRequestType,
  GenesisHash,
  ListItemMax,
  ObjectType,
} from "../../lib/MessengerConst";
import { FileHash, base64ToUint8Array } from "../../lib/MessengerUtil";
import * as fileService from "../../services/fileService";
import { setFlashNoticeMessage } from "../slices/CommonSlice";
import {
  setPortalBulletinList,
  setDisplayBulletin,
  setDisplayBulletinReplyList,
  setCurrentBulletinSequence,
  setPublishTagList,
  setPublishQuoteList,
  setPublishFileList,
  setBookmarkBulletinList,
  setTagBulletinList,
  setAddressBulletinList,
  setFollowBulletinList,
  setRandomBulletinList,
  setFileSavedToken,
} from "../slices/MessengerSlice";

import {
  SendMessage,
  genFileNonce,
  getFileRequestList,
  setFileRequestList,
  safeFork,
} from "./messenger.core";
import { FetchBulletinFile } from "./messenger.file";

// ==================== Bulletin Cache & Upload ====================

/**
 * Cache an incoming bulletin JSON into local SQLite.
 * This is the critical path: without it, bulletins received from the server
 * are never stored and the feed stays empty.
 *
 * @param {object} bulletin_json - Raw bulletin object with Sequence, PreHash, Content, Tag, Quote, File, PublicKey, Timestamp
 */
export function* CacheBulletin(bulletin_json, autoDownload = true) {
  try {
    const address = rippleKeyPairs.deriveAddress(bulletin_json.PublicKey);
    let bulletin_db = yield call(() =>
      dbAPI.getBulletinBySequence(address, bulletin_json.Sequence),
    );
    if (bulletin_db === null) {
      const new_bulletin_hash = QuarterSHA512Message(bulletin_json);
      const result = yield call(() =>
        dbAPI.addBulletin(
          new_bulletin_hash,
          address,
          bulletin_json.Sequence,
          bulletin_json.PreHash,
          bulletin_json.Content,
          bulletin_json,
          bulletin_json.Timestamp,
        ),
      );
      if (result) {
        if (bulletin_json.Tag) {
          yield call(() =>
            dbAPI.addTagsToBulletin(
              new_bulletin_hash,
              bulletin_json.Timestamp,
              bulletin_json.Tag,
            ),
          );
        }
        if (bulletin_json.Quote) {
          yield call(() =>
            dbAPI.addReplyToBulletins(
              bulletin_json.Quote,
              new_bulletin_hash,
              bulletin_json.Timestamp,
            ),
          );
        }
        if (bulletin_json.File) {
          for (let i = 0; i < bulletin_json.File.length; i++) {
            const f = bulletin_json.File[i];
            const chunk_length = Math.ceil(f.Size / FileChunkSize);
            const file = yield call(() => dbAPI.getFileByHash(f.Hash));
            if (file === null) {
              yield call(() =>
                dbAPI.addFile(
                  f.Hash,
                  f.Size,
                  Date.now(),
                  chunk_length,
                  0,
                  false,
                ),
              );
            }
            if (autoDownload) {
              yield fork(safeFork, FetchBulletinFile, {
                payload: { hash: f.Hash },
              });
            }
          }
          yield call(() =>
            dbAPI.addFilesToBulletin(new_bulletin_hash, bulletin_json.File),
          );
        }
        yield fork(safeFork, RefreshPortalBulletin);
        yield fork(safeFork, RefreshFollowBulletin);
      }
      bulletin_db = yield call(() =>
        dbAPI.getBulletinBySequence(address, bulletin_json.Sequence),
      );
    }
    return bulletin_db;
  } catch (e) {
    Logger.error("[CacheBulletin] failed for", bulletin_json.Hash, e.message);
    return null;
  }
}

export function* UploadBulletin({ payload }) {
  const bulletin = yield call(CacheBulletin, payload.json);
  if (bulletin !== null) {
    yield put(
      setFlashNoticeMessage({
        message: "bulletin saved",
        duration: FLASH_DURATION_MS,
      }),
    );
  } else {
    yield put(
      setFlashNoticeMessage({
        message: "bulletin not saved...",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

// ==================== Avatar ====================

export function* CheckAvatar({ payload }) {
  try {
    const db_avatar = yield call(() =>
      dbAPI.getAvatarByAddress(payload.address),
    );
    if (db_avatar === null) {
      // No local record — create placeholder. The AvatarRequest flow
      // (handleAvatarListObject) will update this with the server's
      // current hash and request the file with the correct hash.
      yield call(() =>
        dbAPI.addAvatar(
          payload.address,
          GenesisHash,
          0,
          Epoch,
          Epoch,
          null,
          false,
        ),
      );
    }
    // If is_saved === false, do NOT request the file here.
    // The AvatarRequest → handleAvatarListObject flow already uses
    // the server-provided hash (which may be newer than the DB hash).
    // Requesting with the stale DB hash causes a hash mismatch.
  } catch (e) {
    Logger.error("[CheckAvatar] failed for", payload.address, e.message);
  }
}

export function* SaveSelfAvatar({ payload }) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) return;
    const address = yield select((state) => state.User.Address);
    const db_avatar = yield call(() => dbAPI.getAvatarByAddress(address));
    const avatar_json = yield call(() =>
      mgAPI.genAvatarJson(seed, payload.hash, payload.size, payload.timestamp),
    );
    if (db_avatar !== null) {
      yield call(() =>
        dbAPI.updateAvatar(
          address,
          payload.hash,
          payload.size,
          payload.timestamp,
          payload.timestamp,
          avatar_json,
          true,
        ),
      );
    } else {
      yield call(() =>
        dbAPI.addAvatar(
          address,
          payload.hash,
          payload.size,
          payload.timestamp,
          payload.timestamp,
          avatar_json,
          true,
        ),
      );
    }

    const avatar_response = {
      ObjectType: ObjectType.AvatarList,
      List: [avatar_json],
    };
    yield call(SendMessage, { msg: JSON.stringify(avatar_response) });
  } catch (e) {
    Logger.error("[SaveSelfAvatar] failed:", e.message);
  }
}

export function* AvatarRequest({ payload }) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) {
      Logger.info("[AvatarRequest] no seed, skip");
      return;
    }
    let timestamp = Date.now();
    const old_avatar_list = yield call(() => dbAPI.getAvatarOldList());
    Logger.info(
      `[AvatarRequest] old_avatar_list length: ${old_avatar_list.length}, flag: ${payload.flag}`,
    );
    old_avatar_list.forEach((a) =>
      Logger.info(
        `[AvatarRequest]   addr: ${a.address}, signed_at: ${a.signed_at}, is_saved: ${a.is_saved}`,
      ),
    );
    let list = [];
    for (let i = 0; i < old_avatar_list.length; i++) {
      const avatar = old_avatar_list[i];
      if (avatar.updated_at < timestamp - Hour || payload.flag) {
        list.push({ Address: avatar.address, SignedAt: avatar.signed_at });
        yield call(() =>
          dbAPI.updateAvatarUpdatedAt(avatar.address, timestamp),
        );
      }
    }
    Logger.info(`[AvatarRequest] list to send: ${list.length}`);
    if (list.length > 0) {
      const avatar_request = yield call(() =>
        mgAPI.genAvatarRequest(seed, list),
      );
      yield call(SendMessage, { msg: avatar_request });
    }
  } catch (e) {
    Logger.error("[AvatarRequest] failed:", e.message);
  }
}

export function* RequestAvatarFile(payload) {
  Logger.info(
    `[RequestAvatarFile] called: hash=${payload.hash}, address=${payload.address}`,
  );
  if (payload.hash === GenesisHash) {
    Logger.info(`[RequestAvatarFile] hash is GenesisHash, skip`);
    return;
  }
  const seed = yield select((state) => state.User.Seed);
  if (!seed) {
    Logger.info(`[RequestAvatarFile] no seed, skip`);
    return;
  }

  // Clean up expired file requests
  const now = Date.now();
  const list = yield call(getFileRequestList);
  setFileRequestList(list.filter((r) => r.Timestamp + 120000 > now));

  const nonce = yield call(genFileNonce);
  const tmp = {
    Type: FileRequestType.Avatar,
    Nonce: nonce,
    Hash: payload.hash,
    Address: payload.address,
    Timestamp: Date.now(),
  };
  const reqList = yield call(getFileRequestList);
  reqList.push(tmp);
  setFileRequestList(reqList);

  const avatar_file_request = yield call(() =>
    mgAPI.genFileRequest(seed, FileRequestType.Avatar, payload.hash, nonce, 1),
  );
  yield call(SendMessage, { key: payload.key, msg: avatar_file_request });
}

// ==================== Bulletin Loading ====================

export function* RequestNextBulletin({ payload }) {
  const seed = yield select((state) => state.User.Seed);
  if (!seed) return;
  const last_bulletin = yield call(() =>
    dbAPI.getLastBulletin(payload.address),
  );
  let request_sequence = 1;
  if (last_bulletin !== null) {
    request_sequence = last_bulletin.sequence + 1;
  }
  const bulletin_request = yield call(() =>
    mgAPI.genBulletinRequest(
      seed,
      payload.address,
      request_sequence,
      payload.address,
    ),
  );
  yield call(SendMessage, { key: payload.key, msg: bulletin_request });
}

export function* LoadPortalBulletin({ payload }) {
  try {
    const page = payload?.page ?? 1;
    const bulletins = yield call(() => dbAPI.getPortalBulletins(page));
    const total = yield call(() => dbAPI.getPortalBulletinCount());
    const totalPage = Math.max(1, Math.ceil(total / BulletinPageSize));
    yield put(
      setPortalBulletinList({
        List: bulletins,
        Page: page,
        TotalPage: totalPage,
      }),
    );
  } catch (e) {
    Logger.error("[LoadPortalBulletin] failed:", e.message);
  }
}

export function* RefreshPortalBulletin() {
  const page = yield select((state) => state.Messenger.PortalBulletinPage);
  yield fork(LoadPortalBulletin, { payload: { page } });
}

export function* LoadMineBulletinSequence() {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) return;
    const address = yield select((state) => state.User.Address);
    const bulletin_count = yield call(() =>
      dbAPI.getAddressBulletinCount(address),
    );
    yield put(setCurrentBulletinSequence(bulletin_count));
    // Also request own bulletins from server (for first login on new device or after DB clear)
    yield call(FetchMineBulletin);
  } catch (e) {
    Logger.error("[LoadMineBulletinSequence] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to load bulletin sequence",
        duration: 3000,
      }),
    );
  }
}

/**
 * Fetch the current user's own bulletins from the server.
 * Requests the next sequence number that is missing from local DB,
 * so the server can push any bulletins not yet cached locally.
 */
export function* FetchMineBulletin() {
  try {
    const seed = yield select((state) => state.User.Seed);
    const address = yield select((state) => state.User.Address);
    if (!seed || !address) return;

    const local_last = yield call(() => dbAPI.getLastBulletin(address));
    const request_sequence = local_last === null ? 1 : local_last.sequence + 1;

    // Request from server starting at the next missing sequence
    const bulletin_request = yield call(() =>
      mgAPI.genBulletinRequest(seed, address, request_sequence, address),
    );
    yield call(SendMessage, { msg: bulletin_request });
  } catch (e) {
    Logger.error("[FetchMineBulletin] failed:", e.message);
  }
}

export function* LoadAddressBulletin({ payload }) {
  try {
    const bulletins = yield call(() =>
      dbAPI.getAddressBulletins(payload.address, payload.page),
    );
    const total = yield call(() =>
      dbAPI.getAddressBulletinCount(payload.address),
    );
    const totalPage = Math.max(1, Math.ceil(total / BulletinPageSize));
    yield put(
      setAddressBulletinList({
        List: bulletins,
        Page: payload.page,
        TotalPage: totalPage,
      }),
    );
  } catch (e) {
    Logger.error("[LoadAddressBulletin] failed:", e.message);
  }
}

export function* FetchFollowBulletin() {
  try {
    const address = yield select((state) => state.User.Address);
    const seed = yield select((state) => state.User.Seed);
    const follow_list = yield call(() => dbAPI.getMyFollows(address));
    if (follow_list.length === 0) return;

    const remote_addresses = follow_list.map((f) => f.remote);

    // --- Batch 1: latest bulletin per address (single query) ---
    const lastByAddr = yield call(() =>
      dbAPI.getLastBulletinByAddresses(remote_addresses),
    );

    // --- Batch 2: total count per address ---
    const countsMap = {};
    const countResults = yield all(
      remote_addresses.map((addr) =>
        call(() => dbAPI.getAddressBulletinCount(addr)),
      ),
    );
    for (let i = 0; i < remote_addresses.length; i++) {
      countsMap[remote_addresses[i]] = countResults[i];
    }

    // --- Classify: which addresses need sync, which need gap-check ---
    const needSync = []; // no bulletins yet or already up to date
    const needGapCheck = []; // has some but may have holes

    for (let i = 0; i < remote_addresses.length; i++) {
      const addr = remote_addresses[i];
      const last = lastByAddr[addr] || null;
      const count = countsMap[addr] || 0;

      if (last === null) {
        needSync.push(addr);
      } else if (last.sequence === count) {
        needSync.push(addr);
      } else {
        needGapCheck.push({ address: addr, maxSeq: last.sequence, count });
      }
    }

    // --- Fork sync requests for addresses that are empty or already complete ---
    for (const addr of needSync) {
      yield fork(RequestNextBulletin, { payload: { address: addr } });
    }

    // --- Gap-check: batch all (address, sequence) pairs into one query per address ---
    const CHUNK_SIZE = 50;
    // Rate limit: max concurrent requests and throttle between batches
    const MAX_CONCURRENT_REQUESTS = 4;
    const THROTTLE_MS = 100; // 100ms between individual requests
    let activeRequests = 0;

    for (const { address: addr, maxSeq } of needGapCheck) {
      for (let start = 1; start <= maxSeq; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE - 1, maxSeq);
        const pairs = [];
        for (let j = start; j <= end; j++) {
          pairs.push({ address: addr, sequence: j });
        }

        // Single batch query returns set of "addr:seq" strings that exist
        const existingSet = yield call(() =>
          dbAPI.getBulletinSequencesBatch(pairs),
        );

        for (let k = 0; k < pairs.length; k++) {
          if (!existingSet.has(`${addr}:${pairs[k].sequence}`)) {
            // Rate limiting: throttle to prevent network storm
            while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
              yield call(delay, THROTTLE_MS);
            }
            activeRequests++;
            const bulletin_request = yield call(() =>
              mgAPI.genBulletinRequest(seed, addr, pairs[k].sequence, addr),
            );
            yield call(SendMessage, { msg: bulletin_request });
            // Decrement after a short delay to simulate network round-trip
            setTimeout(() => {
              activeRequests--;
            }, THROTTLE_MS);
          }
        }
      }
    }
  } catch (e) {
    Logger.error("[FetchFollowBulletin] failed:", e.message);
  }
}

export function* LoadFollowBulletin({ payload }) {
  try {
    const address = yield select((state) => state.User.Address);
    const follow_list = yield call(() => dbAPI.getMyFollows(address));
    if (follow_list.length > 0) {
      const follow_address_list = [];
      for (let i = 0; i < follow_list.length; i++) {
        const follow = follow_list[i];
        follow_address_list.push(follow.remote);
      }
      const bulletins = yield call(() =>
        dbAPI.getBulletinListByAddresses(
          follow_address_list,
          payload.page,
          "DESC",
        ),
      );
      const total = yield call(() =>
        dbAPI.getBulletinCountByAddresses(follow_address_list),
      );
      const totalPage = Math.max(1, Math.ceil(total / BulletinPageSize));
      yield put(
        setFollowBulletinList({
          List: bulletins,
          Page: payload.page,
          TotalPage: totalPage,
        }),
      );
    } else {
      yield put(setFollowBulletinList({ List: [], Page: 0, TotalPage: 0 }));
    }
  } catch (e) {
    Logger.error("[LoadFollowBulletin] failed:", e.message);
  }
}

export function* RefreshFollowBulletin() {
  const page = yield select((state) => state.Messenger.FollowBulletinPage);
  yield fork(LoadFollowBulletin, { payload: { page: page } });
}

/**
 * LoadBookmarkBulletin — load bookmarked bulletins from local DB.
 * Payload: { page: number }
 */
export function* LoadBookmarkBulletin({ payload }) {
  try {
    const page = payload?.page ?? 1;
    const bulletins = yield call(() => dbAPI.getBulletinListByIsmark(page));
    const total = yield call(() => dbAPI.getBulletinCountByIsmark());
    const totalPage = Math.max(1, Math.ceil(total / BulletinPageSize));
    yield put(
      setBookmarkBulletinList({
        List: bulletins,
        Page: page,
        TotalPage: totalPage,
      }),
    );
  } catch (e) {
    Logger.error("[LoadBookmarkBulletin] failed:", e.message);
  }
}

export function* LoadBulletin(action) {
  try {
    yield put(setDisplayBulletin(null));
    const seed = yield select((state) => state.User.Seed);
    if (!seed) return;

    const bulletin = yield call(() =>
      dbAPI.getBulletinByHash(action.payload.hash),
    );
    if (bulletin === null) {
      let to = action.payload.address;
      if (action.payload.to) {
        to = action.payload.to;
      }
      const msg = yield call(() =>
        mgAPI.genBulletinRequest(
          seed,
          action.payload.address,
          action.payload.sequence,
          to,
        ),
      );
      yield call(SendMessage, { msg: msg });
    }
    yield put(setDisplayBulletin(bulletin));
  } catch (e) {
    Logger.error("[LoadBulletin] failed for", action.payload.hash, e.message);
  }
}

export function* RequestRandomBulletin() {
  try {
    yield put(setRandomBulletinList([]));
    const seed = yield select((state) => state.User.Seed);
    if (!seed) return;
    const random_bulletin_request = yield call(() =>
      mgAPI.genRandomBulletinRequest(seed),
    );
    yield call(SendMessage, { msg: random_bulletin_request });
  } catch (e) {
    Logger.error("[RequestRandomBulletin] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to load random bulletins",
        duration: 3000,
      }),
    );
  }
}

export function* RequestServerAddress({ payload }) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) return;
    const bulletin_address_request = yield call(() =>
      mgAPI.genServerAddressRequest(seed, payload.page),
    );
    yield call(SendMessage, {
      key: payload.url,
      msg: bulletin_address_request,
    });
  } catch (e) {
    Logger.error("[RequestServerAddress] failed:", e.message);
  }
}

/**
 * RequestReplyBulletin — load replies for a bulletin from server or local DB.
 * Payload: { hash: string, page: number }
 */
export function* RequestReplyBulletin({ payload }) {
  try {
    const connect_status = yield select(
      (state) => state.Messenger.MessengerConnStatus,
    );
    if (!connect_status) {
      // Offline: load replies from local DB
      const display_bulletin = yield select(
        (state) => state.Messenger.DisplayBulletin,
      );
      if (!display_bulletin) return;
      const reply_hash_list = yield call(() =>
        dbAPI.getReplyHashListByBulletinHash(
          display_bulletin.hash,
          payload.page,
        ),
      );
      const replys = yield call(() =>
        dbAPI.getBulletinListByHash(reply_hash_list),
      );
      const reply_count = yield call(() =>
        dbAPI.getReplyCount(display_bulletin.hash),
      );
      const total_page = Math.max(1, Math.ceil(reply_count / BulletinPageSize));
      yield put(
        setDisplayBulletinReplyList({
          List: replys,
          Page: payload.page,
          TotalPage: total_page,
        }),
      );
    } else {
      // Online: request replies from server
      const seed = yield select((state) => state.User.Seed);
      if (!seed) return;
      const reply_bulletin_request = yield call(() =>
        mgAPI.genReplyBulletinRequest(seed, payload.hash, payload.page),
      );
      yield call(SendMessage, { msg: reply_bulletin_request });
    }
  } catch (e) {
    Logger.error("[RequestReplyBulletin] failed:", e.message);
  }
}

/**
 * RequestTagBulletin — load bulletins matching a tag from server or local DB.
 * Payload: { tag: string, page: number }
 */
export function* RequestTagBulletin({ payload }) {
  try {
    const connect_status = yield select(
      (state) => state.Messenger.MessengerConnStatus,
    );
    if (!connect_status) {
      // Offline: query local DB for bulletins matching the tag
      const tag_ids = yield call(() => dbAPI.getTagIdListByName([payload.tag]));
      if (tag_ids.length === 0) {
        yield put(
          setTagBulletinList({ List: [], Page: payload.page, TotalPage: 1 }),
        );
        return;
      }
      const bulletin_hashes = yield call(() =>
        dbAPI.getBulletinHashListByTagId(tag_ids, payload.page),
      );
      const bulletins = yield call(() =>
        dbAPI.getBulletinListByHash(bulletin_hashes),
      );
      const total = yield call(() =>
        dbAPI.getBulletinHashCountByTagId(tag_ids),
      );
      const total_page = Math.max(1, Math.ceil(total / BulletinPageSize));
      yield put(
        setTagBulletinList({
          List: bulletins,
          Page: payload.page,
          TotalPage: total_page,
        }),
      );
    } else {
      // Online: request tag bulletins from server
      const seed = yield select((state) => state.User.Seed);
      if (!seed) return;
      const tag_bulletin_request = yield call(() =>
        mgAPI.genTagBulletinRequest(seed, payload.tag, payload.page),
      );
      yield call(SendMessage, { msg: tag_bulletin_request });
    }
  } catch (e) {
    Logger.error("[RequestTagBulletin] failed:", e.message);
  }
}

// ==================== Bulletin Publish ====================

export function* PublishBulletin(action) {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) {
      yield put(
        setFlashNoticeMessage({
          message: "Not logged in",
          duration: FLASH_DURATION_MS,
        }),
      );
      return;
    }
    const address = yield select((state) => state.User.Address);
    const tag = yield select((state) => state.Messenger.PublishTagList);
    const quote = yield select((state) => state.Messenger.PublishQuoteList);
    const file = yield select((state) => state.Messenger.PublishFileList);

    // Determine chain linkage: sequence and pre_hash from last local bulletin
    let bulletin_json;
    let timestamp = Date.now();
    const last_bulletin = yield call(() => dbAPI.getLastBulletin(address));
    if (last_bulletin === null) {
      // First bulletin for this address — link to genesis hash
      bulletin_json = yield call(() =>
        mgAPI.genBulletinJson(
          seed,
          1,
          GenesisHash,
          tag,
          quote,
          file,
          action.payload.content,
          timestamp,
        ),
      );
    } else {
      bulletin_json = yield call(() =>
        mgAPI.genBulletinJson(
          seed,
          last_bulletin.sequence + 1,
          last_bulletin.hash,
          tag,
          quote,
          file,
          action.payload.content,
          timestamp,
        ),
      );
    }

    // Compute hash of the signed bulletin JSON
    const bulletin_json_hash = QuarterSHA512Message(bulletin_json);

    // Store in local SQLite
    yield call(() =>
      dbAPI.addBulletin(
        bulletin_json_hash,
        address,
        bulletin_json.Sequence,
        bulletin_json.PreHash,
        bulletin_json.Content,
        bulletin_json,
        bulletin_json.Timestamp,
      ),
    );

    // Store associated tags in the tags / bulletin_tags tables
    if (bulletin_json.Tag && bulletin_json.Tag.length > 0) {
      yield call(() =>
        dbAPI.addTagsToBulletin(
          bulletin_json_hash,
          bulletin_json.Timestamp,
          bulletin_json.Tag,
        ),
      );
    }

    // Store quote references as reply links
    if (bulletin_json.Quote && bulletin_json.Quote.length > 0) {
      yield call(() =>
        dbAPI.addReplyToBulletins(
          bulletin_json.Quote,
          bulletin_json_hash,
          bulletin_json.Timestamp,
        ),
      );
    }

    // Store file attachments
    if (bulletin_json.File && bulletin_json.File.length > 0) {
      yield call(() =>
        dbAPI.addFilesToBulletin(bulletin_json_hash, bulletin_json.File),
      );
    }

    // Update Redux: bump current sequence and clear publish staging lists
    yield put(setCurrentBulletinSequence(bulletin_json.Sequence));
    yield put(setPublishTagList([]));
    yield put(setPublishQuoteList([]));
    yield put(setPublishFileList([]));

    // Refresh the portal feed so the new bulletin appears
    yield fork(RefreshPortalBulletin);

    // If the user is viewing their own bulletins, refresh that too
    const bulletin_address = yield select(
      (state) => state.Messenger.BulletinAddress,
    );
    if (bulletin_address === address) {
      yield fork(LoadAddressBulletin, { payload: { address, page: 1 } });
    }

    // Send the signed bulletin to all connected servers
    yield call(SendMessage, { msg: JSON.stringify(bulletin_json) });

    yield put(
      setFlashNoticeMessage({
        message: "Bulletin published successfully",
        duration: FLASH_DURATION_MS,
      }),
    );
  } catch (e) {
    Logger.error("[PublishBulletin] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "bulletin publish failed",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

export function* BulletinTagAdd({ payload }) {
  try {
    const old_list = yield select((state) => state.Messenger.PublishTagList);
    let new_list = [...old_list, ...payload.tag_list];
    // Deduplicate while preserving insertion order (oldest first)
    new_list = [...new Set(new_list)];
    if (new_list.length > ListItemMax) {
      // Trim from the front to keep newest tags
      new_list = new_list.slice(new_list.length - ListItemMax);
    }
    yield put(setPublishTagList(new_list));
  } catch (e) {
    Logger.error("[BulletinTagAdd] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to add tag",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

export function* BulletinTagDel({ payload }) {
  try {
    const old_list = yield select((state) => state.Messenger.PublishTagList);
    let new_list = [...old_list];
    new_list = new_list.filter((t) => t !== payload.Tag);
    yield put(setPublishTagList(new_list));
  } catch (e) {
    Logger.error("[BulletinTagDel] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to remove tag",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

export function* BulletinQuoteAdd({ payload }) {
  try {
    const old_list = yield select((state) => state.Messenger.PublishQuoteList);
    for (let i = 0; i < old_list.length; i++) {
      const quote = old_list[i];
      if (quote.Hash === payload.Hash) {
        return;
      }
    }
    const new_list = [...old_list, payload];
    if (new_list.length > ListItemMax) {
      new_list.shift();
    }
    yield put(setPublishQuoteList(new_list));
  } catch (e) {
    Logger.error("[BulletinQuoteAdd] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to add quote",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

export function* BulletinQuoteDel({ payload }) {
  try {
    const old_list = yield select((state) => state.Messenger.PublishQuoteList);
    let new_list = [...old_list];
    new_list = new_list.filter((q) => q.Hash !== payload.Hash);
    yield put(setPublishQuoteList(new_list));
  } catch (e) {
    Logger.error("[BulletinQuoteDel] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to remove quote",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

/**
 * BulletinReply — compose a reply bulletin that quotes the target bulletin.
 * Payload: { content: string, quoteHash: string }
 */
export function* BulletinReply(action) {
  try {
    const { content, quoteHash } = action.payload;

    // Stage the quote reference so PublishBulletin picks it up
    yield call(BulletinQuoteAdd, {
      payload: { Hash: quoteHash, Size: 0, Name: "" },
    });

    // Delegate to PublishBulletin (sends to server, stores in DB, etc.)
    yield call(PublishBulletin, { payload: { content } });

    // Clear the staging lists after publish completes
    yield put(setPublishQuoteList([]));
    yield put(setPublishFileList([]));

    // Refresh the reply list if we're viewing the same bulletin
    const displayBulletin = yield select(
      (state) => state.Messenger.DisplayBulletin,
    );
    if (displayBulletin && displayBulletin.hash === quoteHash) {
      yield fork(RequestReplyBulletin, {
        payload: { hash: quoteHash, page: 1 },
      });
    }

    yield put(
      setFlashNoticeMessage({
        message: "Reply published successfully",
        duration: FLASH_DURATION_MS,
      }),
    );
  } catch (e) {
    Logger.error("[BulletinReply] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Reply failed",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

export function* BulletinQuote({ payload }) {
  try {
    yield call(BulletinQuoteAdd, { payload });
    yield put(
      setFlashNoticeMessage({
        message: "quote success",
        duration: FLASH_DURATION_MS,
      }),
    );
  } catch (e) {
    Logger.error("[BulletinQuote] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to quote bulletin",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

export function* saveLocalFile(hash, content) {
  try {
    const filePath = fileService.getFileFullPath(hash);
    yield call(() => fileService.writeFile(filePath, content));
  } catch (e) {
    Logger.error("[saveLocalFile] failed for", hash, e.message);
  }
}

/**
 * BulletinFileAdd — add a file attachment reference to the current bulletin draft.
 * Reads the file from local storage, computes hash, stores it locally, and updates DB.
 * Payload: { file_uri: string } (mobile URI or absolute path)
 */
export function* BulletinFileAdd({ payload }) {
  try {
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

    // Read file content via react-native-fs
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

    // Read binary content as base64, convert to Uint8Array
    const fileBase64 = yield call(() => RNFS.readFile(file_uri, "base64"));
    const content = base64ToUint8Array(fileBase64);

    const hash = FileHash(content);
    yield call(saveLocalFile, hash, content);

    const chunk_length = Math.ceil(fileInfo.size / FileChunkSize);
    const file = yield call(() => dbAPI.getFileByHash(hash));
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

    const fileRef = {
      Hash: hash,
      Size: fileInfo.size,
      Name: file_uri.split("/").pop() || "",
      Timestamp: Date.now(),
    };

    // Update publish file list in Redux state
    const currentPublishFiles = yield select(
      (state) => state.Messenger.PublishFileList,
    );
    yield put(setPublishFileList([...(currentPublishFiles || []), fileRef]));
  } catch (e) {
    Logger.error("[BulletinFileAdd] failed:", e.message, e.stack);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to add file attachment",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

/**
 * BulletinFileDel — remove a file attachment reference from the current bulletin draft.
 */
export function* BulletinFileDel({ payload }) {
  try {
    const old_list = yield select((state) => state.Messenger.PublishFileList);
    let new_list = [...old_list];
    new_list = new_list.filter((f) => f.Hash !== payload.Hash);
    yield put(setPublishFileList(new_list));
  } catch (e) {
    Logger.error("[BulletinFileDel] failed:", e.message);
    yield put(
      setFlashNoticeMessage({
        message: "Failed to remove file",
        duration: FLASH_DURATION_MS,
      }),
    );
  }
}

/**
 * BulletinMarkToggle — toggle the bookmark (marked) flag for a bulletin.
 * Local-only operation; no server broadcast needed.
 * Payload: { hash: string }
 */
export function* BulletinMarkToggle({ payload }) {
  try {
    const bulletin_db = yield call(() => dbAPI.getBulletinByHash(payload.hash));
    if (bulletin_db !== null) {
      const newMarkState = !bulletin_db.is_marked;
      yield call(() => dbAPI.toggleBulletinMark(payload.hash, newMarkState));

      // Update the display bulletin if it's the one being toggled
      const displayBulletin = yield select(
        (state) => state.Messenger.DisplayBulletin,
      );
      if (displayBulletin && displayBulletin.hash === payload.hash) {
        yield put(
          setDisplayBulletin({ ...displayBulletin, is_marked: newMarkState }),
        );
      }

      // Update the reply list if it contains this bulletin
      const replyList = yield select(
        (state) => state.Messenger.DisplayBulletinReplyList,
      );
      if (replyList && Array.isArray(replyList)) {
        const updatedReplies = replyList.map((b) =>
          b.hash === payload.hash ? { ...b, is_marked: newMarkState } : b,
        );
        const replyPage = yield select(
          (state) => state.Messenger.DisplayBulletinReplyPage,
        );
        const replyTotalPage = yield select(
          (state) => state.Messenger.DisplayBulletinReplyTotalPage,
        );
        yield put(
          setDisplayBulletinReplyList({
            List: updatedReplies,
            Page: replyPage,
            TotalPage: replyTotalPage,
          }),
        );
      }

      // Update the portal list if it contains this bulletin
      const portalList = yield select(
        (state) => state.Messenger.PortalBulletinList,
      );
      if (portalList && Array.isArray(portalList)) {
        const updatedPortal = portalList.map((b) =>
          b.hash === payload.hash ? { ...b, is_marked: newMarkState } : b,
        );
        const portalPage = yield select(
          (state) => state.Messenger.PortalBulletinPage,
        );
        const portalTotalPage = yield select(
          (state) => state.Messenger.PortalBulletinTotalPage,
        );
        yield put(
          setPortalBulletinList({
            List: updatedPortal,
            Page: portalPage,
            TotalPage: portalTotalPage,
          }),
        );
      }

      yield put(
        setFlashNoticeMessage({
          message: newMarkState ? "Bookmark added" : "Bookmark removed",
          duration: FLASH_DURATION_MS,
        }),
      );

      // Update the bookmark list: remove when unmarking, add when marking
      const bookmarkList = yield select(
        (state) => state.Messenger.BookmarkBulletinList,
      );
      if (bookmarkList && Array.isArray(bookmarkList)) {
        let updatedBookmarks;
        if (newMarkState) {
          // Adding to bookmarks — fetch fresh data to include the new bulletin
          const freshList = yield call(() => dbAPI.getBulletinListByIsmark(1));
          updatedBookmarks = freshList;
        } else {
          // Removing from bookmarks — filter out the unmarked bulletin
          updatedBookmarks = bookmarkList.filter(
            (b) => b.hash !== payload.hash,
          );
          const total = yield call(() => dbAPI.getBulletinCountByIsmark());
          const totalPage = Math.max(1, Math.ceil(total / BulletinPageSize));
          yield put(
            setBookmarkBulletinList({
              List: updatedBookmarks,
              Page: 1,
              TotalPage: totalPage,
            }),
          );
          return;
        }
      }
    }
  } catch (e) {
    Logger.error("[BulletinMarkToggle] failed for", payload.hash, e.message);
  }
}

// Alias for backward compatibility — watcher imports LoadBulletinDetail
export const LoadBulletinDetail = LoadBulletin;

export function* SubscribeFollow() {
  try {
    const seed = yield select((state) => state.User.Seed);
    if (!seed) return;
    const follow_list = yield select((state) => state.User.FollowList);
    const subscribe_request = yield call(() =>
      mgAPI.genBulletinSubscribe(seed, follow_list),
    );
    yield call(SendMessage, { msg: JSON.stringify(subscribe_request) });
  } catch (e) {
    Logger.error("[SubscribeFollow] failed:", e.message);
  }
}
