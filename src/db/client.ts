import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Contact, AuditEntry } from '../types.js';

const DATA_DIR = process.env.WASP_DATA_DIR || join(homedir(), '.wasp');
const DB_PATH = join(DATA_DIR, 'wasp.json');

interface DbData {
  contacts: Contact[];
  auditLog: AuditEntry[];
  meta: {
    version: string;
    createdAt: string;
  };
}

let cachedData: DbData | null = null;

export function getDataDir(): string {
  return DATA_DIR;
}

export function getDbPath(): string {
  return DB_PATH;
}

export function isInitialized(): boolean {
  return existsSync(DB_PATH);
}

function defaultData(): DbData {
  return {
    contacts: [],
    auditLog: [],
    meta: {
      version: '0.0.1',
      createdAt: new Date().toISOString()
    }
  };
}

export function getData(): DbData {
  if (cachedData) return cachedData;
  
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  
  if (!existsSync(DB_PATH)) {
    cachedData = defaultData();
    saveData();
    return cachedData;
  }
  
  try {
    const raw = readFileSync(DB_PATH, 'utf-8');
    cachedData = JSON.parse(raw);
    return cachedData!;
  } catch {
    cachedData = defaultData();
    saveData();
    return cachedData;
  }
}

export function saveData(): void {
  if (!cachedData) return;
  
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  
  writeFileSync(DB_PATH, JSON.stringify(cachedData, null, 2));
}

export function initSchema(): void {
  // For JSON storage, just ensure the file exists
  getData();
}

export function closeDb(): void {
  // Save any pending changes
  if (cachedData) {
    saveData();
  }
  cachedData = null;
}

// For testing - reset in-memory cache
export function resetCache(): void {
  cachedData = null;
}
