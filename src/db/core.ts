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
    PRIMARY KEY (local, remote));`,

  `CREATE TABLE IF NOT EXISTS friends (
    local TEXT NOT NULL, remote TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (local, remote));`,

  `CREATE TABLE IF NOT EXISTS avatar_files (
    address TEXT PRIMARY KEY, hash TEXT NOT NULL, size INTEGER NOT NULL,
    signed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    json TEXT, is_saved INTEGER DEFAULT 0, image_base64 TEXT);`,

  `CREATE TABLE IF NOT EXISTS channels (
    name TEXT NOT NULL, created_by TEXT NOT NULL, speaker TEXT NOT NULL,
    created_at INTEGER NOT NULL, PRIMARY KEY (name, created_by));`,

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
    pre_hash TEXT NOT NULL, next_hash TEXT, is_marked INTEGER DEFAULT 0);`,

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
    is_readed INTEGER DEFAULT 0, is_object INTEGER DEFAULT 0,
    object_type INTEGER DEFAULT 0);`,

  `CREATE TABLE IF NOT EXISTS groups (
    hash TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL,
    member TEXT NOT NULL, created_at INTEGER NOT NULL,
    create_json TEXT NOT NULL, deleted_at INTEGER,
    delete_json TEXT, is_accepted INTEGER DEFAULT 0);`,

  `CREATE TABLE IF NOT EXISTS group_messages (
    hash TEXT PRIMARY KEY, group_hash TEXT NOT NULL,
    address TEXT NOT NULL, sequence INTEGER NOT NULL,
    pre_hash TEXT NOT NULL, content TEXT NOT NULL, json TEXT NOT NULL,
    signed_at INTEGER NOT NULL, is_confirmed INTEGER DEFAULT 0,
    is_marked INTEGER DEFAULT 0, is_readed INTEGER DEFAULT 0,
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
  Logger.info("[DB-DEBUG] initDB done");
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
