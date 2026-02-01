import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type DbAdapter } from './adapter.js';

// Configuration - can be set explicitly or via env
let configuredDataDir: string | null = null;

function getEffectiveDataDir(): string {
  return configuredDataDir || process.env.WASP_DATA_DIR || join(homedir(), '.wasp');
}

function getEffectiveDbPath(): string {
  return join(getEffectiveDataDir(), 'wasp.db');
}

let db: DbAdapter | null = null;

/**
 * Configure the data directory explicitly.
 * Call this before any database operations if you need a custom location.
 * This avoids mutating process.env.
 */
export function setDataDir(dataDir: string): void {
  if (db) {
    throw new Error(
      'Cannot change data directory after database is initialized. Call closeDb() first.'
    );
  }
  configuredDataDir = dataDir;
}

/**
 * For testing - reload paths from env (resets explicit config)
 */
export function reloadPaths(): void {
  configuredDataDir = null;
}

export function getDataDir(): string {
  return getEffectiveDataDir();
}

export function getDbPath(): string {
  return getEffectiveDbPath();
}

export function isInitialized(): boolean {
  return existsSync(getEffectiveDbPath());
}

export function getDb(): DbAdapter {
  if (!db) {
    const dataDir = getEffectiveDataDir();
    const dbPath = getEffectiveDbPath();

    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    db = createDatabase(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
  }
  return db;
}

export function initSchema(): void {
  const database = getDb();

  database.exec(`
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

    CREATE TABLE IF NOT EXISTS injection_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      platform TEXT NOT NULL,
      score REAL NOT NULL,
      patterns TEXT,
      sensitive_verbs TEXT,
      message_preview TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_identifier ON contacts(identifier);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_quarantine_identifier ON quarantine(identifier);
    CREATE INDEX IF NOT EXISTS idx_quarantine_reviewed ON quarantine(reviewed);
    CREATE INDEX IF NOT EXISTS idx_injection_timestamp ON injection_telemetry(timestamp);
    CREATE INDEX IF NOT EXISTS idx_injection_identifier ON injection_telemetry(identifier);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * For testing - reset in-memory state
 */
export function resetCache(): void {
  if (db) {
    db.close();
    db = null;
  }
  configuredDataDir = null;
}
