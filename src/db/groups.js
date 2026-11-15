import { Bool2Int, Int2Bool } from "../lib/AppUtil";
import { Epoch, MessageObjectType } from "../lib/MessengerConst";
import { groupMessage2Display } from "../lib/MessengerUtil";
import { getDB } from "./core";

export const api = {
  /**
   * Get all distinct group hashes where the address is a member (for LAN sync push).
   * Returns an array of group hash strings.
   */
  async getAllGroupHashes(addr) {
    const dbInstance = await getDB();
    const rows = await dbInstance.select(
      "SELECT DISTINCT group_hash FROM group_messages WHERE address = $1",
      [addr],
    );
    return rows.map((r) => r.group_hash);
  },

  async getGroups() {
    const dbInstance = await getDB();
    let groups = await dbInstance.select(
      "SELECT * FROM groups ORDER BY created_at DESC",
    );
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      try {
        groups[i].member = JSON.parse(group.member);
      } catch {
        groups[i].member = [];
      }
      try {
        groups[i].create_json = JSON.parse(group.create_json);
      } catch {
        groups[i].create_json = {};
      }
      if (group.delete_json) {
        try {
          groups[i].delete_json = JSON.parse(group.delete_json);
        } catch {
          groups[i].delete_json = null;
        }
      }
      groups[i].is_accepted = Int2Bool(group.is_accepted);
    }
    return groups;
  },

  async getGroupByHash(hash) {
    const dbInstance = await getDB();
    const groups = await dbInstance.select(
      "SELECT * FROM groups WHERE hash = $1 LIMIT 1",
      [hash],
    );
    if (groups.length > 0) {
      let group = groups[0];
      try {
        group.member = JSON.parse(group.member);
      } catch {
        group.member = [];
      }
      try {
        group.create_json = JSON.parse(group.create_json);
      } catch {
        group.create_json = {};
      }
      if (group.delete_json) {
        try {
          group.delete_json = JSON.parse(group.delete_json);
        } catch {
          group.delete_json = null;
        }
      }
      group.is_accepted = Int2Bool(group.is_accepted);
      return group;
    }
    return null;
  },

  async createGroup(
    hash,
    name,
    created_by,
    member,
    created_at,
    create_json,
    is_accepted,
  ) {
    const db = await getDB();
    await db.execute(
      "INSERT INTO groups (hash, name, created_by, member, created_at, create_json, is_accepted) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        hash,
        name,
        created_by,
        JSON.stringify(member),
        created_at,
        JSON.stringify(create_json),
        Bool2Int(is_accepted),
      ],
    );
  },

  async updateGroupDelete(hash, delete_json) {
    const db = await getDB();
    await db.execute(
      "UPDATE groups SET delete_json = $1, deleted_at = $2 WHERE hash = $3",
      [JSON.stringify(delete_json), delete_json.Timestamp, hash],
    );
  },

  async acceptGroupRequest(hash) {
    const db = await getDB();
    await db.execute("UPDATE groups SET is_accepted = $1 WHERE hash = $2", [
      1,
      hash,
    ]);
  },

  async rejectGroupRequest(hash) {
    const db = await getDB();
    await db.execute("DELETE FROM groups WHERE hash = $1", [hash]);
  },

  async clearGroupData(hash) {
    const db = await getDB();
    await db.execute("DELETE FROM group_messages WHERE group_hash = $1", [
      hash,
    ]);
    await db.execute("UPDATE groups SET cleared_at = $1 WHERE hash = $2", [
      Date.now(),
      hash,
    ]);
  },

  async isGroupCleared(hash) {
    const db = await getDB();
    const rows = await db.select(
      "SELECT cleared_at FROM groups WHERE hash = $1 LIMIT 1",
      [hash],
    );
    return rows.length > 0 && rows[0].cleared_at !== null;
  },

  // group message
  async getGroupSession(group_hash) {
    const dbInstance = await getDB();
    let msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 ORDER BY signed_at ASC",
      [group_hash],
    );
    for (let i = 0; i < msgs.length; i++) {
      msgs[i] = groupMessage2Display(msgs[i]);
    }
    return msgs;
  },

  /**
   * Raw group session rows (no display transform) — for LAN sync push.
   * Keeps is_confirmed/is_marked/is_readed/is_object as integers and content as raw string.
   */
  async getGroupSessionRaw(group_hash) {
    const dbInstance = await getDB();
    return await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 ORDER BY sequence ASC",
      [group_hash],
    );
  },

  async getGroupNewMessageCount(group_hash) {
    const dbInstance = await getDB();
    const [result] = await dbInstance.select(
      "SELECT COUNT(DISTINCT hash) as count FROM group_messages WHERE group_hash = $1 AND is_readed = $2",
      [group_hash, Bool2Int(false)],
    );
    return result ? result.count : 0;
  },

  /**
   * Aggregate unread count + last signed_at for ALL given group hashes in one query.
   * Replaces the per-group pair of getGroupNewMessageCount + getLastGroupMessageSignedAt.
   * @param {string[]} hashes - Array of group hash strings
   * @returns {Promise<Object>} { [hash]: { unread, last_signed_at } }
   */
  async getGroupSessionSummaries(hashes) {
    if (!hashes || hashes.length === 0) return {};
    const dbInstance = await getDB();
    const placeholders = hashes.map((_, i) => `$${i + 1}`).join(',');
    const rows = await dbInstance.select(
      `SELECT
         group_hash,
         SUM(CASE WHEN is_readed = 0 THEN 1 ELSE 0 END) AS unread,
         MAX(signed_at) AS last_signed_at
       FROM group_messages
       WHERE group_hash IN (${placeholders})
       GROUP BY group_hash`,
      hashes,
    );
    const summaries = {};
    for (const row of rows) {
      summaries[row.group_hash] = { unread: row.unread, last_signed_at: row.last_signed_at };
    }
    return summaries;
  },

  /**
   * Read watermark per group: the newest signed_at already marked read.
   * Named with a Group prefix because dbAPI is a flat spread of every module —
   * a bare `getReadWatermarks` would collide with privateMessages' version
   * (groups is spread last, so it would silently win).
   * @returns {Promise<Object<string, number>>} group hash -> signed_at
   */
  async getGroupReadWatermarks() {
    const dbInstance = await getDB();
    const rows = await dbInstance.select(
      `SELECT group_hash, MAX(signed_at) AS ts FROM group_messages
         WHERE is_readed = 1 GROUP BY group_hash`,
    );
    const out = {};
    for (const row of rows) out[row.group_hash] = row.ts;
    return out;
  },

  /**
   * Apply group read watermarks received from another device. Monotonic: only
   * sets is_readed = 1.
   * @param {Object<string, number>} map - group hash -> signed_at
   * @returns {Promise<number>} Number of groups applied
   */
  async applyGroupReadWatermarks(map) {
    if (!map || typeof map !== "object") return 0;
    const db = await getDB();
    let applied = 0;
    for (const [ghash, raw] of Object.entries(map)) {
      const ts = Number(raw);
      if (!ghash || !Number.isFinite(ts) || ts <= 0) continue;
      await db.execute(
        "UPDATE group_messages SET is_readed = 1 WHERE group_hash = $1 AND signed_at <= $2 AND is_readed = 0",
        [ghash, ts],
      );
      applied++;
    }
    return applied;
  },

  async readGroupSession(group_hash) {
    const db = await getDB();
    await db.execute(
      "UPDATE group_messages SET is_readed = $2 WHERE group_hash = $1",
      [group_hash, Bool2Int(true)],
    );
  },

  async getUnsyncGroupSession(group_hash, signed_at) {
    const dbInstance = await getDB();
    return await dbInstance.select(
      "SELECT json FROM group_messages WHERE group_hash = $1 AND signed_at > $2 ORDER BY signed_at ASC LIMIT 64",
      [group_hash, signed_at],
    );
  },

  async getMemberLastGroupMessage(group_hash, address) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 AND address = $2 ORDER BY sequence DESC LIMIT 1",
      [group_hash, address],
    );
    return msgs.length > 0 ? groupMessage2Display(msgs[0]) : null;
  },

  async getLastConfirmGroupMessage(group_hash, address) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 AND address != $2 AND is_confirmed = $3 ORDER BY signed_at DESC LIMIT 1",
      [group_hash, address, Bool2Int(true)],
    );
    return msgs.length > 0 ? groupMessage2Display(msgs[0]) : null;
  },

  async getLastUnconfirmGroupMessage(group_hash, address) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 AND address != $2 AND is_confirmed = $3 ORDER BY signed_at DESC LIMIT 1",
      [group_hash, address, Bool2Int(false)],
    );
    return msgs.length > 0 ? groupMessage2Display(msgs[0]) : null;
  },

  async getLastGroupMessage(group_hash) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 ORDER BY signed_at DESC LIMIT 1",
      [group_hash],
    );
    return msgs.length > 0 ? groupMessage2Display(msgs[0]) : null;
  },

  async getLastGroupMessageSignedAt(group_hash) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 ORDER BY signed_at DESC LIMIT 1",
      [group_hash],
    );
    return msgs.length > 0 ? groupMessage2Display(msgs[0]).signed_at : Epoch;
  },

  async getLastGroupMemberMessage(group_hash, address) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 AND address = $2 ORDER BY sequence DESC LIMIT 1",
      [group_hash, address],
    );
    return msgs.length > 0 ? groupMessage2Display(msgs[0]) : null;
  },

  async addGroupMessage(
    hash,
    group_hash,
    address,
    sequence,
    pre_hash,
    content,
    json,
    signed_at,
    is_confirmed,
    is_marked,
    is_readed,
    is_object,
  ) {
    const db = await getDB();
    await db.execute(
      "INSERT INTO group_messages (hash, group_hash, address, sequence, pre_hash, content, json, signed_at, is_confirmed, is_marked, is_readed, is_object, object_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
      [
        hash,
        group_hash,
        address,
        sequence,
        pre_hash,
        is_object ? JSON.stringify(content) : content,
        JSON.stringify(json),
        signed_at,
        Bool2Int(is_confirmed),
        Bool2Int(is_marked),
        Bool2Int(is_readed),
        Bool2Int(is_object),
        is_object ? content.ObjectType : MessageObjectType.NotObject,
      ],
    );
    return true;
  },

  async confirmGroupMessage(group_hash, address, sequence) {
    const db = await getDB();
    await db.execute(
      "UPDATE group_messages SET is_confirmed = $1 WHERE group_hash = $2 AND address = $3 AND sequence <= $4",
      [Bool2Int(true), group_hash, address, sequence],
    );
  },

  async getGroupMessageBySequence(group_hash, address, sequence) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 AND address = $2 AND sequence = $3 LIMIT 1",
      [group_hash, address, sequence],
    );
    return msgs.length > 0 ? groupMessage2Display(msgs[0]) : null;
  },

  async getGroupMessageByHash(group_hash, hash) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM group_messages WHERE group_hash = $1 AND hash = $2 LIMIT 1",
      [group_hash, hash],
    );
    return msgs.length > 0 ? groupMessage2Display(msgs[0]) : null;
  },
};
