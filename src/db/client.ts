import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

let DATA_DIR = process.env.WASP_DATA_DIR || join(homedir(), '.wasp');
let DB_PATH = join(DATA_DIR, 'wasp.db');

let db: Database | null = null;

// For testing - reload paths from env
export function reloadPaths(): void {
  DATA_DIR = process.env.WASP_DATA_DIR || join(homedir(), '.wasp');
  DB_PATH = join(DATA_DIR, 'wasp.db');
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getDbPath(): string {
  return DB_PATH;
}

export function isInitialized(): boolean {
  return existsSync(DB_PATH);
}

export function getDb(): Database {
  if (!db) {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
  }
  return db;
}

export function initSchema(): void {
  const db = getDb();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'whatsapp',
      name TEXT,
      trust TEXT NOT NULL DEFAULT 'trusted',
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT,
      UNIQUE(identifier, platform)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      identifier TEXT NOT NULL,
      platform TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS quarantine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'whatsapp',
      message_preview TEXT,
      full_message TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_identifier ON contacts(identifier);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_quarantine_identifier ON quarantine(identifier);
    CREATE INDEX IF NOT EXISTS idx_quarantine_reviewed ON quarantine(reviewed);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// For testing - reset in-memory state
export function resetCache(): void {
  if (db) {
    db.close();
    db = null;
  }
}
