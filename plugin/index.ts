/**
 * wasp - Moltbot Plugin
 * 
 * Security whitelist layer that filters inbound messages
 * and controls tool access based on sender trust levels.
 */

import { checkContact, addContact, listContacts, removeContact } from '../src/db/contacts.js';
import { initSchema } from '../src/db/client.js';
import { logDecision, getAuditLog } from '../src/db/audit.js';
import { quarantineMessage, getQuarantined, releaseQuarantined } from '../src/db/quarantine.js';
import type { Platform, TrustLevel } from '../src/types.js';

interface WaspConfig {
  dataDir?: string;
  defaultAction?: 'block' | 'quarantine' | 'limited';
  notifySovereign?: boolean;
  dangerousTools?: string[];
  safeTools?: string[];
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
  on: (event: string, handler: (event: any) => Promise<boolean | void> | boolean | void) => void;
  registerCli: (fn: (ctx: { program: any }) => void, opts?: { commands: string[] }) => void;
  registerCommand: (cmd: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: any) => Promise<{ text: string }> | { text: string };
  }) => void;
}

// Track trust level for the current turn (used by tool interception)
let currentTurnTrust: TrustLevel | null = null;
let currentTurnSender: string | null = null;

export default function register(api: PluginApi) {
  // pluginConfig is our plugin's config from plugins.entries.wasp.config
  const config: WaspConfig = (api as any).pluginConfig || {};
  
  // Set custom data dir if configured
  if (config.dataDir) {
    process.env.WASP_DATA_DIR = config.dataDir;
  }
  
  // Initialize database
  try {
    initSchema();
    api.logger.info('[wasp] Database initialized');
  } catch (err) {
    api.logger.error(`[wasp] Failed to initialize database: ${err}`);
  }

  const defaultAction = config.defaultAction || 'block';
  const dangerousTools = config.dangerousTools || ['exec', 'write', 'message', 'gateway', 'Edit', 'Write'];
  const safeTools = config.safeTools || ['web_search', 'memory_search', 'Read', 'session_status'];

  // ============================================
  // Hook: message_received
  // Audit incoming messages (can't block - void hook)
  // ============================================
  api.on('message_received', async (event: any, ctx: any) => {
    // Event structure from dispatch-from-config.js:
    // event.from, event.content, event.metadata.senderId, event.metadata.senderE164
    // ctx.channelId, ctx.accountId, ctx.conversationId
    
    const senderId = event.metadata?.senderE164 || event.metadata?.senderId || event.from;
    const channel = (ctx?.channelId || 'whatsapp') as Platform;
    
    if (!senderId) {
      api.logger.debug('[wasp] No senderId in message');
      return;
    }

    const result = checkContact(senderId, channel);
    
    // Log the decision
    const decision = !result.allowed ? 'deny' : result.trust === 'limited' ? 'limited' : 'allow';
    logDecision(senderId, channel, decision, result.reason);

    if (!result.allowed) {
      api.logger.info(`[wasp] AUDIT: ${senderId} (${channel}) - ${result.reason}`);
      
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

    // Store trust level for tool interception
    currentTurnTrust = result.trust;
    currentTurnSender = senderId;
  });

  // ============================================
  // Hook: before_tool_call
  // Intercept tool calls for limited/untrusted senders
  // Returns { block: true, blockReason: "..." } to block
  // ============================================
  api.on('before_tool_call', async (event: any, ctx: any) => {
    const toolName = event.name || event.toolName;
    
    // No restriction for trusted/sovereign
    if (!currentTurnTrust || currentTurnTrust === 'trusted' || currentTurnTrust === 'sovereign') {
      return undefined; // Don't modify
    }

    // Unknown sender (not in whitelist) - block dangerous tools
    if (!currentTurnTrust || currentTurnTrust === 'limited') {
      // Allow safe tools
      if (safeTools.includes(toolName)) {
        api.logger.debug(`[wasp] Tool ${toolName} allowed (safe list)`);
        return undefined;
      }

      // Block dangerous tools
      if (dangerousTools.includes(toolName)) {
        api.logger.warn(`[wasp] BLOCKED tool ${toolName} for sender ${currentTurnSender} (trust: ${currentTurnTrust || 'unknown'})`);
        return { 
          block: true, 
          blockReason: `wasp: tool ${toolName} blocked for untrusted sender` 
        };
      }

      // Default: allow unknown tools
      api.logger.debug(`[wasp] Tool ${toolName} allowed (not in dangerous list)`);
      return undefined;
    }

    return undefined;
  });

  // ============================================
  // Hook: agent_end
  // Clear turn state
  // ============================================
  api.on('agent_end', async () => {
    currentTurnTrust = null;
    currentTurnSender = null;
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
      .action((identifier, opts) => {
        const contact = addContact(identifier, opts.platform, opts.trust, opts.name);
        console.log(`Added: ${contact.identifier} (${contact.trust})`);
      });

    wasp
      .command('remove <identifier>')
      .description('Remove a contact')
      .option('-p, --platform <platform>', 'Platform', 'whatsapp')
      .action((identifier, opts) => {
        if (removeContact(identifier, opts.platform)) {
          console.log(`Removed: ${identifier}`);
        } else {
          console.log(`Not found: ${identifier}`);
        }
      });

    wasp
      .command('list')
      .description('List all contacts')
      .option('-t, --trust <level>', 'Filter by trust level')
      .action((opts) => {
        const contacts = listContacts(undefined, opts.trust);
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
      .action((opts) => {
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
      .action(async (opts) => {
        if (opts.approve) {
          // Add to trusted and release messages
          const released = releaseQuarantined(opts.approve);
          if (released.length > 0) {
            addContact(released[0].identifier, released[0].platform, 'trusted');
            console.log(`Approved ${released[0].identifier}, released ${released.length} message(s)`);
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
