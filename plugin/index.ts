/**
 * wasp - Moltbot Plugin
 * 
 * Security whitelist layer that filters inbound messages
 * and controls tool access based on sender trust levels.
 */

import { checkContact, addContact, listContacts, removeContact } from '../src/db/contacts.js';
import { initSchema, setDataDir } from '../src/db/client.js';
import { logDecision, getAuditLog } from '../src/db/audit.js';
import { quarantineMessage, getQuarantined, releaseQuarantined } from '../src/db/quarantine.js';
import { logger } from '../src/logger.js';
import { checkSignature, validateSignatureConfig, validateSignatureConfigAtStartup, type SignatureConfig } from '../src/signature.js';
import type { Platform, TrustLevel } from '../src/types.js';

interface WaspConfig {
  dataDir?: string;
  defaultAction?: 'block' | 'quarantine' | 'limited';
  notifySovereign?: boolean;
  dangerousTools?: string[];
  safeTools?: string[];
  /** Signature enforcement for outbound messages */
  signatureEnforcement?: {
    enabled: boolean;
    signature?: string;        // REQUIRED if enabled, no default
    signaturePrefix?: string;  // e.g., "— HAL " (prepended to signature)
    action?: 'block' | 'append';
    channels?: string[];       // default ['whatsapp']
  };
}

interface PluginApi {
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  config: {
    get: (path: string) => any;
  };
  on: (event: string, handler: (event: any, ctx?: any) => Promise<any> | any) => void;
  registerCli: (fn: (ctx: { program: any }) => void, opts?: { commands: string[] }) => void;
  registerCommand: (cmd: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: any) => Promise<{ text: string }> | { text: string };
  }) => void;
}

// Session-keyed state for concurrent safety
// Maps sessionKey -> { trust, sender } for the current turn
interface TurnState {
  trust: TrustLevel | null;
  sender: string | null;
}
const sessionState = new Map<string, TurnState>();

// Get or create session state
function getSessionState(sessionKey: string): TurnState {
  if (!sessionState.has(sessionKey)) {
    sessionState.set(sessionKey, { trust: null, sender: null });
  }
  return sessionState.get(sessionKey)!;
}

// Clear session state
function clearSessionState(sessionKey: string): void {
  sessionState.delete(sessionKey);
}

// Fallback session key when context doesn't provide one
const DEFAULT_SESSION = '__default__';

