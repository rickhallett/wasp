/**
 * Edge Case Tests
 * 
 * Testing boundary conditions and unusual inputs that could cause issues.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('edge cases', () => {
  const TEST_DIR = join(tmpdir(), 'wasp-edge-' + process.pid + '-' + Date.now());
  
  beforeAll(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    process.env.WASP_DATA_DIR = TEST_DIR;
    
    const { initSchema, resetCache, reloadPaths } = await import('./db/client.js');
    resetCache();
    reloadPaths();
    initSchema();
  });

  afterAll(() => {
    delete process.env.WASP_DATA_DIR;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('contacts - unusual inputs', () => {
    it('should handle identifiers with special characters', async () => {
      const { addContact, getContact, removeContact } = await import('./db/contacts.js');
      
      // Phone with + prefix
      const c1 = addContact('+1 (555) 123-4567', 'whatsapp', 'trusted');
      expect(c1.identifier).toBe('+1 (555) 123-4567');
      
      // Email-style identifier
      const c2 = addContact('user@example.com', 'email', 'trusted');
      expect(c2.identifier).toBe('user@example.com');
      
      // Unicode in name
      const c3 = addContact('+447000000001', 'whatsapp', 'trusted', '日本語 名前');
      expect(c3.name).toBe('日本語 名前');
      
      // Emoji in name
      const c4 = addContact('+447000000002', 'whatsapp', 'trusted', '🔴 HAL');
      expect(c4.name).toBe('🔴 HAL');
      
      // Very long identifier
      const longId = 'a'.repeat(500);
      const c5 = addContact(longId, 'discord', 'trusted');
      expect(c5.identifier).toBe(longId);
      
      // Clean up
      removeContact('+1 (555) 123-4567', 'whatsapp');
      removeContact('user@example.com', 'email');
      removeContact('+447000000001', 'whatsapp');
      removeContact('+447000000002', 'whatsapp');
      removeContact(longId, 'discord');
    });

    it('should handle empty and null-ish values in optional fields', async () => {
      const { addContact, getContact, removeContact } = await import('./db/contacts.js');
      
      // Empty string name (should store as empty, not null)
      const c1 = addContact('+447000000003', 'whatsapp', 'trusted', '');
      // Empty string might be converted to null by SQL, check both
      expect(c1.name === '' || c1.name === null).toBe(true);
      
      // Undefined name
      const c2 = addContact('+447000000004', 'whatsapp', 'trusted', undefined);
      expect(c2.name).toBeNull();
      
      // Clean up
      removeContact('+447000000003', 'whatsapp');
      removeContact('+447000000004', 'whatsapp');
    });

    it('should not allow SQL injection via identifier', async () => {
      const { addContact, getContact, listContacts, removeContact } = await import('./db/contacts.js');
      
      // SQL injection attempts
      const malicious1 = "'; DROP TABLE contacts; --";
      const malicious2 = "1' OR '1'='1";
      const malicious3 = "Robert'); DROP TABLE contacts;--";
      
      const c1 = addContact(malicious1, 'whatsapp', 'trusted');
      const c2 = addContact(malicious2, 'whatsapp', 'trusted');
      const c3 = addContact(malicious3, 'whatsapp', 'trusted', "Bobby Tables");
      
      // Should store literally, not execute
      expect(c1.identifier).toBe(malicious1);
      expect(c2.identifier).toBe(malicious2);
      expect(c3.identifier).toBe(malicious3);
      
      // Table should still exist
      const contacts = listContacts();
      expect(contacts.length).toBeGreaterThan(0);
      
      // Can retrieve them
      const retrieved = getContact(malicious1, 'whatsapp');
      expect(retrieved?.identifier).toBe(malicious1);
      
      // Clean up
      removeContact(malicious1, 'whatsapp');
      removeContact(malicious2, 'whatsapp');
      removeContact(malicious3, 'whatsapp');
    });

    it('should handle same identifier on different platforms', async () => {
      const { addContact, getContact, checkContact, removeContact } = await import('./db/contacts.js');
      
      const id = '+447000000005';
      
      // Same identifier, different platforms, different trust
      addContact(id, 'whatsapp', 'sovereign');
      addContact(id, 'telegram', 'limited');
      addContact(id, 'signal', 'trusted');
      
      // Check returns correct trust for each platform
      const waCheck = checkContact(id, 'whatsapp');
      expect(waCheck.trust).toBe('sovereign');
      
      const tgCheck = checkContact(id, 'telegram');
      expect(tgCheck.trust).toBe('limited');
      
      const sigCheck = checkContact(id, 'signal');
      expect(sigCheck.trust).toBe('trusted');
      
      // Unknown platform should deny
      const unknownCheck = checkContact(id, 'discord');
      expect(unknownCheck.allowed).toBe(false);
      
      // Clean up
      removeContact(id, 'whatsapp');
      removeContact(id, 'telegram');
      removeContact(id, 'signal');
    });
  });

  describe('audit log - edge cases', () => {
    it('should handle very long reason strings', async () => {
      const { logDecision, getAuditLog } = await import('./db/audit.js');
      
      const longReason = 'x'.repeat(10000);
      logDecision('+447000000006', 'whatsapp', 'deny', longReason);
      
      const entries = getAuditLog({ limit: 1 });
      expect(entries[0].reason).toBe(longReason);
    });

    it('should handle empty reason', async () => {
      const { logDecision, getAuditLog } = await import('./db/audit.js');
      
      logDecision('+447000000007', 'whatsapp', 'allow', '');
      
      const entries = getAuditLog({ limit: 1 });
      expect(entries[0].reason).toBe('');
    });
  });

  describe('quarantine - edge cases', () => {
    it('should handle empty message', async () => {
      const { quarantineMessage, getQuarantined } = await import('./db/quarantine.js');
      
      quarantineMessage('+447000000008', 'whatsapp', '');
      
      const q = getQuarantined(10);
      const found = q.find(m => m.identifier === '+447000000008');
      expect(found).toBeDefined();
      expect(found?.messagePreview).toBe('');
    });

    it('should truncate very long messages in preview', async () => {
      const { quarantineMessage, getQuarantined } = await import('./db/quarantine.js');
      
      const longMessage = 'A'.repeat(500);
      quarantineMessage('+447000000009', 'whatsapp', longMessage);
      
      const q = getQuarantined(10);
      const found = q.find(m => m.identifier === '+447000000009');
      expect(found).toBeDefined();
      expect(found!.messagePreview.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(found!.fullMessage.length).toBe(500);
    });

    it('should handle messages with newlines and special chars', async () => {
      const { quarantineMessage, getQuarantined } = await import('./db/quarantine.js');
      
      const weirdMessage = "Line1\nLine2\r\nLine3\tTabbed\0NullByte";
      quarantineMessage('+447000000010', 'whatsapp', weirdMessage);
      
      const q = getQuarantined(10);
      const found = q.find(m => m.identifier === '+447000000010');
      expect(found).toBeDefined();
      expect(found!.fullMessage).toBe(weirdMessage);
    });
  });

  describe('rate limiter - boundary conditions', () => {
    it('should block exactly at limit', async () => {
      const { checkRateLimit, resetRateLimit } = await import('./ratelimit.js');
      
      const key = 'edge-test-exact';
      resetRateLimit(key);
      
      const config = { windowMs: 60000, maxRequests: 3 };
      
      // Request 1, 2, 3 should be allowed
      expect(checkRateLimit(key, config).allowed).toBe(true);
      expect(checkRateLimit(key, config).allowed).toBe(true);
      expect(checkRateLimit(key, config).allowed).toBe(true);
      
      // Request 4 should be blocked
      const fourth = checkRateLimit(key, config);
      expect(fourth.allowed).toBe(false);
      expect(fourth.remaining).toBe(0);
    });

    it('should correctly report remaining count', async () => {
      const { checkRateLimit, resetRateLimit } = await import('./ratelimit.js');
      
      const key = 'edge-test-remaining';
      resetRateLimit(key);
      
      const config = { windowMs: 60000, maxRequests: 5 };
      
      expect(checkRateLimit(key, config).remaining).toBe(4); // After 1st
      expect(checkRateLimit(key, config).remaining).toBe(3); // After 2nd
      expect(checkRateLimit(key, config).remaining).toBe(2); // After 3rd
    });
  });

  describe('HTTP server - malformed requests', () => {
    let app: any;
    
    beforeAll(async () => {
      const { createServer } = await import('./server/index.js');
      app = createServer();
    });

    it('should handle request with no body', async () => {
      const res = await app.request('/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      expect(res.status).toBe(400);
    });

    it('should handle identifier with URL special chars', async () => {
      const { addContact, removeContact } = await import('./db/contacts.js');
      
      // Add a contact with special chars
      addContact('+44/test#id?', 'whatsapp', 'trusted');
      
      // Check via API
      const res = await app.request('/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '+44/test#id?' })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.allowed).toBe(true);
      
      removeContact('+44/test#id?', 'whatsapp');
    });

    it('should handle extremely nested JSON (DoS attempt)', async () => {
      // Create deeply nested object
      let nested: any = { a: 1 };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }
      
      const res = await app.request('/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nested)
      });
      
      // Should fail gracefully (missing identifier)
      expect(res.status).toBe(400);
    });
  });
});

describe('plugin - edge cases', () => {
  const TEST_DIR = join(tmpdir(), 'wasp-plugin-edge-' + process.pid + '-' + Date.now());
  
  const createMockApi = () => {
    const hooks: Record<string, Function[]> = {};
    const logs: { level: string; msg: string }[] = [];
    
    return {
      pluginConfig: {},
      logger: {
        info: (msg: string) => logs.push({ level: 'info', msg }),
        warn: (msg: string) => logs.push({ level: 'warn', msg }),
        error: (msg: string) => logs.push({ level: 'error', msg }),
        debug: (msg: string) => logs.push({ level: 'debug', msg }),
      },
      on: (hookName: string, handler: Function) => {
        if (!hooks[hookName]) hooks[hookName] = [];
        hooks[hookName].push(handler);
      },
      registerCommand: () => {},
      registerCli: () => {},
      _hooks: hooks,
      _logs: logs,
      _triggerHook: async (hookName: string, event: any, ctx: any) => {
        const handlers = hooks[hookName] || [];
        let result;
        for (const handler of handlers) {
          result = await handler(event, ctx);
        }
        return result;
      }
    };
  };

  beforeAll(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    process.env.WASP_DATA_DIR = TEST_DIR;
    
    const { initSchema, resetCache, reloadPaths } = await import('./db/client.js');
    resetCache();
    reloadPaths();
    initSchema();
  });

  afterAll(() => {
    delete process.env.WASP_DATA_DIR;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should handle missing senderId in message_received', async () => {
    const api = createMockApi();
    const { default: register } = await import('../plugin/index.js');
    register(api as any);
    
    // Event with no senderId anywhere
    await api._triggerHook('message_received', {
      from: '',
      content: 'hello',
      metadata: {}
    }, { channelId: 'whatsapp', sessionKey: 'edge-session' });
    
    // Should not crash, just log debug
    expect(api._logs.some(l => l.msg.includes('No senderId'))).toBe(true);
  });

  it('should handle missing toolName in before_tool_call', async () => {
    const api = createMockApi();
    const { default: register } = await import('../plugin/index.js');
    register(api as any);
    
    // Set up unknown sender state
    await api._triggerHook('message_received', {
      from: '+449999999999',
      content: 'test',
      metadata: { senderE164: '+449999999999' }
    }, { channelId: 'whatsapp', sessionKey: 'edge-session' });
    
    // Tool call with no name
    const result = await api._triggerHook('before_tool_call', {
      params: {}
    }, {});
    
    // Should not crash (toolName will be undefined)
    // Since undefined is not in dangerousTools, it should be allowed
    expect(result).toBeUndefined();
  });

  it('should handle rapid sequential messages from different senders', async () => {
    const { addContact } = await import('./db/contacts.js');
    addContact('+441111111111', 'whatsapp', 'sovereign');
    
    const api = createMockApi();
    const { default: register } = await import('../plugin/index.js');
    register(api as any);
    
    // Rapid messages
    await api._triggerHook('message_received', {
      metadata: { senderE164: '+441111111111' }
    }, { channelId: 'whatsapp', sessionKey: 'edge-session' });
    
    await api._triggerHook('message_received', {
      metadata: { senderE164: '+449999999999' }
    }, { channelId: 'whatsapp', sessionKey: 'edge-session' });
    
    // Last sender should be the untrusted one
    const result = await api._triggerHook('before_tool_call', {
      name: 'exec'
    }, {});
    
    // Should be blocked because last sender was untrusted
    expect(result?.block).toBe(true);
  });
});
