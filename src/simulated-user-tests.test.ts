/**
 * Simulated User Tests
 *
 * These tests simulate real-world user scenarios to verify
 * all trust level × tool combinations work as expected.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Simulated User Scenarios', () => {
  const TEST_DIR = join(tmpdir(), `wasp-sim-${process.pid}-${Date.now()}`);
  let api: any;
  let triggerMessage: (senderId: string, platform?: string) => Promise<void>;
  let triggerTool: (toolName: string) => Promise<any>;

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
      _clearLogs: () => {
        logs.length = 0;
      },
      _triggerHook: async (hookName: string, event: any, ctx: any) => {
        const handlers = hooks[hookName] || [];
        let result: unknown;
        for (const handler of handlers) {
          result = await handler(event, ctx);
        }
        return result;
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

    // Set up test contacts
    const { addContact } = await import('./db/contacts.js');
    addContact('+44-sovereign', 'whatsapp', 'sovereign', 'The Owner');
    addContact('+44-trusted', 'whatsapp', 'trusted', 'Trusted Friend');
    addContact('+44-limited', 'whatsapp', 'limited', 'Limited User');
    // No entry for '+44-unknown' - they're unknown

    // Initialize plugin
    api = createMockApi();
    const { default: register } = await import('../plugin/index.js');
    register(api as any);

    // Helper functions
    triggerMessage = async (senderId: string, platform = 'whatsapp') => {
      await api._triggerHook(
        'message_received',
        {
          from: senderId,
          content: 'test message',
          metadata: { senderE164: senderId },
        },
        { channelId: platform, sessionKey: 'sim-session' }
      );
    };

    triggerTool = async (toolName: string) => {
      return await api._triggerHook(
        'before_tool_call',
        {
          name: toolName,
          params: {},
        },
        { sessionKey: 'sim-session' }
      );
    };
  });

  afterAll(() => {
    delete process.env.WASP_DATA_DIR;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // Reset state between tests
  const resetState = async () => {
    await api._triggerHook('agent_end', {}, { sessionKey: 'sim-session' });
    api._clearLogs();
  };

  describe('Scenario: Sovereign User (The Owner)', () => {
    beforeAll(async () => {
      await resetState();
      await triggerMessage('+44-sovereign');
    });

    it('can use exec', async () => {
      const result = await triggerTool('exec');
      expect(result).toBeUndefined(); // Not blocked
    });

    it('can use write', async () => {
      const result = await triggerTool('write');
      expect(result).toBeUndefined();
    });

    it('can use message', async () => {
      const result = await triggerTool('message');
      expect(result).toBeUndefined();
    });

    it('can use gateway', async () => {
      const result = await triggerTool('gateway');
      expect(result).toBeUndefined();
    });

    it('can use web_search', async () => {
      const result = await triggerTool('web_search');
      expect(result).toBeUndefined();
    });

    it('can use any unlisted tool', async () => {
      const result = await triggerTool('some_new_fancy_tool');
      expect(result).toBeUndefined();
    });
  });

  describe('Scenario: Trusted User (Verified Contact)', () => {
    beforeAll(async () => {
      await resetState();
      await triggerMessage('+44-trusted');
    });

    it('can use exec', async () => {
      const result = await triggerTool('exec');
      expect(result).toBeUndefined();
    });

    it('can use write', async () => {
      const result = await triggerTool('write');
      expect(result).toBeUndefined();
    });

    it('can use all dangerous tools', async () => {
      for (const tool of ['exec', 'write', 'Write', 'Edit', 'message', 'gateway']) {
        const result = await triggerTool(tool);
        expect(result).toBeUndefined();
      }
    });
  });

  describe('Scenario: Limited User (Partially Trusted)', () => {
    beforeAll(async () => {
      await resetState();
      await triggerMessage('+44-limited');
    });

    it('CANNOT use exec', async () => {
      const result = await triggerTool('exec');
      expect(result?.block).toBe(true);
      expect(result?.blockReason).toContain('blocked');
    });

    it('CANNOT use write', async () => {
      const result = await triggerTool('write');
      expect(result?.block).toBe(true);
    });

    it('CANNOT use any dangerous tool', async () => {
      for (const tool of ['exec', 'write', 'Write', 'Edit', 'message', 'gateway']) {
        await resetState();
        await triggerMessage('+44-limited');
        const result = await triggerTool(tool);
        expect(result?.block).toBe(true);
      }
    });

    it('CAN use web_search', async () => {
      await resetState();
      await triggerMessage('+44-limited');
      const result = await triggerTool('web_search');
      expect(result).toBeUndefined();
    });

    it('CAN use memory_search', async () => {
      await resetState();
      await triggerMessage('+44-limited');
      const result = await triggerTool('memory_search');
      expect(result).toBeUndefined();
    });

    it('CAN use Read', async () => {
      await resetState();
      await triggerMessage('+44-limited');
      const result = await triggerTool('Read');
      expect(result).toBeUndefined();
    });

    it('CAN use unlisted tools', async () => {
      await resetState();
      await triggerMessage('+44-limited');
      const result = await triggerTool('custom_harmless_tool');
      expect(result).toBeUndefined();
    });
  });

  describe('Scenario: Unknown User (Not in Whitelist)', () => {
    beforeAll(async () => {
      await resetState();
      await triggerMessage('+44-unknown');
    });

    it('CANNOT use exec', async () => {
      const result = await triggerTool('exec');
      expect(result?.block).toBe(true);
    });

    it('CANNOT use write', async () => {
      const result = await triggerTool('write');
      expect(result?.block).toBe(true);
    });

    it('CANNOT use any dangerous tool', async () => {
      for (const tool of ['exec', 'write', 'Write', 'Edit', 'message', 'gateway']) {
        await resetState();
        await triggerMessage('+44-unknown');
        const result = await triggerTool(tool);
        expect(result?.block).toBe(true);
      }
    });

    it('CAN use safe tools', async () => {
      for (const tool of ['web_search', 'memory_search', 'Read', 'session_status']) {
        await resetState();
        await triggerMessage('+44-unknown');
        const result = await triggerTool(tool);
        expect(result).toBeUndefined();
      }
    });
  });

  describe('Scenario: No Message Context (Fresh State)', () => {
    beforeAll(async () => {
      await resetState();
      // Don't send a message - trust is null
    });

    it('should block dangerous tools when no context', async () => {
      const result = await triggerTool('exec');
      expect(result?.block).toBe(true);
    });

    it('should allow safe tools when no context', async () => {
      const result = await triggerTool('web_search');
      expect(result).toBeUndefined();
    });
  });

  describe('Scenario: Cross-Platform Trust', () => {
    beforeAll(async () => {
      const { addContact } = await import('./db/contacts.js');
      // Same person, different trust on different platforms
      addContact('+44-cross', 'whatsapp', 'sovereign');
      addContact('+44-cross', 'telegram', 'limited');
    });

    it('sovereign on WhatsApp can use exec', async () => {
      await resetState();
      await triggerMessage('+44-cross', 'whatsapp');
      const result = await triggerTool('exec');
      expect(result).toBeUndefined();
    });

    it('same person limited on Telegram CANNOT use exec', async () => {
      await resetState();
      await triggerMessage('+44-cross', 'telegram');
      const result = await triggerTool('exec');
      expect(result?.block).toBe(true);
    });
  });

  describe('Scenario: Trust Escalation Attempt', () => {
    it('unknown user cannot gain trust mid-conversation', async () => {
      await resetState();

      // Unknown user sends message
      await triggerMessage('+44-attacker');

      // Try dangerous tool - should be blocked
      let result = await triggerTool('exec');
      expect(result?.block).toBe(true);

      // Attacker cannot magically become trusted
      // (trust is set by message_received, not by the agent)
      result = await triggerTool('exec');
      expect(result?.block).toBe(true);
    });
  });

  describe('Scenario: Rapid Message Switching', () => {
    it('last message sender determines trust', async () => {
      await resetState();

      // Sovereign sends message
      await triggerMessage('+44-sovereign');
      let result = await triggerTool('exec');
      expect(result).toBeUndefined(); // Allowed

      // Unknown immediately sends message
      await triggerMessage('+44-attacker');
      result = await triggerTool('exec');
      expect(result?.block).toBe(true); // Blocked!

      // Sovereign sends again
      await triggerMessage('+44-sovereign');
      result = await triggerTool('exec');
      expect(result).toBeUndefined(); // Allowed again
    });
  });

  describe('Scenario: Session End Reset', () => {
    it('trust resets after agent_end', async () => {
      await resetState();

      // Sovereign establishes trust
      await triggerMessage('+44-sovereign');
      let result = await triggerTool('exec');
      expect(result).toBeUndefined();

      // Session ends
      await api._triggerHook('agent_end', {}, { sessionKey: 'sim-session' });

      // No message context - dangerous tools blocked
      result = await triggerTool('exec');
      expect(result?.block).toBe(true);
    });
  });

  describe('Scenario: Concurrent Session Isolation', () => {
    it('different sessions have isolated trust states', async () => {
      // Session A: Sovereign user
      await api._triggerHook(
        'message_received',
        {
          from: '+44-sovereign',
          content: 'Session A message',
          metadata: { senderE164: '+44-sovereign' },
        },
        { channelId: 'whatsapp', sessionKey: 'session-A' }
      );

      // Session B: Unknown user (concurrent)
      await api._triggerHook(
        'message_received',
        {
          from: '+44-unknown',
          content: 'Session B message',
          metadata: { senderE164: '+44-unknown' },
        },
        { channelId: 'whatsapp', sessionKey: 'session-B' }
      );

      // Session A tool call should use Session A's trust (sovereign)
      const resultA = await api._triggerHook(
        'before_tool_call',
        {
          name: 'exec',
        },
        { sessionKey: 'session-A' }
      );
      expect(resultA).toBeUndefined(); // Allowed for sovereign

      // Session B tool call should use Session B's trust (unknown)
      const resultB = await api._triggerHook(
        'before_tool_call',
        {
          name: 'exec',
        },
        { sessionKey: 'session-B' }
      );
      expect(resultB?.block).toBe(true); // Blocked for unknown

      // Verify isolation: Session B didn't affect Session A
      const resultA2 = await api._triggerHook(
        'before_tool_call',
        {
          name: 'exec',
        },
        { sessionKey: 'session-A' }
      );
      expect(resultA2).toBeUndefined(); // Still allowed
    });

    it('session state cleanup does not affect other sessions', async () => {
      // Session C: Trusted user
      await api._triggerHook(
        'message_received',
        {
          from: '+44-trusted',
          content: 'Session C',
          metadata: { senderE164: '+44-trusted' },
        },
        { channelId: 'whatsapp', sessionKey: 'session-C' }
      );

      // Session D: Sovereign user
      await api._triggerHook(
        'message_received',
        {
          from: '+44-sovereign',
          content: 'Session D',
          metadata: { senderE164: '+44-sovereign' },
        },
        { channelId: 'whatsapp', sessionKey: 'session-D' }
      );

      // End Session C
      await api._triggerHook('agent_end', {}, { sessionKey: 'session-C' });

      // Session D should still work (isolated)
      const resultD = await api._triggerHook(
        'before_tool_call',
        {
          name: 'exec',
        },
        { sessionKey: 'session-D' }
      );
      expect(resultD).toBeUndefined(); // Still allowed

      // Session C is now cleared (unknown state)
      const resultC = await api._triggerHook(
        'before_tool_call',
        {
          name: 'exec',
        },
        { sessionKey: 'session-C' }
      );
      expect(resultC?.block).toBe(true); // Blocked after cleanup
    });
  });
});
