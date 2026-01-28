import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from 'bun:sqlite';

describe('db/quarantine', () => {
  const TEST_DIR = join(tmpdir(), 'wasp-quarantine-' + process.pid + '-' + Date.now());
  
  beforeAll(() => {
    // Clean up any existing test dir
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    process.env.WASP_DATA_DIR = TEST_DIR;
  });

  afterAll(() => {
    delete process.env.WASP_DATA_DIR;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // Fresh imports for each test run to avoid caching issues
  it('should quarantine and retrieve messages', async () => {
    // Dynamic import to get fresh module with correct env
    const { initSchema, resetCache, reloadPaths } = await import('./client.js');
    const { quarantineMessage, getQuarantined, getQuarantinedByIdentifier, releaseQuarantined, deleteQuarantined } = await import('./quarantine.js');
    
    resetCache();
    reloadPaths();
    initSchema();
    
    // Test quarantine
    quarantineMessage('+441234567890', 'whatsapp', 'Hello, this is a test message');
    const quarantined = getQuarantined();
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].identifier).toBe('+441234567890');
    
    // Test long message truncation
    const longMessage = 'A'.repeat(200);
    quarantineMessage('+449876543210', 'whatsapp', longMessage);
    const longQuarantined = getQuarantinedByIdentifier('+449876543210');
    expect(longQuarantined.length).toBe(1);
    expect(longQuarantined[0].messagePreview.length).toBeLessThan(110);
    expect(longQuarantined[0].fullMessage.length).toBe(200);
    
    // Test get by identifier
    const byId = getQuarantinedByIdentifier('+441234567890');
    expect(byId.length).toBe(1);
    
    // Test release
    const released = releaseQuarantined('+441234567890');
    expect(released.length).toBe(1);
    const afterRelease = getQuarantinedByIdentifier('+441234567890');
    expect(afterRelease.length).toBe(0);
    
    // Test delete
    quarantineMessage('+440000000000', 'whatsapp', 'Delete me');
    const deleted = deleteQuarantined('+440000000000');
    expect(deleted).toBe(1);
    const afterDelete = getQuarantinedByIdentifier('+440000000000');
    expect(afterDelete.length).toBe(0);
  });
});
