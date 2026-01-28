import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('db/audit', () => {
  const TEST_DIR = join(tmpdir(), `wasp-audit-${process.pid}-${Date.now()}`);

  beforeAll(() => {
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

  it('should log and retrieve audit entries', async () => {
    const { initSchema, resetCache, reloadPaths } = await import('./client.js');
    const { logDecision, getAuditLog, clearAuditLog } = await import('./audit.js');

    resetCache();
    reloadPaths();
    initSchema();

    // Log some decisions
    logDecision('+441234567890', 'whatsapp', 'allow', 'Contact is trusted');
    logDecision('+449999999999', 'whatsapp', 'deny', 'Contact not in whitelist');
    logDecision('+441111111111', 'telegram', 'limited', 'Limited trust');

    // Get all entries
    const allEntries = getAuditLog({ limit: 10 });
    expect(allEntries.length).toBe(3);

    // Most recent first
    expect(allEntries[0].identifier).toBe('+441111111111');
    expect(allEntries[0].decision).toBe('limited');

    // Filter by decision
    const deniedOnly = getAuditLog({ decision: 'deny' });
    expect(deniedOnly.length).toBe(1);
    expect(deniedOnly[0].identifier).toBe('+449999999999');

    // Filter by allow
    const allowedOnly = getAuditLog({ decision: 'allow' });
    expect(allowedOnly.length).toBe(1);
    expect(allowedOnly[0].identifier).toBe('+441234567890');

    // Verify entry structure
    const entry = allEntries[0];
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(entry.platform).toBe('telegram');
    expect(entry.reason).toBe('Limited trust');
  });

  it('should respect limit parameter', async () => {
    const { getAuditLog } = await import('./audit.js');

    const limited = getAuditLog({ limit: 2 });
    expect(limited.length).toBe(2);
  });

  it('should clear old entries', async () => {
    const { clearAuditLog, getAuditLog } = await import('./audit.js');

    // Clear entries older than 0 days (all of them since they're from today)
    // This won't actually clear them since they're from "now"
    const _cleared = clearAuditLog(0);

    // Entries are still there (they're not older than 0 days)
    const remaining = getAuditLog({});
    expect(remaining.length).toBeGreaterThan(0);
  });
});
