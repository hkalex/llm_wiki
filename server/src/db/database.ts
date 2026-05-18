import BetterSqlite3 from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import fs from "fs"
import path from "path"
import * as schema from "./schema"
import { config } from "../config"

const MIGRATION_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, project_id, key)
);

CREATE TABLE IF NOT EXISTS ingest_queue (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (_db) return _db

  // Ensure data directory exists
  const dbPath = config.databaseUrl
  const dbDir = path.dirname(path.resolve(dbPath))
  fs.mkdirSync(dbDir, { recursive: true })

  const sqlite = new BetterSqlite3(dbPath)
  sqlite.exec(MIGRATION_SQL)

  _db = drizzle(sqlite, { schema })
  return _db
}

export type DB = ReturnType<typeof getDb>
