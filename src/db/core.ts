// @ts-nocheck - react-native-nitro-sqlite
import { NitroSQLite } from "react-native-nitro-sqlite";

import Logger from "../lib/Logger";

// Module-level check: log whether NitroSQLite is available
try {
  Logger.info("[DB-DEBUG] NitroSQLite type:", typeof NitroSQLite);
  if (NitroSQLite) {
    Logger.info(
      "[DB-DEBUG] NitroSQLite keys:",
      Object.keys(NitroSQLite).join(","),
    );
  }
} catch (e) {
  Logger.error("[DB-DEBUG] NitroSQLite check failed:", e.message);
}

const DB_NAME = "ripplemessenger.db";

let dbReady: boolean = false;

/**
 * Convert Tauri-style $N placeholders to SQLite ? placeholders.
 */
function convertPlaceholders(sql: string): string {
  return sql.replace(/\$(\d+)/g, "?$1");
}

function checkResult(result: any, sql: string): void {
  // quick-sqlite reports errors via status === 1 and a message field.
  if (result && result.status === 1) {
    throw new Error(result.message || `SQL error: ${sql}`);
  }
}

class SQLiteDatabase {
  async execute(sql: string, params?: any[]): Promise<void> {
    const convertedSql = convertPlaceholders(sql);
    const result = NitroSQLite.execute(DB_NAME, convertedSql, params || []);
    checkResult(result, convertedSql);
  }

  async select(sql: string, params?: any[]): Promise<any[]> {
    const convertedSql = convertPlaceholders(sql);
    const result = NitroSQLite.execute(DB_NAME, convertedSql, params || []);
    checkResult(result, convertedSql);
    if (!result.rows || !result.rows._array) {
      return [];
    }
    return result.rows._array;
  }
}

/**
 * Conservative cap on bound parameters per statement.
 *
 * SQLite's SQLITE_MAX_VARIABLE_NUMBER defaults to 999 on builds older than
 * 3.32, so stay comfortably under that. Used by the batching helpers below to
 * collapse "one statement per row" loops into a handful of multi-row
 * statements (SQLite executes each statement atomically, which is the only
 * transaction primitive available here — this plugin exposes no BEGIN/COMMIT
 * and its connection pool would not honour a cross-call transaction anyway).
 */
export const MAX_SQL_VARS = 900;

/**
 * Split a list into chunks whose multi-row statement stays within the
 * parameter cap.
 * @param items - Items to batch
 * @param varsPerItem - Bound parameters each item contributes
 */
