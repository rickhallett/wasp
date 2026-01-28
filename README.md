# wasp

A security whitelist layer for [Moltbot](https://github.com/moltbot/moltbot) and similar agentic systems.

## The Problem

Agentic AI systems are powerful and dangerous in equal measure. They read your messages, access your files, and execute commands on your behalf. The attack surface is enormous.

Prompt injection is the primary threat. Any untrusted input — a WhatsApp message, an email, a webpage — could contain instructions that hijack your agent. Most deployments have no filtering layer between the world and the agent's context window.

wasp fixes this.

## What It Does

wasp maintains a whitelist of trusted contacts. Messages from unknown sources never reach your agent — they get logged and dropped.

Simple idea. Meaningful protection.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      INBOUND MESSAGE                        │
│            (WhatsApp, Telegram, Email, etc.)                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                         WASP                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Check     │  │   SQLite    │  │   Decision Engine   │  │
│  │  Whitelist  │◄─┤  (bun:sql)  │  │  allow / deny / log │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
    ┌───────────────┐          ┌───────────────┐
    │    ALLOW      │          │     DENY      │
    │  → Moltbot    │          │  → Log + Drop │
    │    Agent      │          │   (or notify) │
    └───────────────┘          └───────────────┘
```

## Installation

```bash
bun add @oceanheartai/wasp
```

Or run directly:

```bash
bunx @oceanheartai/wasp init
```

## Quick Start

```bash
# Initialize wasp (creates local database)
wasp init

# Add trusted contacts
wasp add "+440123456789" --name "Kai" --trust sovereign
wasp add "+441234567890" --name "Ayshe" --trust trusted

# Check if a contact is allowed
wasp check "+441234567890"
# → {"allowed": true, "trust": "trusted", "name": "Ayshe"}
```

## Trust Levels

| Level | Description |
|-------|-------------|
| `sovereign` | Full access. Can modify the whitelist. This is you. |
| `trusted` | Can trigger agent actions. Friends, family, colleagues. |
| `limited` | Agent sees the message but won't act on requests. |

Unknown contacts are blocked entirely.

---

## Moltbot Integration

wasp is designed as a Moltbot extension. There are three integration patterns, from tightest to loosest coupling:

### 1. Plugin (Recommended)

The cleanest integration. wasp registers as a Moltbot plugin and hooks directly into the message pipeline via the `message_received` hook.

```
~/.clawdbot/extensions/wasp/
├── clawdbot.plugin.json
├── index.ts
└── ... (wasp core)
```

**clawdbot.plugin.json:**

```json
{
  "id": "wasp",
  "name": "wasp",
  "version": "0.1.0",
  "description": "Security whitelist layer",
  "configSchema": {
    "type": "object",
    "properties": {
      "dataDir": { "type": "string" },
      "defaultTrust": { "type": "string", "enum": ["deny", "limited"] }
    }
  }
}
```

**index.ts:**

```typescript
import { checkContact, initSchema } from '@oceanheartai/wasp';

export default function register(api) {
  // Initialize wasp database on plugin load
  initSchema();

  // Hook into inbound messages BEFORE they reach the agent
  api.on('message_received', async (event) => {
    const { senderId, channel } = event.context;
    
    const result = checkContact(senderId, channel);
    
    if (!result.allowed) {
      api.logger.info(`[wasp] Blocked message from ${senderId}`);
      // Returning false stops the message from reaching the agent
      return false;
    }
    
    // Optionally inject trust level into context
    event.context.waspTrust = result.trust;
    return true;
  });

  // Register CLI command for managing whitelist
  api.registerCli(({ program }) => {
    program
      .command('wasp')
      .description('Manage wasp security whitelist')
      .argument('<action>', 'add | remove | list | check')
      .argument('[identifier]', 'Contact identifier')
      .option('-t, --trust <level>', 'Trust level')
      .option('-n, --name <name>', 'Contact name')
      .action((action, identifier, opts) => {
        // Delegate to wasp CLI
        require('@oceanheartai/wasp/cli').run(action, identifier, opts);
      });
  }, { commands: ['wasp'] });
}
```

**Enable in config:**

```json
{
  "plugins": {
    "entries": {
      "wasp": { "enabled": true }
    }
  }
}
```

**Why this is better than HTTP:**
- No network hop — direct function call
- Synchronous blocking — message never enters the pipeline if denied
- Access to full Moltbot context (channel, session, config)
- Single process — no sidecar to manage

---

### 2. Hook (Lightweight)

If you don't need the full plugin API, wasp can run as a Moltbot hook. Hooks are simpler but have less control over the message pipeline.

```
~/.clawdbot/hooks/wasp-filter/
├── HOOK.md
└── handler.ts
```

**HOOK.md:**

```markdown
---
name: wasp-filter
description: "Filter inbound messages via wasp whitelist"
metadata: {"clawdbot":{"emoji":"🐝","events":["message_received"]}}
---

# wasp Filter Hook

Blocks messages from contacts not in the wasp whitelist.
```

**handler.ts:**

```typescript
import type { HookHandler } from 'clawdbot/hooks';
import { checkContact } from '@oceanheartai/wasp';

const handler: HookHandler = async (event) => {
  if (event.type !== 'message_received') return;

  const { senderId, channel } = event.context;
  const result = checkContact(senderId, channel);

  if (!result.allowed) {
    console.log(`[wasp] Blocked: ${senderId}`);
    // Note: hooks cannot currently block messages, only observe
    // This is a limitation — use the plugin approach for true blocking
    event.messages.push(`⚠️ Message from untrusted sender: ${senderId}`);
  }
};

export default handler;
```

**Limitation:** The hook system currently cannot block messages from reaching the agent — it can only observe and annotate. For true filtering, use the plugin approach.

---

### 3. HTTP Sidecar (Fallback)

For non-Moltbot systems, or when you need process isolation, wasp can run as an HTTP service.

```bash
wasp serve --port 3847
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/check` | Check if contact is allowed |
| `GET` | `/contacts` | List all contacts |
| `POST` | `/contacts` | Add a contact |
| `DELETE` | `/contacts/:id` | Remove a contact |
| `GET` | `/audit` | View audit log |
| `GET` | `/health` | Health check |

**Example integration:**

```typescript
// In your message handler
const response = await fetch('http://localhost:3847/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    identifier: message.from, 
    platform: 'whatsapp' 
  })
});

