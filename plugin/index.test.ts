import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('plugin', () => {
  const TEST_DIR = join(tmpdir(), 'wasp-plugin-' + process.pid + '-' + Date.now());
  
  // Mock PluginApi
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
      // Test helpers
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

  it('should register hooks on initialization', async () => {
    const { initSchema, resetCache, reloadPaths } = await import('../src/db/client.js');
    resetCache();
    reloadPaths();
    initSchema();
    
    const api = createMockApi();
    const { default: register } = await import('./index.js');
    
    register(api as any);
    
    // Should register message_received and before_tool_call hooks
    expect(api._hooks['message_received']).toBeDefined();
    expect(api._hooks['message_received'].length).toBe(1);
    expect(api._hooks['before_tool_call']).toBeDefined();
    expect(api._hooks['before_tool_call'].length).toBe(1);
    expect(api._hooks['agent_end']).toBeDefined();
    
    // Should log initialization
    expect(api._logs.some(l => l.msg.includes('Database initialized'))).toBe(true);
    expect(api._logs.some(l => l.msg.includes('Plugin registered'))).toBe(true);
  });

  it('should allow sovereign contacts on message_received', async () => {
    const { addContact } = await import('../src/db/contacts.js');
    addContact('+441111111111', 'whatsapp', 'sovereign', 'Sovereign User');
    
    const api = createMockApi();
    const { default: register } = await import('./index.js');
    register(api as any);
    
    // Simulate message_received with sessionKey for isolation
    await api._triggerHook('message_received', {
      from: '+441111111111',
      content: 'Hello',
      metadata: { senderE164: '+441111111111' }
    }, { channelId: 'whatsapp', sessionKey: 'test-session-1' });
    
    // Should log as allowed
    expect(api._logs.some(l => l.msg.includes('ALLOWED') || l.level === 'debug')).toBe(true);
  });

  it('should audit deny for unknown contacts', async () => {
    const { getAuditLog } = await import('../src/db/audit.js');
    
    const api = createMockApi();
    const { default: register } = await import('./index.js');
    register(api as any);
    
    // Simulate message from unknown sender
    await api._triggerHook('message_received', {
      from: '+449999999999',
      content: 'Malicious message',
      metadata: { senderE164: '+449999999999' }
    }, { channelId: 'whatsapp', sessionKey: 'test-session' });
    
    // Should log as audit/denied
    expect(api._logs.some(l => l.msg.includes('AUDIT') || l.msg.includes('+449999999999'))).toBe(true);
    
    // Should be in audit log
    const entries = getAuditLog({ limit: 5 });
    const denyEntry = entries.find(e => e.identifier === '+449999999999');
    expect(denyEntry).toBeDefined();
    expect(denyEntry?.decision).toBe('deny');
  });

  it('should block dangerous tools for unknown senders', async () => {
    const api = createMockApi();
    const { default: register } = await import('./index.js');
    register(api as any);
    
    // First trigger message_received to set trust state
    await api._triggerHook('message_received', {
      from: '+448888888888',
      content: 'Try to exec',
      metadata: { senderE164: '+448888888888' }
    }, { channelId: 'whatsapp', sessionKey: 'test-session' });
    
    // Now try to call a dangerous tool
    const result = await api._triggerHook('before_tool_call', {
      name: 'exec',
      params: { command: 'rm -rf /' }
    }, { sessionKey: 'test-session' });
    
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain('blocked');
    expect(api._logs.some(l => l.msg.includes('BLOCKED tool exec'))).toBe(true);
  });

  it('should allow safe tools for unknown senders', async () => {
    const api = createMockApi();
    const { default: register } = await import('./index.js');
    register(api as any);
    
    // First trigger message_received
    await api._triggerHook('message_received', {
      from: '+447777777777',
      content: 'Search something',
      metadata: { senderE164: '+447777777777' }
    }, { channelId: 'whatsapp', sessionKey: 'test-session' });
    
    // Try a safe tool
    const result = await api._triggerHook('before_tool_call', {
      name: 'web_search',
      params: { query: 'weather' }
    }, { sessionKey: 'test-session' });
    
    // Should not block
    expect(result).toBeUndefined();
  });

  it('should allow all tools for sovereign users', async () => {
    const { addContact } = await import('../src/db/contacts.js');
    addContact('+442222222222', 'whatsapp', 'sovereign', 'Sovereign');
    
    const api = createMockApi();
    const { default: register } = await import('./index.js');
    register(api as any);
    
    // First trigger message_received for sovereign user
    await api._triggerHook('message_received', {
      from: '+442222222222',
      content: 'I am sovereign',
      metadata: { senderE164: '+442222222222' }
    }, { channelId: 'whatsapp', sessionKey: 'test-session' });
    
    // Sovereign should be able to use exec
    const result = await api._triggerHook('before_tool_call', {
      name: 'exec',
      params: { command: 'ls' }
    }, { sessionKey: 'test-session' });
    
    // Should not block
    expect(result).toBeUndefined();
  });

  it('should clear trust state on agent_end', async () => {
    const { addContact } = await import('../src/db/contacts.js');
    addContact('+443333333333', 'whatsapp', 'sovereign', 'Sovereign');
    
    const api = createMockApi();
    const { default: register } = await import('./index.js');
    register(api as any);
    
    // Set up trust state with a sovereign message
    await api._triggerHook('message_received', {
      from: '+443333333333',
      content: 'hello',
      metadata: { senderE164: '+443333333333' }
    }, { channelId: 'whatsapp', sessionKey: 'test-session' });
    
    // exec should be allowed for sovereign
    const beforeClear = await api._triggerHook('before_tool_call', {
      name: 'exec',
      params: {}
    }, { sessionKey: 'test-session' });
    expect(beforeClear).toBeUndefined(); // Allowed
    
    // Clear state
    await api._triggerHook('agent_end', {}, { sessionKey: 'test-session' });
    
    // After clear, trust is null (unknown), so exec should be blocked
    const afterClear = await api._triggerHook('before_tool_call', {
      name: 'exec',
      params: {}
    }, { sessionKey: 'test-session' });
    expect(afterClear).toBeDefined();
    expect(afterClear.block).toBe(true);
  });

  // ============================================
  // Signature Enforcement Tests
  // ============================================
  
  describe('signature enforcement (before_message_send)', () => {
    it('should register before_message_send hook', async () => {
      const api = createMockApi();
      const { default: register } = await import('./index.js');
      register(api as any);
      
      expect(api._hooks['before_message_send']).toBeDefined();
      expect(api._hooks['before_message_send'].length).toBe(1);
    });

    it('should auto-append signature when missing (default behavior)', async () => {
      const api = createMockApi();
      api.pluginConfig = {
        signatureEnforcement: {
          enabled: true,
          signature: '🔴',
          signaturePrefix: '— HAL ',
          action: 'append',
          channels: ['whatsapp'],
        }
      };
      const { default: register } = await import('./index.js');
      register(api as any);
      
      const result = await api._triggerHook('before_message_send', {
        content: 'Hello from HAL',
        channel: 'whatsapp',
        fromAgent: true,
      }, { channelId: 'whatsapp' });
      
      expect(result).toBeDefined();
      expect(result.modifiedContent).toContain('🔴');
      expect(result.modifiedContent).toContain('— HAL');
      expect(result.block).toBeFalsy();
    });

    it('should pass through when signature already present', async () => {
      const api = createMockApi();
      api.pluginConfig = {
        signatureEnforcement: {
          enabled: true,
          signature: '🔴',
          action: 'append',
          channels: ['whatsapp'],
        }
      };
      const { default: register } = await import('./index.js');
      register(api as any);
      
      const result = await api._triggerHook('before_message_send', {
        content: 'Hello from HAL 🔴',
        channel: 'whatsapp',
        fromAgent: true,
      }, { channelId: 'whatsapp' });
      
      // Should not modify - signature already present
      expect(result).toBeUndefined();
    });

    it('should block when action=block and signature missing', async () => {
      const api = createMockApi();
      api.pluginConfig = {
        signatureEnforcement: {
          enabled: true,
          signature: '🔴',
          action: 'block',
          channels: ['whatsapp'],
        }
      };
      const { default: register } = await import('./index.js');
      register(api as any);
      
      const result = await api._triggerHook('before_message_send', {
        content: 'Hello from HAL',
        channel: 'whatsapp',
        fromAgent: true,
      }, { channelId: 'whatsapp' });
      
      expect(result).toBeDefined();
      expect(result.block).toBe(true);
      expect(result.blockReason).toContain('missing signature');
    });

    it('should skip non-enforced channels', async () => {
      const api = createMockApi();
      api.pluginConfig = {
        signatureEnforcement: {
          enabled: true,
          signature: '🔴',
          action: 'block',
          channels: ['whatsapp'],
        }
      };
      const { default: register } = await import('./index.js');
      register(api as any);
      
      // Discord not in channels list
      const result = await api._triggerHook('before_message_send', {
        content: 'Hello from HAL',
        channel: 'discord',
        fromAgent: true,
      }, { channelId: 'discord' });
      
      // Should not block - channel not enforced
      expect(result).toBeUndefined();
    });

    it('should skip when fromAgent is false', async () => {
      const api = createMockApi();
      api.pluginConfig = {
        signatureEnforcement: {
          enabled: true,
          signature: '🔴',
          action: 'block',
          channels: ['whatsapp'],
        }
      };
      const { default: register } = await import('./index.js');
      register(api as any);
      
      // Not from agent - forwarding user content
      const result = await api._triggerHook('before_message_send', {
        content: 'User said: hello',
        channel: 'whatsapp',
        fromAgent: false,
      }, { channelId: 'whatsapp' });
      
      // Should not block/modify - not from agent
      expect(result).toBeUndefined();
    });

    it('should skip when enforcement disabled', async () => {
      const api = createMockApi();
      api.pluginConfig = {
        signatureEnforcement: {
          enabled: false,
          signature: '🔴',
          action: 'block',
          channels: ['whatsapp'],
        }
      };
      const { default: register } = await import('./index.js');
      register(api as any);
      
      const result = await api._triggerHook('before_message_send', {
        content: 'Hello from HAL',
        channel: 'whatsapp',
        fromAgent: true,
      }, { channelId: 'whatsapp' });
      
      // Should not block - enforcement disabled
      expect(result).toBeUndefined();
    });

    it('should use custom signature from config', async () => {
      const api = createMockApi();
      api.pluginConfig = {
        signatureEnforcement: {
          enabled: true,
          signature: '⬤',
          action: 'append',
          channels: ['whatsapp'],
        }
      };
      const { default: register } = await import('./index.js');
      register(api as any);
      
      // Has custom signature
      const resultWithSig = await api._triggerHook('before_message_send', {
        content: 'Hello ⬤',
        channel: 'whatsapp',
        fromAgent: true,
      }, { channelId: 'whatsapp' });
      
      expect(resultWithSig).toBeUndefined(); // Already has signature
      
      // Missing custom signature
      const resultNoSig = await api._triggerHook('before_message_send', {
        content: 'Hello',
        channel: 'whatsapp',
        fromAgent: true,
      }, { channelId: 'whatsapp' });
      
      expect(resultNoSig?.modifiedContent).toContain('⬤');
    });
  });
});
