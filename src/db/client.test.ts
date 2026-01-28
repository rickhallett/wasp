import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Override data dir for tests
const TEST_DIR = join(tmpdir(), `wasp-test-${Date.now()}`);
process.env.WASP_DATA_DIR = TEST_DIR;

// Import after setting env
import { closeDb, getDb, initSchema, isInitialized, resetCache } from './client.js';

describe('db/client', () => {
  beforeAll(() => {
    resetCache();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should initialize database', () => {
    initSchema();
    expect(isInitialized()).toBe(true);
  });

  it('should create tables', () => {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    const tables = stmt.all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('contacts');
    expect(tableNames).toContain('audit_log');
    expect(tableNames).toContain('quarantine');
  });
});
