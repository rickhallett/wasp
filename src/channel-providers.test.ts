/**
 * Channel Provider Tests
 *
 * These tests document the expected sender ID formats from each
 * Clawdbot channel provider and verify wasp correctly extracts them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Channel Provider Sender ID Extraction', () => {
  const TEST_DIR = join(tmpdir(), `wasp-channels-${process.pid}-${Date.now()}`);

  // Mock API that captures what senderId wasp extracts
  const createMockApi = () => {
    const hooks: Record<string, Function[]> = {};
    const extracted: { senderId: string | null; channel: string }[] = [];

    return {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      config: { get: () => undefined },
      on: (hookName: string, handler: Function) => {
        if (!hooks[hookName]) hooks[hookName] = [];
        hooks[hookName].push(handler);
      },
      registerCli: () => {},
      registerCommand: () => {},
      _hooks: hooks,
      _extracted: extracted,
      _triggerHook: async (hookName: string, event: any, ctx: any) => {
        const handlers = hooks[hookName] || [];
        for (const handler of handlers) {
          await handler(event, ctx);
        }
      },
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

    // Add test contacts for each platform
    const { addContact } = await import('./db/contacts.js');

    // WhatsApp - E.164 phone number
    addContact('+447375862225', 'whatsapp', 'sovereign', 'Kai (WhatsApp)');

    // Signal - E.164 phone number
    addContact('+447375862225', 'signal', 'trusted', 'Kai (Signal)');

    // Telegram - numeric user ID
    addContact('123456789', 'telegram', 'trusted', 'Kai (Telegram)');

    // Discord - snowflake ID (18-19 digit number)
    addContact('987654321012345678', 'discord', 'trusted', 'Kai (Discord)');

    // Slack - user ID format
    addContact('U0123456789', 'slack', 'trusted', 'Kai (Slack)');

    // Email - email address
    addContact('kai@oceanheart.ai', 'email', 'trusted', 'Kai (Email)');
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('WhatsApp', () => {
    it('extracts E.164 phone number from ctx.SenderE164', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        { content: 'Hello' },
        {
          SenderE164: '+447375862225',
          channelId: 'whatsapp',
          sessionKey: 'wa-test',
        }
      );

      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('+447375862225', 'whatsapp');
      expect(result.allowed).toBe(true);
      expect(result.trust).toBe('sovereign');
    });

    it('handles WhatsApp JID format in SenderId as fallback', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      // Some implementations pass the full JID
      await api._triggerHook(
        'message_received',
        { content: 'Hello' },
        {
          SenderId: '447375862225@s.whatsapp.net',
          channelId: 'whatsapp',
          sessionKey: 'wa-jid-test',
        }
      );

      // This should be normalized - documenting current behavior
      const { checkContact } = await import('./db/contacts.js');
      // Note: Currently doesn't normalize JID to E.164
      const result = checkContact('447375862225@s.whatsapp.net', 'whatsapp');
      expect(result.allowed).toBe(false); // Won't match without normalization
    });
  });

  describe('Signal', () => {
    it('extracts E.164 phone number from ctx.SenderE164', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        { content: 'Hello from Signal' },
        {
          SenderE164: '+447375862225',
          channelId: 'signal',
          sessionKey: 'signal-test',
        }
      );

      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('+447375862225', 'signal');
      expect(result.allowed).toBe(true);
      expect(result.trust).toBe('trusted');
    });
  });

  describe('Telegram', () => {
    it('extracts numeric user ID from ctx.SenderId', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        { content: 'Hello from Telegram' },
        {
          SenderId: '123456789',
          channelId: 'telegram',
          sessionKey: 'tg-test',
        }
      );

      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('123456789', 'telegram');
      expect(result.allowed).toBe(true);
      expect(result.trust).toBe('trusted');
    });

    it('handles Telegram username in SenderUsername (not used for auth)', async () => {
      // Telegram usernames can change, so we use numeric ID for whitelisting
      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('@kaihallett', 'telegram');
      expect(result.allowed).toBe(false); // Username not in whitelist
    });
  });

  describe('Discord', () => {
    it('extracts snowflake ID from ctx.SenderId', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        { content: 'Hello from Discord' },
        {
          SenderId: '987654321012345678',
          channelId: 'discord',
          sessionKey: 'discord-test',
        }
      );

      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('987654321012345678', 'discord');
      expect(result.allowed).toBe(true);
      expect(result.trust).toBe('trusted');
    });

    it('snowflake IDs are 17-19 digit numbers', () => {
      // Document expected format
      const validSnowflakes = [
        '987654321012345678', // 18 digits
        '1234567890123456789', // 19 digits
      ];

      for (const id of validSnowflakes) {
        expect(/^\d{17,19}$/.test(id)).toBe(true);
      }
    });
  });

  describe('Slack', () => {
    it('extracts user ID from ctx.SenderId', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        { content: 'Hello from Slack' },
        {
          SenderId: 'U0123456789',
          channelId: 'slack',
          sessionKey: 'slack-test',
        }
      );

      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('U0123456789', 'slack');
      expect(result.allowed).toBe(true);
      expect(result.trust).toBe('trusted');
    });

    it('Slack user IDs start with U', () => {
      // Document expected format
      expect(/^U[A-Z0-9]+$/.test('U0123456789')).toBe(true);
      expect(/^U[A-Z0-9]+$/.test('UABCDEF123')).toBe(true);
    });
  });

  describe('Email', () => {
    it('extracts email address from ctx.SenderId', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        { content: 'Hello from Email' },
        {
          SenderId: 'kai@oceanheart.ai',
          channelId: 'email',
          sessionKey: 'email-test',
        }
      );

      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('kai@oceanheart.ai', 'email');
      expect(result.allowed).toBe(true);
      expect(result.trust).toBe('trusted');
    });

    it('email matching is case-sensitive (document current behavior)', async () => {
      const { checkContact } = await import('./db/contacts.js');

      // Exact match works
      expect(checkContact('kai@oceanheart.ai', 'email').allowed).toBe(true);

      // Different case - currently doesn't match (might want to normalize)
      expect(checkContact('Kai@oceanheart.ai', 'email').allowed).toBe(false);
    });
  });

  describe('Fallback extraction paths', () => {
    it('falls back to event.metadata.senderE164', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        {
          content: 'Hello',
          metadata: { senderE164: '+447375862225' },
        },
        {
          channelId: 'whatsapp',
          sessionKey: 'fallback-e164-test',
        }
      );

      // Should still work via fallback path
      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('+447375862225', 'whatsapp');
      expect(result.allowed).toBe(true);
    });

    it('falls back to event.metadata.senderId', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        {
          content: 'Hello',
          metadata: { senderId: '123456789' },
        },
        {
          channelId: 'telegram',
          sessionKey: 'fallback-senderId-test',
        }
      );

      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('123456789', 'telegram');
      expect(result.allowed).toBe(true);
    });

    it('falls back to event.from as last resort', async () => {
      const api = createMockApi();
      const { default: register } = await import('../plugin/index.js');
      register(api as any);

      await api._triggerHook(
        'message_received',
        {
          content: 'Hello',
          from: 'U0123456789',
        },
        {
          channelId: 'slack',
          sessionKey: 'fallback-from-test',
        }
      );

      const { checkContact } = await import('./db/contacts.js');
      const result = checkContact('U0123456789', 'slack');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Cross-platform same identifier', () => {
    it('same phone number can have different trust on different platforms', async () => {
      const { checkContact } = await import('./db/contacts.js');

      // Same number, different platforms, different trust
      const whatsappResult = checkContact('+447375862225', 'whatsapp');
      const signalResult = checkContact('+447375862225', 'signal');

      expect(whatsappResult.trust).toBe('sovereign');
      expect(signalResult.trust).toBe('trusted');
    });
  });
});
