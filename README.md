# wasp

A security whitelist layer for [Moltbot](https://github.com/moltbot/moltbot) and similar agentic systems.

## The Problem

Agentic AI systems are powerful and dangerous in equal measure. They read your messages, access your files, and execute commands on your behalf. The attack surface is enormous.

Prompt injection is the primary threat. Any untrusted input — a WhatsApp message, an email, a webpage — could contain instructions that hijack your agent. Most deployments have no filtering layer between the world and the agent's context window.

wasp fixes this.

## What It Does

wasp sits between your messaging channels and your agent. It maintains an encrypted whitelist of trusted contacts. Messages from unknown sources never reach your agent — they get logged and dropped.

Simple idea. Meaningful protection.

## Installation

```bash
bun add @oai/wasp
```

Or run directly:

```bash
bunx @oai/wasp init
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

# Start the HTTP sidecar for Moltbot integration
wasp serve --port 3847
```

## Trust Levels

| Level | Description |
|-------|-------------|
| `sovereign` | Full access. Can modify the whitelist. This is you. |
| `trusted` | Can trigger agent actions. Friends, family, colleagues. |
| `limited` | Agent sees the message but won't act on requests. |

Unknown contacts are blocked entirely.

## HTTP API

When running `wasp serve`, the following endpoints are available:

```
POST /check
  Body: { "identifier": "+447...", "platform": "whatsapp" }
  Response: { "allowed": true, "trust": "trusted", "name": "..." }

GET /health
  Response: { "ok": true }
```

Integrate this into your Moltbot message pipeline to filter inbound messages before they reach the agent.

## Moltbot Integration

wasp is designed to work with Moltbot but isn't coupled to it. Any system that can make HTTP calls or shell out to a CLI can use wasp.

Example middleware pattern:

```typescript
const response = await fetch('http://localhost:3847/check', {
  method: 'POST',
  body: JSON.stringify({ identifier: message.from, platform: 'whatsapp' })
});

if (!response.ok || !(await response.json()).allowed) {
  console.log(`Blocked: ${message.from}`);
  return;
}

// Continue processing...
```

## Status

**v0.0.x** — Early development. The API will change. Don't use this in production yet.

This project exists to stake out the concept and prove the pattern. Contributions welcome once we hit v0.1.

## Philosophy

Small, protective, stings intruders.

wasp is part of the Sandcastle Architecture — lightweight, transparent tools optimized for agentic development. Single purpose. Minimal dependencies. Easy to understand, easy to rebuild.

## License

MIT

---

Built by [Kai Hallett](https://oceanheart.ai) and HAL.
