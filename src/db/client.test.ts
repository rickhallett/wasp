import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Override data dir for tests
const TEST_DIR = join(tmpdir(), 'wasp-test-' + Date.now());
process.env.WASP_DATA_DIR = TEST_DIR;

// Import after setting env
import { getData, initSchema, isInitialized, closeDb, getDataDir, resetCache } from './client.js';

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

  it('should create data structure', () => {
    const data = getData();
    expect(data.contacts).toBeInstanceOf(Array);
    expect(data.auditLog).toBeInstanceOf(Array);
    expect(data.meta.version).toBe('0.0.1');
  });
});