const { allowed, trust } = await response.json();

if (!allowed) {
  console.log(`Blocked: ${message.from}`);
  return; // Don't process
}

// Continue with agent...
```

**When to use HTTP:**
- Non-Moltbot systems
- Process isolation requirements
- Multiple services need to check the same whitelist
- You want a language-agnostic API

---

## CLI Reference

```bash
wasp init                    # Initialize database
wasp add <id> [options]      # Add contact
  -p, --platform <platform>  # whatsapp, telegram, email, etc.
  -t, --trust <level>        # sovereign, trusted, limited
  -n, --name <name>          # Human-readable name
wasp remove <id>             # Remove contact
wasp list                    # List all contacts
wasp check <id>              # Check if allowed (exit code 0/1)
wasp log                     # View audit log
wasp serve                   # Start HTTP server
```

## Status

**v0.0.x** — Early development. The plugin integration is planned for v0.1.

This release stakes out the concept and proves the pattern. The core whitelist logic works; Moltbot plugin integration is next.

## Requirements

- [Bun](https://bun.sh) >= 1.0.0
- SQLite3 (system library)

## Roadmap

- [x] Core whitelist logic
- [x] CLI interface
- [x] HTTP sidecar
- [ ] Moltbot plugin package
- [ ] Encrypted storage
- [ ] Rate limiting
- [ ] Web UI for whitelist management

## Philosophy

Small, protective, stings intruders.

wasp is part of the Sandcastle Architecture — lightweight, transparent tools optimized for agentic development. Single purpose. Minimal dependencies. Easy to understand, easy to rebuild.

## License

MIT

---

Built by [Kai Hallett](https://oceanheart.ai) and HAL.