export default function register(api: PluginApi) {
  // pluginConfig is our plugin's config from plugins.entries.wasp.config
  const config: WaspConfig = (api as any).pluginConfig || {};
  
  // Set custom data dir if configured (without mutating process.env)
  if (config.dataDir) {
    setDataDir(config.dataDir);
  }
  
  // Initialize database
  try {
    initSchema();
    api.logger.info('[wasp] Database initialized');
  } catch (err) {
    api.logger.error(`[wasp] Failed to initialize database: ${err}`);
  }

  // Validate signature enforcement config at startup
  // Throws if enabled but no signature configured
  if (config.signatureEnforcement) {
    try {
      validateSignatureConfigAtStartup(config.signatureEnforcement);
      if (config.signatureEnforcement.enabled) {
        api.logger.info(`[wasp] Signature enforcement enabled (${config.signatureEnforcement.signature})`);
      }
    } catch (err) {
      api.logger.error(`[wasp] ${err}`);
      throw err; // Fail fast on misconfiguration
    }
  }

  const defaultAction = config.defaultAction || 'block';
  const dangerousTools = config.dangerousTools || ['exec', 'write', 'message', 'gateway', 'Edit', 'Write'];
  const safeTools = config.safeTools || ['web_search', 'memory_search', 'Read', 'session_status'];

  // ============================================
  // Hook: message_received
  // Audit incoming messages (can't block - void hook)
  // ============================================
  api.on('message_received', async (event: any, ctx: any) => {
    // Sender ID extraction - try multiple sources for cross-channel compatibility:
    // - ctx.SenderE164: Phone number (WhatsApp, Signal)
    // - ctx.SenderId: Platform-specific ID (Telegram user ID, Discord snowflake, Slack user ID)
    // - event.metadata.senderE164 / senderId: Legacy/alternative paths
    // - event.from: Fallback
    const senderId =
      ctx?.SenderE164 ||
      ctx?.SenderId ||
      event.metadata?.senderE164 ||
      event.metadata?.senderId ||
      event.from;
    const channel = (ctx?.channelId || ctx?.ChannelId || 'whatsapp') as Platform;
    
    // Get session key from context for concurrent safety
    const sessionKey = ctx?.sessionKey || ctx?.conversationId || DEFAULT_SESSION;
    
    if (!senderId) {
      api.logger.debug('[wasp] No senderId in message');
      logger.plugin('message_received', { error: 'no senderId' });
      return;
    }

    logger.plugin('message_received', { senderId, channel, sessionKey });
    const result = checkContact(senderId, channel);
    
    // Log the decision
    const decision = !result.allowed ? 'deny' : result.trust === 'limited' ? 'limited' : 'allow';
    logDecision(senderId, channel, decision, result.reason);

    if (!result.allowed) {
      api.logger.info(`[wasp] AUDIT: ${senderId} (${channel}) - ${result.reason}`);
      logger.block(senderId, result.reason);
      
      if (defaultAction === 'quarantine') {
        const messageText = event.content || '';
        quarantineMessage(senderId, channel, messageText);
        api.logger.info(`[wasp] Message quarantined for review`);
      }
      // Note: Can't actually block here - message_received is fire-and-forget
    } else if (result.trust === 'limited') {
      api.logger.info(`[wasp] LIMITED: ${senderId} - tools will be restricted`);
    } else {
      api.logger.debug(`[wasp] ALLOWED: ${senderId} (${result.trust})`);
    }

    // Store trust level in session-keyed state for tool interception
    const state = getSessionState(sessionKey);
    state.trust = result.trust;
    state.sender = senderId;
  });

  // ============================================
  // Hook: before_tool_call
  // Intercept tool calls for limited/untrusted senders
  // Returns { block: true, blockReason: "..." } to block
  // ============================================
  api.on('before_tool_call', async (event: any, ctx: any) => {
    const toolName = event.name || event.toolName;
    
    // Get session key from context for concurrent safety
    const sessionKey = ctx?.sessionKey || ctx?.conversationId || DEFAULT_SESSION;
    const state = getSessionState(sessionKey);
    const trust = state.trust;
    const sender = state.sender;
    
    // Allow all tools for trusted/sovereign
    if (trust === 'trusted' || trust === 'sovereign') {
      return undefined; // Don't modify
    }

    // For limited trust OR unknown (null) senders - restrict dangerous tools
    // Allow safe tools
    if (safeTools.includes(toolName)) {
      api.logger.debug(`[wasp] Tool ${toolName} allowed (safe list)`);
      logger.tool(toolName, 'allow', { reason: 'safe list', sender, trust });
      return undefined;
    }

    // Block dangerous tools
    if (dangerousTools.includes(toolName)) {
      api.logger.warn(`[wasp] BLOCKED tool ${toolName} for sender ${sender} (trust: ${trust || 'unknown'})`);
      logger.tool(toolName, 'block', { reason: 'dangerous tool', sender, trust });
      return { 
        block: true, 
        blockReason: `wasp: tool ${toolName} blocked for untrusted sender` 
      };
    }

    // Default: allow unknown tools (not in either list)
    api.logger.debug(`[wasp] Tool ${toolName} allowed (not in dangerous list)`);
    logger.tool(toolName, 'allow', { reason: 'not in dangerous list', sender, trust });
    return undefined;
  });

  // ============================================
  // Hook: before_message_send
  // Enforce HAL signature on outbound messages
  // Returns { block: true, blockReason: "..." } to block
  // Returns { modifiedContent: "..." } to modify the message
  // ============================================
  api.on('before_message_send', async (event: any, ctx: any) => {
    // Get signature config (with defaults)
    const sigConfig = config.signatureEnforcement;
    
    // Validate config if provided
    if (sigConfig && !validateSignatureConfig(sigConfig)) {
      api.logger.warn('[wasp] Invalid signatureEnforcement config, using defaults');
    }
    
    // Determine channel from context or event
    const channel = ctx?.channelId || ctx?.ChannelId || event.channel || 'whatsapp';
    
    // Check signature
    const result = checkSignature(
      {
        content: event.content || event.message || '',
        channel,
        fromAgent: event.fromAgent !== false, // Default to true if not specified
        target: event.target,
        metadata: event.metadata,
      },
      sigConfig
    );
    
    // Handle block
    if (result.block) {
      api.logger.warn(`[wasp] BLOCKED message send: ${result.blockReason}`);
      logger.plugin('before_message_send', { 
        action: 'block', 
        channel, 
        reason: 'missing signature' 
      });
      return {
        block: true,
        blockReason: result.blockReason,
      };
    }
    
    // Handle append
    if (result.signatureAppended && result.modifiedContent) {
      api.logger.info(`[wasp] Auto-appended HAL signature to ${channel} message`);
      logger.plugin('before_message_send', { 
        action: 'append', 
        channel 
      });
      return {
        modifiedContent: result.modifiedContent,
      };
    }
    
    // Signature was already present or enforcement not applicable
    if (result.signaturePresent) {
      logger.plugin('before_message_send', { 
        action: 'pass', 
        channel, 
        signaturePresent: true 
      });
    }
    
    return undefined; // No modification needed
  });

  // ============================================
  // Hook: agent_end
  // Clear turn state for the session
  // ============================================
  api.on('agent_end', async (event: any, ctx: any) => {
    const sessionKey = ctx?.sessionKey || ctx?.conversationId || DEFAULT_SESSION;
    clearSessionState(sessionKey);
  });

  // ============================================
  // Auto-reply commands (no LLM invocation)
  // ============================================
  
  // /wasp status
  api.registerCommand({
    name: 'wasp',
    description: 'Show wasp security status',
    requireAuth: true,
    handler: () => {
      const contacts = listContacts();
      const sovereign = contacts.filter(c => c.trust === 'sovereign').length;
      const trusted = contacts.filter(c => c.trust === 'trusted').length;
      const limited = contacts.filter(c => c.trust === 'limited').length;
      
      return {
        text: `🐝 wasp security active\n\nContacts: ${contacts.length}\n• Sovereign: ${sovereign}\n• Trusted: ${trusted}\n• Limited: ${limited}\n\nDefault action: ${defaultAction}`
      };
    }
  });

  // /wasp-review (show quarantined messages)
  api.registerCommand({
    name: 'wasp-review',
    description: 'Show quarantined messages awaiting review',
    requireAuth: true,
    handler: () => {
      const quarantined = getQuarantined(10);
      
      if (quarantined.length === 0) {
        return { text: '🐝 No messages in quarantine' };
      }

      const lines = quarantined.map((q, i) => 
        `${i + 1}. ${q.identifier} (${q.platform})\n   "${q.messagePreview}"\n   ${q.timestamp}`
      );

      return {
        text: `🐝 Quarantined messages:\n\n${lines.join('\n\n')}\n\nUse CLI: wasp review --approve <id>`
      };
    }
  });

  // ============================================
  // CLI commands
  // ============================================
  api.registerCli(({ program }) => {
    const wasp = program
      .command('wasp')
      .description('wasp security whitelist management');

    wasp
      .command('status')
      .description('Show wasp status')
      .action(() => {
        const contacts = listContacts();
        console.log(`\n🐝 wasp security layer\n`);
        console.log(`Contacts: ${contacts.length}`);
        console.log(`  Sovereign: ${contacts.filter(c => c.trust === 'sovereign').length}`);
        console.log(`  Trusted: ${contacts.filter(c => c.trust === 'trusted').length}`);
        console.log(`  Limited: ${contacts.filter(c => c.trust === 'limited').length}`);
        console.log(`\nDefault action: ${defaultAction}\n`);
      });

    wasp
      .command('add <identifier>')
      .description('Add a contact to whitelist')
      .option('-p, --platform <platform>', 'Platform', 'whatsapp')
      .option('-t, --trust <level>', 'Trust level', 'trusted')
      .option('-n, --name <name>', 'Contact name')
      .action((identifier: string, opts: { platform: string; trust: string; name?: string }) => {
        const contact = addContact(identifier, opts.platform as Platform, opts.trust as TrustLevel, opts.name);
        console.log(`Added: ${contact.identifier} (${contact.trust})`);
      });

    wasp
      .command('remove <identifier>')
      .description('Remove a contact')
      .option('-p, --platform <platform>', 'Platform', 'whatsapp')
      .action((identifier: string, opts: { platform: string }) => {
        if (removeContact(identifier, opts.platform as Platform)) {
          console.log(`Removed: ${identifier}`);
        } else {
          console.log(`Not found: ${identifier}`);
        }
      });

    wasp
      .command('list')
      .description('List all contacts')
      .option('-t, --trust <level>', 'Filter by trust level')
      .action((opts: { trust?: string }) => {
        const contacts = listContacts(undefined, opts.trust as TrustLevel | undefined);
        if (contacts.length === 0) {
          console.log('No contacts found.');
          return;
        }
        console.log(`\n${contacts.length} contact(s):\n`);
        for (const c of contacts) {
          console.log(`  ${c.identifier} ${c.name ? `(${c.name})` : ''}`);
          console.log(`    ${c.platform} | ${c.trust}`);
        }
        console.log('');
      });

    wasp
      .command('audit')
      .description('View audit log')
      .option('-l, --limit <n>', 'Number of entries', '20')
      .option('-d, --denied', 'Show only denied')
      .action((opts: { limit: string; denied?: boolean }) => {
        const entries = getAuditLog({
          limit: parseInt(opts.limit),
          decision: opts.denied ? 'deny' : undefined
        });
        if (entries.length === 0) {
          console.log('No audit entries.');
          return;
        }
        console.log(`\nLast ${entries.length} entries:\n`);
        for (const e of entries) {
          const icon = e.decision === 'allow' ? '✓' : e.decision === 'limited' ? '~' : '✗';
          console.log(`  ${icon} ${e.timestamp} ${e.identifier}`);
          console.log(`    ${e.decision}: ${e.reason}`);
        }
        console.log('');
      });

    wasp
      .command('review')
      .description('Review quarantined messages')
      .option('--approve <id>', 'Approve sender and release messages')
      .option('--deny <id>', 'Permanently block sender')
      .action(async (opts: { approve?: string; deny?: string }) => {
        if (opts.approve) {
          // Add to trusted and release messages
          const released = releaseQuarantined(opts.approve);
          if (released.length > 0) {
            addContact(released[0]?.identifier, released[0]?.platform, 'trusted');
            console.log(`Approved ${released[0]?.identifier}, released ${released.length} message(s)`);
          } else {
            console.log(`No quarantined messages for: ${opts.approve}`);
          }
          return;
        }

        // Show quarantine
        const q = getQuarantined(20);
        if (q.length === 0) {
          console.log('\n🐝 Quarantine is empty\n');
          return;
        }
        console.log(`\n🐝 ${q.length} quarantined message(s):\n`);
        for (const m of q) {
          console.log(`  ${m.identifier} (${m.platform})`);
          console.log(`    "${m.messagePreview}"`);
          console.log(`    ${m.timestamp}\n`);
        }
      });

  }, { commands: ['wasp'] });

  api.logger.info('[wasp] Plugin registered - security layer active');
}
