# wasp - Security Whitelist Layer

A security filter that protects the agent from prompt injection by
maintaining a whitelist of trusted contacts.

## When to Use

This plugin operates **automatically** on all inbound messages. The agent
does not need to invoke wasp directly during normal operation.

Use the wasp CLI commands when:
- A user requests to add/remove contacts from the whitelist
- A user asks to review quarantined messages
- A user wants to see the security status or audit log

## How It Works

wasp intercepts messages at two points:

1. **message_received** — Logs all inbound messages with sender + trust decision
2. **before_tool_call** — Blocks dangerous tools for untrusted senders

Unknown senders can still talk to the agent, but cannot trigger dangerous tools
like `exec`, `write`, or `message`.

## Commands Provided

### /wasp
Show wasp security status (contact counts by trust level, default action).

### /wasp-review
Show quarantined messages awaiting review from unknown senders.

## CLI Commands

Access via `clawdbot wasp <command>` or directly with `wasp <command>`:

| Command | Description |
|---------|-------------|
| `wasp status` | Show security configuration |
| `wasp add <id>` | Add contact (`-t sovereign/trusted/limited`, `-n name`) |
| `wasp remove <id>` | Remove contact from whitelist |
| `wasp list` | List all whitelisted contacts |
| `wasp check <id>` | Check if a contact is allowed |
| `wasp log` | View decision audit log |
| `wasp review` | Review quarantined messages |
| `wasp blocked` | Show recently denied contacts |

## Trust Levels

| Level | Message Reaches Agent? | Tools Allowed |
|-------|------------------------|---------------|
| `sovereign` | Yes | All tools |
| `trusted` | Yes | All tools |
| `limited` | Yes (logged as limited) | Safe tools only |
| Unknown | Yes (logged as deny) | Safe tools only |

**Safe tools:** `web_search`, `memory_search`, `Read`, `session_status`

**Dangerous tools (blocked):** `exec`, `write`, `message`, `gateway`, `Edit`, `Write`

## Configuration

Configure in `plugins.entries.wasp.config`:

```json
{
  "plugins": {
    "entries": {
      "wasp": {
        "enabled": true,
        "config": {
          "dataDir": "~/.wasp",
          "defaultAction": "block",
          "dangerousTools": ["exec", "write", "message", "gateway"],
          "safeTools": ["web_search", "memory_search", "Read"]
        }
      }
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dataDir` | string | `~/.wasp` | Database location |
| `defaultAction` | enum | `block` | `block`, `quarantine`, or `limited` |
| `dangerousTools` | array | see above | Tools blocked for untrusted |
| `safeTools` | array | see above | Tools always allowed |

## Security Guarantees

wasp provides **hard enforcement** through code:

- ✅ Tool calls blocked at execution layer (not prompt-based)
- ✅ All decisions logged to audit trail
- ✅ Parameterized SQL prevents injection
- ✅ Rate limiting prevents abuse

wasp does **NOT** guarantee:
- LLM won't leak information in responses
- Sophisticated prompt injection won't influence reasoning

## Limitations

- Cannot block messages from reaching agent (only tools)
- Interactive review mode not yet implemented
- Single-process state (not suitable for horizontal scaling)

## Example Workflow

1. Unknown number messages the agent
2. wasp logs: `deny - Contact not in whitelist`
3. Agent sees the message, tries to help
4. Agent attempts `exec` → **blocked by wasp**
5. Sovereign reviews audit log, decides to whitelist
6. `wasp add "+1234567890" --trust trusted --name "New Friend"`
7. Future messages from that number have full tool access