export function chunkByVars<T>(items: T[], varsPerItem: number): T[][] {
  const size = Math.max(1, Math.floor(MAX_SQL_VARS / varsPerItem));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Build a multi-row placeholder list: `($1, $2), ($3, $4), …`.
 * @param count - Number of rows
 * @param varsPerItem - Parameters per row
 */
export function valueGroups(count: number, varsPerItem: number): string {
  const groups: string[] = [];
  for (let i = 0; i < count; i++) {
    const tuple: string[] = [];
    for (let v = 0; v < varsPerItem; v++) {
      tuple.push(`$${i * varsPerItem + v + 1}`);
    }
    groups.push(`(${tuple.join(", ")})`);
  }
  return groups.join(", ");
}

/**
 * All CREATE TABLE schemas for the RippleMessenger database.
 */
const SCHEMAS: string[] = [
  `CREATE TABLE IF NOT EXISTS servers (
    url TEXT PRIMARY KEY, priority INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL, is_connect INTEGER DEFAULT 0);`,

  `CREATE TABLE IF NOT EXISTS contacts (
    address TEXT PRIMARY KEY, nickname TEXT NOT NULL, updated_at INTEGER NOT NULL);`,

  `CREATE TABLE IF NOT EXISTS accounts (
    address TEXT PRIMARY KEY, salt TEXT NOT NULL,
    cipher_data TEXT NOT NULL, updated_at INTEGER NOT NULL);`,

  `CREATE TABLE IF NOT EXISTS follows (
    local TEXT NOT NULL, remote TEXT NOT NULL, updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    PRIMARY KEY (local, remote));`,

  `CREATE TABLE IF NOT EXISTS friends (
    local TEXT NOT NULL, remote TEXT NOT NULL, updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    PRIMARY KEY (local, remote));`,

  `CREATE TABLE IF NOT EXISTS avatar_files (
    address TEXT PRIMARY KEY, hash TEXT NOT NULL, size INTEGER NOT NULL,
    signed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    json TEXT, is_saved INTEGER DEFAULT 0, image_base64 TEXT);`,

  `CREATE TABLE IF NOT EXISTS files (
    hash TEXT PRIMARY KEY, size INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    chunk_length INTEGER NOT NULL, chunk_cursor INTEGER NOT NULL,
    is_saved INTEGER DEFAULT 0);`,

  `CREATE TABLE IF NOT EXISTS private_chat_files (
    ehash TEXT PRIMARY KEY, address1 TEXT NOT NULL,
    address2 TEXT NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL);`,

  `CREATE TABLE IF NOT EXISTS group_chat_files (
    ehash TEXT PRIMARY KEY, group_hash TEXT NOT NULL,
    hash TEXT NOT NULL, size INTEGER NOT NULL);`,

  `CREATE TABLE IF NOT EXISTS handshakes (
    self_address TEXT NOT NULL, pair_address TEXT NOT NULL,
    partition INTEGER NOT NULL, sequence INTEGER NOT NULL,
    aes_key TEXT, private_key TEXT NOT NULL, public_key TEXT NOT NULL,
    self_json TEXT NOT NULL, pair_json TEXT,
    PRIMARY KEY (self_address, pair_address, partition, sequence));`,

  `CREATE TABLE IF NOT EXISTS bulletins (
    hash TEXT PRIMARY KEY, address TEXT NOT NULL, sequence INTEGER NOT NULL,
    content TEXT NOT NULL, json TEXT NOT NULL, signed_at INTEGER NOT NULL,
    pre_hash TEXT NOT NULL, next_hash TEXT, is_marked INTEGER DEFAULT 0,
    marked_at INTEGER DEFAULT 0);`,

  `CREATE TABLE IF NOT EXISTS bulletin_replys (
    bulletin_hash TEXT NOT NULL, reply_hash TEXT NOT NULL,
    reply_signed_at INTEGER NOT NULL,
    PRIMARY KEY (bulletin_hash, reply_hash),
    CHECK (bulletin_hash != reply_hash),
    FOREIGN KEY (bulletin_hash) REFERENCES bulletins(hash) ON DELETE CASCADE,
    FOREIGN KEY (reply_hash) REFERENCES bulletins(hash) ON DELETE CASCADE);`,

  `CREATE TABLE IF NOT EXISTS bulletin_files (
    bulletin_hash TEXT NOT NULL, file_hash TEXT NOT NULL,
    file_size INTEGER NOT NULL, file_name TEXT NOT NULL, file_ext TEXT NOT NULL,
    PRIMARY KEY (bulletin_hash, file_hash),
    FOREIGN KEY (bulletin_hash) REFERENCES bulletins(hash) ON DELETE CASCADE,
    FOREIGN KEY (file_hash) REFERENCES files(hash) ON DELETE CASCADE);`,

  `CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY autoincrement, name TEXT NOT NULL unique);`,

  `CREATE TABLE IF NOT EXISTS bulletin_tags (
    bulletin_hash TEXT NOT NULL, bulletin_signed_at INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (bulletin_hash, tag_id),
    FOREIGN KEY (bulletin_hash) REFERENCES bulletins(hash) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE);`,

  `CREATE TABLE IF NOT EXISTS private_messages (
    hash TEXT PRIMARY KEY, sour TEXT NOT NULL, dest TEXT NOT NULL,
    sequence INTEGER NOT NULL, pre_hash TEXT NOT NULL,
    content TEXT NOT NULL, json TEXT NOT NULL, signed_at INTEGER NOT NULL,
    is_confirmed INTEGER DEFAULT 0, is_marked INTEGER DEFAULT 0,
    marked_at INTEGER DEFAULT 0,
    is_readed INTEGER DEFAULT 0, is_object INTEGER DEFAULT 0,
    object_type INTEGER DEFAULT 0);`,

  `CREATE TABLE IF NOT EXISTS groups (
    hash TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL,
    member TEXT NOT NULL, created_at INTEGER NOT NULL,
    create_json TEXT NOT NULL, deleted_at INTEGER,
    delete_json TEXT, is_accepted INTEGER DEFAULT 0, cleared_at INTEGER);`,

  `CREATE TABLE IF NOT EXISTS group_messages (
    hash TEXT PRIMARY KEY, group_hash TEXT NOT NULL,
    address TEXT NOT NULL, sequence INTEGER NOT NULL,
    pre_hash TEXT NOT NULL, content TEXT NOT NULL, json TEXT NOT NULL,
    signed_at INTEGER NOT NULL, is_confirmed INTEGER DEFAULT 0,
    is_marked INTEGER DEFAULT 0, marked_at INTEGER DEFAULT 0,
    is_readed INTEGER DEFAULT 0,
    is_object INTEGER DEFAULT 0, object_type INTEGER DEFAULT 0);`,
];

/**
 * Initialize all database tables using a batched execute.
 */
function initDB(): void {
  Logger.info("[DB-DEBUG] initDB start");
  // Run all DDL in one batch for efficiency.
  const batchResult = NitroSQLite.executeBatch(
    DB_NAME,
    SCHEMAS.map((schema) => ({ query: schema })),
  );
  Logger.info(
    "[DB-DEBUG] executeBatch done, status=",
    batchResult && batchResult.status,
  );

  // Migration: add image_base64 column to avatar_files if missing.
  const info = NitroSQLite.execute(
    DB_NAME,
    'SELECT COUNT(*) AS cnt FROM pragma_table_info("avatar_files") WHERE name = "image_base64"',
  );
  Logger.info(
    "[DB-DEBUG] pragma query done, rows=",
    info && info.rows && info.rows._array && info.rows._array.length,
  );
  const count =
    info.rows && info.rows._array && info.rows._array.length > 0
      ? info.rows._array[0].cnt
      : 0;
  if (count === 0) {
    NitroSQLite.execute(
      DB_NAME,
      "ALTER TABLE avatar_files ADD COLUMN image_base64 TEXT",
    );
  }

  // Migration: add cleared_at column to groups if missing.
  const groupInfo = NitroSQLite.execute(
    DB_NAME,
    'SELECT COUNT(*) AS cnt FROM pragma_table_info("groups") WHERE name = "cleared_at"',
  );
  const groupCount =
    groupInfo.rows && groupInfo.rows._array && groupInfo.rows._array.length > 0
      ? groupInfo.rows._array[0].cnt
      : 0;
  if (groupCount === 0) {
    NitroSQLite.execute(
      DB_NAME,
      "ALTER TABLE groups ADD COLUMN cleared_at INTEGER",
    );
  }

  // Migration: add is_deleted column to follows/friends if missing.
  for (const table of ["follows", "friends"]) {
    const colInfo = NitroSQLite.execute(
      DB_NAME,
      `SELECT COUNT(*) AS cnt FROM pragma_table_info("${table}") WHERE name = "is_deleted"`,
    );
    const colCount =
      colInfo.rows && colInfo.rows._array && colInfo.rows._array.length > 0
        ? colInfo.rows._array[0].cnt
        : 0;
    if (colCount === 0) {
      NitroSQLite.execute(
        DB_NAME,
        `ALTER TABLE ${table} ADD COLUMN is_deleted INTEGER DEFAULT 0`,
      );
    }
  }

  // Migration: add marked_at column to message tables if missing.
  for (const table of ["bulletins", "private_messages", "group_messages"]) {
    const colInfo = NitroSQLite.execute(
      DB_NAME,
      `SELECT COUNT(*) AS cnt FROM pragma_table_info("${table}") WHERE name = "marked_at"`,
    );
    const colCount =
      colInfo.rows && colInfo.rows._array && colInfo.rows._array.length > 0
        ? colInfo.rows._array[0].cnt
        : 0;
    if (colCount === 0) {
      NitroSQLite.execute(
        DB_NAME,
        `ALTER TABLE ${table} ADD COLUMN marked_at INTEGER DEFAULT 0`,
      );
    }
  }
  // Create indexes for query performance
  createIndexes();

  Logger.info("[DB-DEBUG] initDB done");
}

/**
 * Create all indexes for query performance.
 * Mirrors the indexes from Client's core.js (added 2024-11-11).
 */
function createIndexes(): void {
  const statements = [
    // ── bulletins ──
    // per-address chain walk: last bulletin, by-sequence lookup, gap fill
    'CREATE INDEX IF NOT EXISTS idx_bulletins_address_sequence ON bulletins(address, sequence)',
    // portal / followed / bookmark feeds all sort by signed_at
    'CREATE INDEX IF NOT EXISTS idx_bulletins_signed_at ON bulletins(signed_at)',
    'CREATE INDEX IF NOT EXISTS idx_bulletins_is_marked_signed_at ON bulletins(is_marked, signed_at)',

    // ── bulletin relations ──
    'CREATE INDEX IF NOT EXISTS idx_bulletin_replys_hash_signed_at ON bulletin_replys(bulletin_hash, reply_signed_at)',
    'CREATE INDEX IF NOT EXISTS idx_bulletin_files_file_hash ON bulletin_files(file_hash)',
    'CREATE INDEX IF NOT EXISTS idx_bulletin_tags_tag_signed_at ON bulletin_tags(tag_id, bulletin_signed_at)',

    // ── private messages ── (two independent directions, so both orders)
    'CREATE INDEX IF NOT EXISTS idx_private_messages_sour_dest_signed_at ON private_messages(sour, dest, signed_at)',
    'CREATE INDEX IF NOT EXISTS idx_private_messages_dest_sour_signed_at ON private_messages(dest, sour, signed_at)',
    'CREATE INDEX IF NOT EXISTS idx_private_messages_sour_dest_sequence ON private_messages(sour, dest, sequence)',

    // ── group messages ──
    'CREATE INDEX IF NOT EXISTS idx_group_messages_group_signed_at ON group_messages(group_hash, signed_at)',
    'CREATE INDEX IF NOT EXISTS idx_group_messages_group_address_sequence ON group_messages(group_hash, address, sequence)',
    'CREATE INDEX IF NOT EXISTS idx_group_messages_group_is_readed ON group_messages(group_hash, is_readed)',

    // ── files / avatars ──
    'CREATE INDEX IF NOT EXISTS idx_files_is_saved_updated_at ON files(is_saved, updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_avatar_files_hash ON avatar_files(hash)',
    'CREATE INDEX IF NOT EXISTS idx_avatar_files_updated_at ON avatar_files(updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_private_chat_files_hash ON private_chat_files(hash)',
    'CREATE INDEX IF NOT EXISTS idx_group_chat_files_hash ON group_chat_files(hash)',
    'CREATE INDEX IF NOT EXISTS idx_group_chat_files_group_hash ON group_chat_files(group_hash)',

    // ── groups ──
    'CREATE INDEX IF NOT EXISTS idx_groups_is_accepted ON groups(is_accepted)'
  ];

  for (const sql of statements) {
    try {
      NitroSQLite.execute(DB_NAME, sql);
    } catch (e: any) {
      // A failed index must not stop the app from starting.
      Logger.warn('[DB-Index] failed:', sql, e.message || e);
    }
  }
}

/**
 * Get the database singleton instance, initializing lazily.
 *
 * Uses react-native-quick-sqlite (JSI-based), which works correctly in
 * React Native Bridgeless / New Architecture mode on Android. This replaces
 * react-native-sqlite-storage, whose legacy-bridge callbacks were silently
 * dropped after the first transaction batch in Bridgeless mode.
 */
export async function getDB(): Promise<SQLiteDatabase> {
  if (dbReady) {
    return new SQLiteDatabase();
  }

  Logger.info("[DB-DEBUG] getDB: opening db");
  NitroSQLite.open({ name: DB_NAME });
  Logger.info("[DB-DEBUG] getDB: db opened, calling initDB");
  initDB();
  dbReady = true;
  Logger.info("[DB] All tables initialized (nitro-sqlite)");
  return new SQLiteDatabase();
}
