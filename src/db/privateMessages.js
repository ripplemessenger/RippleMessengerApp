import { Bool2Int } from "../lib/AppUtil";
import { Epoch, MessageObjectType } from "../lib/MessengerConst";
import { privateMessage2Display } from "../lib/MessengerUtil";
import { getDB } from "./core";

export const api = {
  /**
   * Get all distinct peers for an address (for LAN sync push).
   * Returns an array of peer addresses.
   */
  async getAllPrivatePeers(addr) {
    const dbInstance = await getDB();
    const rows = await dbInstance.select(
      "SELECT DISTINCT peer FROM (SELECT dest AS peer FROM private_messages WHERE sour = $1 UNION SELECT sour AS peer FROM private_messages WHERE dest = $1)",
      [addr],
    );
    return rows.map((r) => r.peer);
  },

  async getPrivateSession(sour, dest) {
    const dbInstance = await getDB();
    // UNION ALL instead of an OR over both directions: SQLite resolves such an
    // OR via MULTI-INDEX OR but then sorts every matching row before ORDER BY.
    // Two index-ordered branches are O(page) instead of O(conversation length).
    // Collapsed to one branch when sour === dest (both would match the same rows).
    const sql =
      sour === dest
        ? "SELECT * FROM private_messages WHERE sour = $1 AND dest = $2 ORDER BY signed_at ASC"
        : `SELECT * FROM private_messages WHERE sour = $1 AND dest = $2
           UNION ALL
           SELECT * FROM private_messages WHERE sour = $2 AND dest = $1
           ORDER BY signed_at ASC`;
    let msgs = await dbInstance.select(sql, [sour, dest]);
    for (let i = 0; i < msgs.length; i++) {
      msgs[i] = privateMessage2Display(msgs[i]);
    }
    return msgs;
  },

  /**
   * Raw private session rows (no display transform) — for LAN sync push.
   * Keeps is_confirmed/is_marked/is_readed/is_object as integers and content as raw string.
   */
  async getPrivateSessionRaw(sour, dest) {
    const dbInstance = await getDB();
    const sql =
      sour === dest
        ? "SELECT * FROM private_messages WHERE sour = $1 AND dest = $2 ORDER BY sequence ASC"
        : `SELECT * FROM private_messages WHERE sour = $1 AND dest = $2
           UNION ALL
           SELECT * FROM private_messages WHERE sour = $2 AND dest = $1
           ORDER BY sequence ASC`;
    return await dbInstance.select(sql, [sour, dest]);
  },

  async getPrivateNewMessageCount(sour, dest) {
    const dbInstance = await getDB();
    const unread = Bool2Int(false);
    // hash is the primary key, so the two directions are disjoint and the counts
    // can be added — except when sour === dest, where both would match the same rows.
    const sql =
      sour === dest
        ? "SELECT COUNT(*) AS count FROM private_messages WHERE sour = $1 AND dest = $2 AND is_readed = $3"
        : `SELECT ((SELECT COUNT(*) FROM private_messages WHERE sour = $1 AND dest = $2 AND is_readed = $3)
                 + (SELECT COUNT(*) FROM private_messages WHERE sour = $2 AND dest = $1 AND is_readed = $3)) AS count`;
    const [result] = await dbInstance.select(sql, [sour, dest, unread]);
    return result ? result.count : 0;
  },

  /**
   * Read watermark per peer: the newest signed_at already marked read, across
   * both directions. One number per conversation instead of per-message flags,
   * so it stays tiny and merges monotonically.
   * @param {string} address - Local address
   * @returns {Promise<Object<string, number>>} peer -> signed_at
   */
  async getReadWatermarks(address) {
    const dbInstance = await getDB();
    const rows = await dbInstance.select(
      `SELECT peer, MAX(signed_at) AS ts FROM (
         SELECT dest AS peer, signed_at FROM private_messages WHERE sour = $1 AND is_readed = 1
         UNION ALL
         SELECT sour AS peer, signed_at FROM private_messages WHERE dest = $1 AND is_readed = 1
       ) GROUP BY peer`,
      [address],
    );
    const out = {};
    for (const row of rows) out[row.peer] = row.ts;
    return out;
  },

  /**
   * Apply read watermarks received from another device. Monotonic: only ever
   * sets is_readed = 1, so a stale watermark cannot un-read anything.
   * @param {string} address - Local address
   * @param {Object<string, number>} map - peer -> signed_at
   * @returns {Promise<number>} Number of peers applied
   */
  async applyReadWatermarks(address, map) {
    if (!map || typeof map !== "object") return 0;
    const db = await getDB();
    let applied = 0;
    for (const [peer, raw] of Object.entries(map)) {
      const ts = Number(raw);
      if (!peer || !Number.isFinite(ts) || ts <= 0) continue;
      // Two index-backed updates rather than one OR across both directions.
      await db.execute(
        "UPDATE private_messages SET is_readed = 1 WHERE sour = $1 AND dest = $2 AND signed_at <= $3 AND is_readed = 0",
        [address, peer, ts],
      );
      await db.execute(
        "UPDATE private_messages SET is_readed = 1 WHERE sour = $2 AND dest = $1 AND signed_at <= $3 AND is_readed = 0",
        [address, peer, ts],
      );
      applied++;
    }
    return applied;
  },

  /**
   * Aggregate unread count + last signed_at for ALL peers of an address in one query.
   * Replaces the per-peer pair of getPrivateNewMessageCount + getLastPrivateMessageSignedAt.
   * @returns {Promise<Object>} { [peer]: { unread, last_signed_at } }
   */
  async getPrivateSessionSummaries(address) {
    const dbInstance = await getDB();
    const rows = await dbInstance.select(
      `SELECT
         CASE WHEN sour = $1 THEN dest ELSE sour END AS peer,
         SUM(CASE WHEN is_readed = 0 THEN 1 ELSE 0 END) AS unread,
         MAX(signed_at) AS last_signed_at
       FROM private_messages
       WHERE sour = $1 OR dest = $1
       GROUP BY peer`,
      [address],
    );
    const summaries = {};
    for (const row of rows) {
      summaries[row.peer] = { unread: row.unread, last_signed_at: row.last_signed_at };
    }
    return summaries;
  },

  async readPrivateSession(sour, dest) {
    const db = await getDB();
    const read = Bool2Int(true);
    // Two index-backed UPDATEs instead of one OR-scan.
    await db.execute(
      "UPDATE private_messages SET is_readed = $3 WHERE sour = $1 AND dest = $2",
      [sour, dest, read],
    );
    await db.execute(
      "UPDATE private_messages SET is_readed = $3 WHERE sour = $2 AND dest = $1",
      [sour, dest, read],
    );
  },

  async getLastPrivateMessageSignedAt(sour, dest) {
    const dbInstance = await getDB();
    const [row] = await dbInstance.select(
      `SELECT MAX(signed_at) AS last FROM (
         SELECT signed_at FROM private_messages WHERE sour = $1 AND dest = $2
         UNION ALL
         SELECT signed_at FROM private_messages WHERE sour = $2 AND dest = $1
       )`,
      [sour, dest],
    );
    return row && row.last !== null && row.last !== undefined ? row.last : Epoch;
  },

  async getLastPrivateMessage(sour, dest) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM private_messages WHERE sour = $1 AND dest = $2 ORDER BY sequence DESC LIMIT 1",
      [sour, dest],
    );
    return msgs.length > 0 ? privateMessage2Display(msgs[0]) : null;
  },

  async getLastPrivateMessageBothDir(sour, dest) {
    const dbInstance = await getDB();
    const sql =
      sour === dest
        ? "SELECT * FROM private_messages WHERE sour = $1 AND dest = $2 ORDER BY signed_at DESC LIMIT 1"
        : `SELECT * FROM (
             SELECT * FROM private_messages WHERE sour = $1 AND dest = $2
             UNION ALL
             SELECT * FROM private_messages WHERE sour = $2 AND dest = $1
             ORDER BY signed_at DESC LIMIT 1
           )`;
    const msgs = await dbInstance.select(sql, [sour, dest]);
    return msgs.length > 0 ? privateMessage2Display(msgs[0]) : null;
  },

  async getLastConfirmPrivateMessage(sour, dest) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM private_messages WHERE sour = $1 AND dest = $2 AND is_confirmed = $3 ORDER BY sequence DESC LIMIT 1",
      [sour, dest, Bool2Int(true)],
    );
    return msgs.length > 0 ? privateMessage2Display(msgs[0]) : null;
  },

  async getLastUnconfirmPrivateMessage(sour, dest) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM private_messages WHERE sour = $1 AND dest = $2 AND is_confirmed = $3 ORDER BY sequence DESC LIMIT 1",
      [sour, dest, Bool2Int(false)],
    );
    return msgs.length > 0 ? privateMessage2Display(msgs[0]) : null;
  },

  async getUnsyncPrivateSession(sour, dest, self_sequence, pair_sequence) {
    const dbInstance = await getDB();
    // Independent cut-off per direction; `signed_at` is selected so the compound
    // ORDER BY can reference it. Collapsed to one branch when sour === dest.
    const sql =
      sour === dest
        ? "SELECT json, signed_at FROM private_messages WHERE sour = $1 AND dest = $2 AND sequence > $3 ORDER BY signed_at ASC"
        : `SELECT json, signed_at FROM private_messages WHERE sour = $1 AND dest = $2 AND sequence > $3
           UNION ALL
           SELECT json, signed_at FROM private_messages WHERE sour = $2 AND dest = $1 AND sequence > $4
           ORDER BY signed_at ASC`;
    return await dbInstance.select(sql, [
      sour,
      dest,
      self_sequence,
      pair_sequence,
    ]);
  },

  async getPrivateMessageByHash(hash) {
    const dbInstance = await getDB();
    const msgs = await dbInstance.select(
      "SELECT * FROM private_messages WHERE hash = $1 LIMIT 1",
      [hash],
    );
    return msgs.length > 0 ? msgs[0] : null;
  },

  async addPrivateMessage(
    hash,
    sour,
    dest,
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
      "INSERT OR IGNORE INTO private_messages (hash, sour, dest, sequence, pre_hash, content, json, signed_at, is_confirmed, is_marked, is_readed, is_object, object_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
      [
        hash,
        sour,
        dest,
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

  async confirmPrivateMessage(sour, dest, sequence) {
    const db = await getDB();
    await db.execute(
      "UPDATE private_messages SET is_confirmed = $1 WHERE sour = $2 AND dest = $3 AND sequence <= $4",
      [Bool2Int(true), sour, dest, sequence],
    );
  },
};
