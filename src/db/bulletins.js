import { Bool2Int, Int2Bool } from "../lib/AppUtil";
import { BulletinPageSize } from "../lib/AppConst";
import { bulletin2Display } from "../lib/MessengerUtil";
import { getDB, chunkByVars, valueGroups } from "./core";

export const api = {
  async getPortalBulletins(page) {
    const dbInstance = await getDB();
    let bulletins = await dbInstance.select(
      `SELECT * FROM bulletins ORDER BY signed_at DESC LIMIT ${BulletinPageSize} OFFSET ${(page - 1) * BulletinPageSize}`,
    );
    for (let i = 0; i < bulletins.length; i++) {
      bulletins[i] = bulletin2Display(bulletins[i]);
    }
    return bulletins;
  },

  async getPortalBulletinCount() {
    const dbInstance = await getDB();
    const [result] = await dbInstance.select(
      `SELECT COUNT(hash) as count FROM bulletins`,
    );
    return result ? result.count : 0;
  },

  async getAddressBulletins(address, page) {
    const dbInstance = await getDB();
    let bulletins = await dbInstance.select(
      `SELECT * FROM bulletins WHERE address = $1 ORDER BY sequence DESC LIMIT ${BulletinPageSize} OFFSET ${(page - 1) * BulletinPageSize}`,
      [address],
    );
    for (let i = 0; i < bulletins.length; i++) {
      bulletins[i] = bulletin2Display(bulletins[i]);
    }
    return bulletins;
  },

  async getAddressBulletinCount(address) {
    const dbInstance = await getDB();
    const [result] = await dbInstance.select(
      `SELECT COUNT(hash) as count FROM bulletins WHERE address = $1`,
      [address],
    );
    return result ? result.count : 0;
  },

  async getBulletinListByAddresses(addresses, page, order) {
    if (!Array.isArray(addresses) || addresses.length === 0) return [];
    const sortDirection =
      order && order.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const dbInstance = await getDB();
    const placeholders = addresses.map((_, i) => `$${i + 1}`).join(", ");
    const query = `SELECT * FROM bulletins WHERE address IN (${placeholders}) ORDER BY signed_at ${sortDirection} LIMIT ${BulletinPageSize} OFFSET ${(page - 1) * BulletinPageSize}`;
    let bulletins = await dbInstance.select(query, addresses);
    for (let i = 0; i < bulletins.length; i++) {
      bulletins[i] = bulletin2Display(bulletins[i]);
    }
    return bulletins;
  },

  async getBulletinCountByAddresses(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) return 0;
    const dbInstance = await getDB();
    const placeholders = addresses.map((_, i) => `$${i + 1}`).join(", ");
    const query = `SELECT COUNT(hash) as count FROM bulletins WHERE address IN (${placeholders})`;
    let [result] = await dbInstance.select(query, addresses);
    return result ? result.count : 0;
  },

  async getBulletinListByIsmark(page) {
    const dbInstance = await getDB();
    let bulletins = await dbInstance.select(
      `SELECT * FROM bulletins WHERE is_marked = $1 ORDER BY signed_at DESC LIMIT ${BulletinPageSize} OFFSET ${(page - 1) * BulletinPageSize}`,
      [Bool2Int(true)],
    );
    for (let i = 0; i < bulletins.length; i++) {
      bulletins[i] = bulletin2Display(bulletins[i]);
    }
    return bulletins;
  },

  async getBulletinCountByIsmark() {
    const dbInstance = await getDB();
    const [result] = await dbInstance.select(
      `SELECT COUNT(hash) as count FROM bulletins WHERE is_marked = $1`,
      [Bool2Int(true)],
    );
    return result ? result.count : 0;
  },

  async getBulletinListByHash(hashes) {
    if (!Array.isArray(hashes) || hashes.length === 0) return [];
    const dbInstance = await getDB();
    const placeholders = hashes.map((_, i) => `$${i + 1}`).join(", ");
    const query = `SELECT * FROM bulletins WHERE hash IN (${placeholders}) ORDER BY signed_at`;
    let bulletins = await dbInstance.select(query, hashes);
    for (let i = 0; i < bulletins.length; i++) {
      bulletins[i] = bulletin2Display(bulletins[i]);
    }
    return bulletins;
  },

  async getBulletinByHash(hash) {
    const dbInstance = await getDB();
    const bulletins = await dbInstance.select(
      "SELECT * FROM bulletins WHERE hash = $1 LIMIT 1",
      [hash],
    );
    return bulletins.length > 0 ? bulletin2Display(bulletins[0]) : null;
  },

  async getBulletinBySequence(address, sequence) {
    const dbInstance = await getDB();
    const bulletins = await dbInstance.select(
      "SELECT * FROM bulletins WHERE address = $1 AND sequence = $2 LIMIT 1",
      [address, sequence],
    );
    return bulletins.length > 0 ? bulletin2Display(bulletins[0]) : null;
  },

  async getLastBulletin(address) {
    const dbInstance = await getDB();
    const bulletins = await dbInstance.select(
      "SELECT * FROM bulletins WHERE address = $1 ORDER BY sequence DESC LIMIT 1",
      [address],
    );
    return bulletins.length > 0 ? bulletin2Display(bulletins[0]) : null;
  },

  async getLastBulletinByAddresses(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) return {};
    const dbInstance = await getDB();
    const placeholders = addresses.map((_, i) => `$${i + 1}`).join(", ");
    const query = `
      SELECT b.*
      FROM bulletins b
      INNER JOIN (
        SELECT address, MAX(sequence) AS max_seq
        FROM bulletins
        WHERE address IN (${placeholders})
        GROUP BY address
      ) mx ON b.address = mx.address AND b.sequence = mx.max_seq
    `;
    const rows = await dbInstance.select(query, addresses);
    const result = {};
    for (const row of rows) {
      result[row.address] = bulletin2Display(row);
    }
    return result;
  },

  async getBulletinSequencesBatch(pairs) {
    if (!Array.isArray(pairs) || pairs.length === 0) return [];
    const dbInstance = await getDB();
    const tupleStrs = pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`);
    const values = [];
    for (const p of pairs) {
      values.push(p.address, p.sequence);
    }
    const query = `
      SELECT address, sequence
      FROM bulletins
      WHERE (address, sequence) IN (${tupleStrs})
    `;
    const rows = await dbInstance.select(query, values);
    return new Set(rows.map((r) => `${r.address}:${r.sequence}`));
  },

  async addBulletin(
    hash,
    address,
    sequence,
    pre_hash,
    content,
    json,
    signed_at,
  ) {
    const db = await getDB();
    await db.execute(
      "INSERT INTO bulletins (hash, address, sequence, pre_hash, content, json, signed_at, is_marked) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        hash,
        address,
        sequence,
        pre_hash,
        content,
        JSON.stringify(json),
        signed_at,
        Bool2Int(false),
      ],
    );
    return true;
  },

  async toggleBulletinMark(hash, is_marked) {
    const db = await getDB();
    await db.execute("UPDATE bulletins SET is_marked = $1, marked_at = $2 WHERE hash = $3", [
      Bool2Int(is_marked),
      Date.now(),
      hash,
    ]);
  },

  // ── LAN sync: marked state ──
  async getMarkedBulletins() {
    const db = await getDB();
    const rows = await db.select(
      "SELECT hash, is_marked, marked_at FROM bulletins WHERE marked_at > 0"
    );
    return rows.map((r) => ({ hash: r.hash, is_marked: r.is_marked, marked_at: r.marked_at }));
  },

  async applyMarkedBulletins(markedList) {
    const db = await getDB();
    let applied = 0;
    for (const m of markedList) {
      const result = await db.execute(
        "UPDATE bulletins SET is_marked = $1, marked_at = $2 WHERE hash = $3 AND (marked_at IS NULL OR marked_at < $4)",
        [Bool2Int(m.is_marked), m.marked_at, m.hash, m.marked_at]
      );
      if (result && result.changes > 0) applied++;
    }
    return applied;
  },

  // bulletin reply
  async getReplyHashListByBulletinHash(hash, page) {
    const dbInstance = await getDB();
    const bulletins = await dbInstance.select(
      `SELECT reply_hash FROM bulletin_replys WHERE bulletin_hash = $1 ORDER BY reply_signed_at DESC LIMIT ${BulletinPageSize} OFFSET ${(page - 1) * BulletinPageSize}`,
      [hash],
    );
    return bulletins.map((b) => b.reply_hash);
  },

  async getReplyCount(hash) {
    const dbInstance = await getDB();
    const [result] = await dbInstance.select(
      `SELECT COUNT(reply_hash) as count FROM bulletin_replys WHERE bulletin_hash = $1`,
      [hash],
    );
    return result ? result.count : 0;
  },

  /**
   * Link quoted (parent) bulletins to a new reply.
   *
   * Was one INSERT per parent with a swallowed FK error, so a parent not cached
   * locally was skipped while the rest linked. Here the missing parents (and any
   * self-quote, which the table's CHECK forbids) are filtered out first, then
   * one multi-row INSERT links the rest — same "link what we can" behaviour,
   * one round-trip instead of N.
   */
  async addReplyToBulletins(bulletins, reply_hash, reply_signed_at) {
    if (!Array.isArray(bulletins) || bulletins.length === 0) return true;
    const db = await getDB();

    const hashes = [
      ...new Set(
        bulletins.map((b) => b && b.Hash).filter((h) => h && h !== reply_hash),
      ),
    ];
    if (hashes.length === 0) return true;

    const existing = new Set();
    for (const part of chunkByVars(hashes, 1)) {
      const rows = await db.select(
        `SELECT hash FROM bulletins WHERE hash IN (${part.map((_, i) => `$${i + 1}`).join(", ")})`,
        part,
      );
      for (const row of rows) existing.add(row.hash);
    }

    const kept = hashes.filter((h) => existing.has(h));
    if (kept.length === 0) return true;

    for (const part of chunkByVars(kept, 3)) {
      const params = [];
      for (const hash of part) params.push(hash, reply_hash, reply_signed_at);
      await db.execute(
        `INSERT OR IGNORE INTO bulletin_replys (bulletin_hash, reply_hash, reply_signed_at) VALUES ${valueGroups(part.length, 3)}`,
        params,
      );
    }
    return true;
  },

  // bulletin tag
  async getBulletinHashListByTagId(ids, page) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const dbInstance = await getDB();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const query = `SELECT DISTINCT bulletin_hash FROM bulletin_tags WHERE tag_id IN(${placeholders}) ORDER BY bulletin_signed_at DESC LIMIT ${BulletinPageSize} OFFSET ${(page - 1) * BulletinPageSize}`;
    const bulletins = await dbInstance.select(query, ids);
    return bulletins.map((b) => b.bulletin_hash);
  },

  async getBulletinHashCountByTagId(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const dbInstance = await getDB();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const query = `SELECT COUNT(DISTINCT bulletin_hash) as count FROM bulletin_tags WHERE tag_id IN(${placeholders})`;
    const [result] = await dbInstance.select(query, ids);
    return result ? result.count : 0;
  },

  /**
   * Link a bulletin to its tags.
   *
   * Was 3 statements per tag (insert tag → look up id → insert link) with no
   * transaction, so a partial failure left the post with only some of its tags —
   * it then stops appearing under the missing tags' filters with no error shown.
   * Now: one multi-row statement per phase.
   */
  async addTagsToBulletin(bulletin_hash, bulletin_signed_at, tagNames) {
    if (!Array.isArray(tagNames) || tagNames.length === 0) return true;
    const db = await getDB();

    const names = [
      ...new Set(
        tagNames
          .map((n) => (typeof n === "string" ? n.trim() : ""))
          .filter(Boolean),
      ),
    ];
    if (names.length === 0) return true;

    for (const part of chunkByVars(names, 1)) {
      await db.execute(
        `INSERT OR IGNORE INTO tags (name) VALUES ${valueGroups(part.length, 1)}`,
        part,
      );
    }

    const idByName = new Map();
    for (const part of chunkByVars(names, 1)) {
      const rows = await db.select(
        `SELECT id, name FROM tags WHERE name IN (${part.map((_, i) => `$${i + 1}`).join(", ")})`,
        part,
      );
      for (const row of rows) idByName.set(row.name, row.id);
    }
    if (idByName.size === 0) return true;

    const linked = names.filter((n) => idByName.has(n));
    for (const part of chunkByVars(linked, 3)) {
      const params = [];
      for (const name of part)
        params.push(bulletin_hash, bulletin_signed_at, idByName.get(name));
      await db.execute(
        `INSERT OR IGNORE INTO bulletin_tags (bulletin_hash, bulletin_signed_at, tag_id) VALUES ${valueGroups(part.length, 3)}`,
        params,
      );
    }
    return true;
  },

  /**
   * Link a bulletin to its attachments.
   *
   * Only files present locally are linked: the FK on file_hash would otherwise
   * abort the whole (atomic) multi-row INSERT, whereas the old per-row loop let
   * the resolvable ones through.
   */
  async addFilesToBulletin(bulletin_hash, files) {
    if (!Array.isArray(files) || files.length === 0) return true;
    const db = await getDB();

    const hashes = [...new Set(files.map((f) => f && f.Hash).filter(Boolean))];
    if (hashes.length === 0) return true;

    const existing = new Set();
    for (const part of chunkByVars(hashes, 1)) {
      const rows = await db.select(
        `SELECT hash FROM files WHERE hash IN (${part.map((_, i) => `$${i + 1}`).join(", ")})`,
        part,
      );
      for (const row of rows) existing.add(row.hash);
    }

    const kept = files.filter((f) => f && existing.has(f.Hash));
    for (const part of chunkByVars(kept, 5)) {
      const params = [];
      for (const f of part) params.push(bulletin_hash, f.Hash, f.Size, f.Name, f.Ext);
      await db.execute(
        `INSERT OR IGNORE INTO bulletin_files (bulletin_hash, file_hash, file_size, file_name, file_ext) VALUES ${valueGroups(part.length, 5)}`,
        params,
      );
    }
    return true;
  },

  // tag
  async getTagIdListByName(names) {
    if (!Array.isArray(names) || names.length === 0) return [];
    const dbInstance = await getDB();
    const placeholders = names.map((_, i) => `$${i + 1}`).join(", ");
    const query = `SELECT id FROM tags WHERE name IN(${placeholders})`;
    const tags = await dbInstance.select(query, names);
    return tags.map((tag) => tag.id);
  },

  async addTag(name) {
    const db = await getDB();
    await db.execute("INSERT OR IGNORE INTO tags (name) VALUES ($1)", [name]);
  },

  async deleteBulletin(hash) {
    const db = await getDB();
    await db.execute("DELETE FROM bulletins WHERE hash = $1", [hash]);
  },

  // Management: delete all bulletins (CASCADE handles replies/tags/linking tables)
  async clearAllBulletins(excludeAddress) {
    const db = await getDB();
    if (excludeAddress) {
      const [result] = await db.select(
        `SELECT COUNT(hash) AS count FROM bulletins 
         WHERE address != $1 
         AND (is_marked IS NULL OR is_marked = 0)
         AND address NOT IN (SELECT remote FROM follows WHERE local = $1)`,
        [excludeAddress, excludeAddress],
      );
      const count = result ? result.count : 0;
      await db.execute(
        `DELETE FROM bulletins 
         WHERE address != $1 
         AND (is_marked IS NULL OR is_marked = 0)
         AND address NOT IN (SELECT remote FROM follows WHERE local = $1)`,
        [excludeAddress, excludeAddress],
      );
      return count;
    }
    const [result] = await db.select(
      "SELECT COUNT(hash) AS count FROM bulletins",
    );
    const count = result ? result.count : 0;
    await db.execute("DELETE FROM bulletins");
    return count;
  },

  // Management: find all bulletins that reference a given file hash
  async getBulletinsByFileHash(file_hash) {
    const dbInstance = await getDB();
    const rows = await dbInstance.select(
      `SELECT b.hash, b.address, b.sequence, SUBSTR(b.content, 1, 80) AS content_preview, b.signed_at, bf.file_name, bf.file_ext FROM bulletins b INNER JOIN bulletin_files bf ON b.hash = bf.bulletin_hash WHERE bf.file_hash = $1 ORDER BY b.signed_at DESC`,
      [file_hash],
    );
    return rows;
  },

  // Management: count bulletins matching search query + filter (for pagination)
  async getBulletinSearchCountForManagement({ query, filter, address }) {
    const db = await getDB();
    const hasSearch = query && query.trim().length > 0;
    const likePattern = `%${query.trim()}%`;

    let querySql, params;

    switch (filter) {
      case "mine":
        if (hasSearch) {
          querySql = `SELECT COUNT(hash) AS count FROM bulletins WHERE address = $1 AND content LIKE $2`;
          params = [address, likePattern];
        } else {
          querySql = `SELECT COUNT(hash) AS count FROM bulletins WHERE address = $1`;
          params = [address];
        }
        break;
      case "followed":
        if (hasSearch) {
          querySql = `SELECT COUNT(b.hash) AS count FROM bulletins b INNER JOIN follows f ON b.address = f.remote WHERE f.local = $1 AND b.content LIKE $2`;
          params = [address, likePattern];
        } else {
          querySql = `SELECT COUNT(b.hash) AS count FROM bulletins b INNER JOIN follows f ON b.address = f.remote WHERE f.local = $1`;
          params = [address];
        }
        break;
      case "bookmarked":
        if (hasSearch) {
          querySql = `SELECT COUNT(hash) AS count FROM bulletins WHERE is_marked = $1 AND content LIKE $2`;
          params = [Bool2Int(true), likePattern];
        } else {
          querySql = `SELECT COUNT(hash) AS count FROM bulletins WHERE is_marked = $1`;
          params = [Bool2Int(true)];
        }
        break;
      default: // 'all'
        if (hasSearch) {
          querySql = `SELECT COUNT(hash) AS count FROM bulletins WHERE content LIKE $1`;
          params = [likePattern];
        } else {
          querySql = `SELECT COUNT(hash) AS count FROM bulletins`;
          params = [];
        }
        break;
    }

    const [result] = await db.select(querySql, params);
    return result ? result.count : 0;
  },

  // ---------- Management APIs ----------

  // sortOrder: 'desc' (default) | 'asc'
  async getBulletinsForManagement({
    filter,
    address,
    page = 1,
    pageSize = BulletinPageSize,
    sortOrder = "desc",
  }) {
    const db = await getDB();
    const offset = (page - 1) * pageSize;
    const sortDir =
      sortOrder && sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
    let query, params;

    switch (filter) {
      case "mine":
        query = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked FROM bulletins b LEFT JOIN contacts c ON b.address = c.address WHERE b.address = $1 ORDER BY b.signed_at ${sortDir} LIMIT $2 OFFSET $3`;
        params = [address, pageSize, offset];
        break;
      case "followed":
        query = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked, 1 AS is_followed FROM bulletins b INNER JOIN follows f ON b.address = f.remote LEFT JOIN contacts c ON b.address = c.address WHERE f.local = $1 ORDER BY b.signed_at ${sortDir} LIMIT $2 OFFSET $3`;
        params = [address, pageSize, offset];
        break;
      case "bookmarked":
        query = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked FROM bulletins b LEFT JOIN contacts c ON b.address = c.address WHERE b.is_marked = $1 ORDER BY b.signed_at ${sortDir} LIMIT $2 OFFSET $3`;
        params = [Bool2Int(true), pageSize, offset];
        break;
      default: // 'all'
        query = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked, (SELECT COUNT(f.remote) > 0 FROM follows f WHERE f.remote = b.address AND f.local = $1) AS is_followed FROM bulletins b LEFT JOIN contacts c ON b.address = c.address ORDER BY b.signed_at ${sortDir} LIMIT $2 OFFSET $3`;
        params = [address, pageSize, offset];
    }

    const rows = await db.select(query, params);
    return rows.map((r) => ({
      ...r,
      is_marked: Int2Bool(r.is_marked),
      is_followed:
        r.is_followed !== undefined ? Int2Bool(r.is_followed) : false,
    }));
  },

  async getBulletinCountForManagement({ filter, address }) {
    const db = await getDB();
    let query, params;

    switch (filter) {
      case "mine":
        query = `SELECT COUNT(hash) AS count FROM bulletins WHERE address = $1`;
        params = [address];
        break;
      case "followed":
        query = `SELECT COUNT(b.hash) AS count FROM bulletins b INNER JOIN follows f ON b.address = f.remote WHERE f.local = $1`;
        params = [address];
        break;
      case "bookmarked":
        query = `SELECT COUNT(hash) AS count FROM bulletins WHERE is_marked = $1`;
        params = [Bool2Int(true)];
        break;
      default: // 'all'
        query = `SELECT COUNT(hash) AS count FROM bulletins`;
        params = [];
    }

    const [result] = await db.select(query, params);
    return result ? result.count : 0;
  },

  /**
   * Bulk delete bulletins by hash.
   *
   * One statement per chunk instead of one round-trip per hash. The old code
   * returned a loop counter, so the reported count was the input length
   * regardless of what actually matched; this pre-counts the rows that exist so
   * the return value stays truthful. (This plugin's `execute` resolves to void,
   * so `rowsAffected` is not available here.)
   */
  async deleteBulletinsByHashes(hashes) {
    if (!Array.isArray(hashes) || hashes.length === 0) return 0;
    const db = await getDB();
    let deleted = 0;
    for (const part of chunkByVars(hashes, 1)) {
      const placeholder = part.map((_, i) => `$${i + 1}`).join(", ");
      const [row] = await db.select(
        `SELECT COUNT(*) AS c FROM bulletins WHERE hash IN (${placeholder})`,
        part,
      );
      deleted += (row && row.c) || 0;
      await db.execute(
        `DELETE FROM bulletins WHERE hash IN (${placeholder})`,
        part,
      );
    }
    return deleted;
  },

  async searchBulletinsForManagement({
    query,
    filter,
    address,
    page = 1,
    pageSize = BulletinPageSize,
  }) {
    const db = await getDB();
    const offset = (page - 1) * pageSize;
    let querySql, params;

    const hasSearch = query && query.trim().length > 0;
    const likePattern = `%${query.trim()}%`;

    switch (filter) {
      case "mine":
        if (hasSearch) {
          querySql = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked FROM bulletins b LEFT JOIN contacts c ON b.address = c.address WHERE b.address = $1 AND b.content LIKE $2 ORDER BY b.signed_at DESC LIMIT $3 OFFSET $4`;
          params = [address, likePattern, pageSize, offset];
        } else {
          querySql = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked FROM bulletins b LEFT JOIN contacts c ON b.address = c.address WHERE b.address = $1 ORDER BY b.signed_at DESC LIMIT $2 OFFSET $3`;
          params = [address, pageSize, offset];
        }
        break;
      case "followed":
        if (hasSearch) {
          querySql = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked, 1 AS is_followed FROM bulletins b INNER JOIN follows f ON b.address = f.remote LEFT JOIN contacts c ON b.address = c.address WHERE f.local = $1 AND b.content LIKE $2 ORDER BY b.signed_at DESC LIMIT $3 OFFSET $4`;
          params = [address, likePattern, pageSize, offset];
        } else {
          querySql = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked, 1 AS is_followed FROM bulletins b INNER JOIN follows f ON b.address = f.remote LEFT JOIN contacts c ON b.address = c.address WHERE f.local = $1 ORDER BY b.signed_at DESC LIMIT $2 OFFSET $3`;
          params = [address, pageSize, offset];
        }
        break;
      case "bookmarked":
        if (hasSearch) {
          querySql = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked FROM bulletins b LEFT JOIN contacts c ON b.address = c.address WHERE b.is_marked = $1 AND b.content LIKE $2 ORDER BY b.signed_at DESC LIMIT $3 OFFSET $4`;
          params = [Bool2Int(true), likePattern, pageSize, offset];
        } else {
          querySql = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked FROM bulletins b LEFT JOIN contacts c ON b.address = c.address WHERE b.is_marked = $1 ORDER BY b.signed_at DESC LIMIT $2 OFFSET $3`;
          params = [Bool2Int(true), pageSize, offset];
        }
        break;
      default: // 'all'
        if (hasSearch) {
          querySql = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked, (SELECT COUNT(f.remote) > 0 FROM follows f WHERE f.remote = b.address AND f.local = $1) AS is_followed FROM bulletins b LEFT JOIN contacts c ON b.address = c.address WHERE b.content LIKE $2 ORDER BY b.signed_at DESC LIMIT $3 OFFSET $4`;
          params = [address, likePattern, pageSize, offset];
        } else {
          querySql = `SELECT b.hash, b.address, b.sequence, c.nickname, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked, (SELECT COUNT(f.remote) > 0 FROM follows f WHERE f.remote = b.address AND f.local = $1) AS is_followed FROM bulletins b LEFT JOIN contacts c ON b.address = c.address ORDER BY b.signed_at DESC LIMIT $2 OFFSET $3`;
          params = [address, pageSize, offset];
        }
        break;
    }

    const rows = await db.select(querySql, params);
    return rows.map((r) => ({
      ...r,
      is_marked: Int2Bool(r.is_marked),
      is_followed:
        r.is_followed !== undefined ? Int2Bool(r.is_followed) : false,
    }));
  },

  async getBulletinsByTag({ tagName, page = 1, pageSize = BulletinPageSize }) {
    const db = await getDB();
    const offset = (page - 1) * pageSize;
    const querySql = `
      SELECT b.hash, b.address, b.sequence, SUBSTR(b.content, 1, 100) AS content_preview, b.signed_at, b.is_marked, LENGTH(b.json) AS estimated_size
      FROM bulletins b
      INNER JOIN bulletin_tags bt ON b.hash = bt.bulletin_hash
      INNER JOIN tags t ON bt.tag_id = t.id
      WHERE t.name = $1
      ORDER BY b.signed_at DESC
      LIMIT $2 OFFSET $3
    `;
    const rows = await db.select(querySql, [tagName, pageSize, offset]);
    return rows.map((r) => ({
      ...r,
      is_marked: Int2Bool(r.is_marked),
    }));
  },

  async getAllTags() {
    const db = await getDB();
    const rows = await db.select(
      `SELECT DISTINCT name FROM tags ORDER BY name`,
    );
    return rows.map((r) => r.name);
  },
};
