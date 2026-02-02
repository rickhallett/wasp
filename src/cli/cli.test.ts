/**
 * CLI output architecture tests
 * Tests data shapes returned by command functions (not stdout)
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set up unique test directory BEFORE importing modules that use the DB
const TEST_DIR = join(tmpdir(), `wasp-test-cli-${Date.now()}`);
process.env.WASP_DATA_DIR = TEST_DIR;

import { doAddContact } from '../commands/add.js';
import { doCheckContact } from '../commands/check.js';
import { doInit } from '../commands/init.js';
import { getContactList } from '../commands/list.js';
import { getAuditLogData } from '../commands/log.js';
import { doRemoveContact } from '../commands/remove.js';
import {
  doApproveQuarantined,
  doDenyQuarantined,
  getBlockedContacts,
  getQuarantineList,
} from '../commands/review.js';
import { closeDb, initSchema, resetCache } from '../db/client.js';
import { quarantineMessage } from '../db/quarantine.js';
import { formatResult } from './formatters.js';

beforeAll(() => {
  resetCache();
  initSchema();
});

describe('CLI Result Types', () => {
  describe('init', () => {
    it('returns InitResult with correct shape', () => {
      const result = doInit({});
      expect(result.kind).toBe('init');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.alreadyInitialized).toBe('boolean');
      expect(typeof result.dataDir).toBe('string');
      expect(typeof result.message).toBe('string');
    });

    it('reports already initialized on second call', () => {
      doInit({});
      const result = doInit({});
      expect(result.alreadyInitialized).toBe(true);
    });

    it('force reinitializes when requested', () => {
      doInit({});
      const result = doInit({ force: true });
      expect(result.alreadyInitialized).toBe(false);
    });
  });

  describe('add', () => {
    it('returns ContactAddResult with correct shape', () => {
      const result = doAddContact('+440123456789', {
        platform: 'whatsapp',
        trust: 'trusted',
        name: 'Test User',
      });

      expect(result.kind).toBe('contact-add');
      expect(result.contact).toBeDefined();
      expect(result.contact.identifier).toBe('+440123456789');
      expect(result.contact.platform).toBe('whatsapp');
      expect(result.contact.trust).toBe('trusted');
      expect(result.contact.name).toBe('Test User');
    });

    it('uses defaults for optional fields', () => {
      const result = doAddContact('+440123456789', {});

      expect(result.contact.platform).toBe('whatsapp');
      expect(result.contact.trust).toBe('trusted');
    });
  });

  describe('remove', () => {
    it('returns ContactRemoveResult with removed=true for existing contact', () => {
      doAddContact('+440123456789', {});
      const result = doRemoveContact('+440123456789', 'whatsapp');

      expect(result.kind).toBe('contact-remove');
      expect(result.identifier).toBe('+440123456789');
      expect(result.platform).toBe('whatsapp');
      expect(result.removed).toBe(true);
    });

    it('returns ContactRemoveResult with removed=false for non-existent contact', () => {
      const result = doRemoveContact('+440123456789', 'whatsapp');

      expect(result.kind).toBe('contact-remove');
      expect(result.removed).toBe(false);
    });
  });

  describe('list', () => {
    it('returns ContactListResult with correct shape', () => {
      const result = getContactList({});

      expect(result.kind).toBe('contact-list');
      expect(Array.isArray(result.contacts)).toBe(true);
      expect(typeof result.count).toBe('number');
    });

    it('includes added contacts', () => {
      const before = getContactList({}).count;
      doAddContact('+440111111111', { name: 'ListTest1' });
      doAddContact('+440111111112', { name: 'ListTest2' });

      const result = getContactList({});

      expect(result.count).toBe(before + 2);
    });

    it('filters by platform', () => {
      // Use unique identifiers to avoid collision
      doAddContact('+440222222221', { platform: 'whatsapp' });
      doAddContact('filter-test@example.com', { platform: 'email' });

      const whatsappResult = getContactList({ platform: 'whatsapp' });
      const emailResult = getContactList({ platform: 'email' });

      // All whatsapp contacts should have platform=whatsapp
      expect(whatsappResult.contacts.every((c) => c.platform === 'whatsapp')).toBe(true);
      expect(emailResult.contacts.every((c) => c.platform === 'email')).toBe(true);
    });

    it('filters by trust level', () => {
      // Use unique identifiers
      doAddContact('+440333333331', { trust: 'sovereign' });
      doAddContact('+440333333332', { trust: 'limited' });

      const sovereignResult = getContactList({ trust: 'sovereign' });
      const limitedResult = getContactList({ trust: 'limited' });

      expect(sovereignResult.contacts.every((c) => c.trust === 'sovereign')).toBe(true);
      expect(limitedResult.contacts.every((c) => c.trust === 'limited')).toBe(true);
    });
  });

  describe('check', () => {
    it('returns ContactCheckResult with correct shape for allowed contact', () => {
      doAddContact('+440444444441', { trust: 'trusted', name: 'CheckTest' });
      const result = doCheckContact('+440444444441', { platform: 'whatsapp' });

      expect(result.kind).toBe('contact-check');
      expect(result.identifier).toBe('+440444444441');
      expect(result.platform).toBe('whatsapp');
      expect(result.allowed).toBe(true);
      expect(result.trust).toBe('trusted');
      expect(result.name).toBe('CheckTest');
    });

    it('returns ContactCheckResult with correct shape for denied contact', () => {
      // Use an identifier that definitely doesn't exist
      const result = doCheckContact('+449999999999', { platform: 'whatsapp' });

      expect(result.kind).toBe('contact-check');
      expect(result.allowed).toBe(false);
      expect(result.trust).toBe(null);
      expect(typeof result.reason).toBe('string');
    });
  });

  describe('log', () => {
    it('returns AuditLogResult with correct shape', () => {
      const result = getAuditLogData({});

      expect(result.kind).toBe('audit-log');
      expect(Array.isArray(result.entries)).toBe(true);
      expect(typeof result.count).toBe('number');
      expect(result.filters).toBeDefined();
      expect(typeof result.filters.limit).toBe('number');
      expect(typeof result.filters.deniedOnly).toBe('boolean');
    });

    it('respects limit option', () => {
      // Create some audit entries by checking contacts
      doCheckContact('+440123456789', {});
      doCheckContact('+440123456790', {});
      doCheckContact('+440123456791', {});

      const result = getAuditLogData({ limit: 2 });

      expect(result.entries.length).toBeLessThanOrEqual(2);
      expect(result.filters.limit).toBe(2);
    });

    it('filters by denied when requested', () => {
      doAddContact('+440123456789', {}); // Will be allowed
      doCheckContact('+440123456789', {}); // allowed check
      doCheckContact('+440123456790', {}); // denied check

      const result = getAuditLogData({ denied: true });

      expect(result.filters.deniedOnly).toBe(true);
      for (const entry of result.entries) {
        expect(entry.decision).toBe('deny');
      }
    });
  });

  describe('quarantine', () => {
    it('returns QuarantineListResult with correct shape', () => {
      const result = getQuarantineList();

      expect(result.kind).toBe('quarantine-list');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(Array.isArray(result.bySender)).toBe(true);
      expect(typeof result.totalMessages).toBe('number');
      expect(typeof result.senderCount).toBe('number');
    });

    it('returns QuarantineApproveResult for non-existent identifier', () => {
      const result = doApproveQuarantined('+440123456789');

      expect(result.kind).toBe('quarantine-approve');
      expect(result.success).toBe(false);
      expect(result.releasedCount).toBe(0);
    });

    it('returns QuarantineDenyResult for non-existent identifier', () => {
      const result = doDenyQuarantined('+440123456789');

      expect(result.kind).toBe('quarantine-deny');
      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
    });

    it('denied sender stays denied: check returns allowed=false after deny', () => {
      const identifier = '+440555555555';
      const platform = 'whatsapp';
      quarantineMessage(identifier, platform, 'Hello');
      const denyResult = doDenyQuarantined(identifier);
      expect(denyResult.success).toBe(true);
      expect(denyResult.deletedCount).toBe(1);

      const checkResult = doCheckContact(identifier, { platform });
      expect(checkResult.allowed).toBe(false);
      expect(checkResult.reason).toContain('whitelist');
    });

    it('approve quarantined sender on non-whatsapp platform succeeds', () => {
      const identifier = 'telegram-user-123';
      const platform = 'telegram';
      quarantineMessage(identifier, platform, 'Hi from Telegram');
      const result = doApproveQuarantined(identifier);
      expect(result.success).toBe(true);
      expect(result.platform).toBe('telegram');
      expect(result.releasedCount).toBe(1);
      const checkResult = doCheckContact(identifier, { platform });
      expect(checkResult.allowed).toBe(true);
      expect(checkResult.trust).toBe('trusted');
    });

    it('deny quarantined sender on non-whatsapp platform succeeds and messages removed', () => {
      const identifier = 'email-blocked@example.com';
      const platform = 'email';
      quarantineMessage(identifier, platform, 'Spam message');
      const result = doDenyQuarantined(identifier);
      expect(result.success).toBe(true);
      expect(result.platform).toBe('email');
      expect(result.deletedCount).toBe(1);
      const checkResult = doCheckContact(identifier, { platform });
      expect(checkResult.allowed).toBe(false);
    });
  });

  describe('blocked', () => {
    it('returns BlockedContactsResult with correct shape', () => {
      const result = getBlockedContacts();

      expect(result.kind).toBe('blocked-contacts');
      expect(Array.isArray(result.contacts)).toBe(true);
      expect(typeof result.count).toBe('number');
    });

    it('shows denied contacts', () => {
      const beforeCount = getBlockedContacts().count;
      doCheckContact('+440888888881', {}); // Will be denied (not in whitelist)
      doCheckContact('+440888888882', {}); // Will be denied (not in whitelist)

      const result = getBlockedContacts();

      // Should have at least 2 more denied contacts than before
      expect(result.count).toBeGreaterThanOrEqual(beforeCount + 2);
    });
  });
});

describe('Formatters', () => {
  it('formats status result', () => {
    const result = formatResult({
      kind: 'status',
      contactCount: 5,
      sovereignCount: 1,
      trustedCount: 3,
      limitedCount: 1,
      dataDir: '/test',
      defaultAction: 'block',
    });

    expect(result).toContain('🐝 wasp security layer');
    expect(result).toContain('Contacts: 5');
    expect(result).toContain('Sovereign: 1');
    expect(result).toContain('Trusted: 3');
    expect(result).toContain('Limited: 1');
  });

  it('formats empty contact list', () => {
    const result = formatResult({
      kind: 'contact-list',
      contacts: [],
      count: 0,
    });

    expect(result).toBe('No contacts found.');
  });

  it('formats contact check - allowed', () => {
    const result = formatResult({
      kind: 'contact-check',
      identifier: '+440123456789',
      platform: 'whatsapp',
      allowed: true,
      trust: 'trusted',
      name: 'Test User',
      reason: '',
    });

    expect(result).toContain('ALLOWED');
    expect(result).toContain('+440123456789');
    expect(result).toContain('Test User');
    expect(result).toContain('trusted');
  });

  it('formats contact check - denied', () => {
    const result = formatResult({
      kind: 'contact-check',
      identifier: '+440123456789',
      platform: 'whatsapp',
      allowed: false,
      trust: null,
      name: null,
      reason: 'Not in whitelist',
    });

    expect(result).toContain('DENIED');
    expect(result).toContain('+440123456789');
    expect(result).toContain('Not in whitelist');
  });

  it('formats empty quarantine', () => {
    const result = formatResult({
      kind: 'quarantine-list',
      messages: [],
      bySender: [],
      totalMessages: 0,
      senderCount: 0,
    });

    expect(result).toContain('Quarantine is empty');
  });
});

// Cleanup
afterAll(() => {
  closeDb();
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});
