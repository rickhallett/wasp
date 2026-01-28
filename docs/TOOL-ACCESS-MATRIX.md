# wasp Tool Access Matrix

## Trust Levels

| Level | Description | Who |
|-------|-------------|-----|
| `sovereign` | Full access, can manage wasp itself | System owner |
| `trusted` | Full tool access | Verified contacts |
| `limited` | Safe tools only | Partially trusted |
| `unknown` (null) | Safe tools only | Not in whitelist |

## Default Tool Lists

### Dangerous Tools (blocked for limited/unknown)
```
exec, write, message, gateway, Edit, Write
```

### Safe Tools (always allowed)
```
web_search, memory_search, Read, session_status
```

### Unlisted Tools
Tools not in either list are **allowed** by default. This is intentional:
- New tools shouldn't break existing functionality
- Admins can customize lists via config

## Access Matrix

| Tool | Sovereign | Trusted | Limited | Unknown |
|------|-----------|---------|---------|---------|
| `exec` | ✅ | ✅ | ❌ | ❌ |
| `write` | ✅ | ✅ | ❌ | ❌ |
| `Write` | ✅ | ✅ | ❌ | ❌ |
| `Edit` | ✅ | ✅ | ❌ | ❌ |
| `message` | ✅ | ✅ | ❌ | ❌ |
| `gateway` | ✅ | ✅ | ❌ | ❌ |
| `web_search` | ✅ | ✅ | ✅ | ✅ |
| `memory_search` | ✅ | ✅ | ✅ | ✅ |
| `Read` | ✅ | ✅ | ✅ | ✅ |
| `session_status` | ✅ | ✅ | ✅ | ✅ |
| (unlisted) | ✅ | ✅ | ✅ | ✅ |

## Message Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        INBOUND MESSAGE                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   message_received    │
                    │   (audit only,        │
                    │    cannot block)      │
                    └───────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        ┌─────────┐       ┌─────────┐       ┌─────────┐
        │sovereign│       │ trusted │       │ limited │
        │/trusted │       │         │       │/unknown │
        └────┬────┘       └────┬────┘       └────┬────┘
             │                 │                  │
             │                 │                  │
             ▼                 ▼                  ▼
        currentTrust    currentTrust       currentTrust
         = value         = value           = limited/null
             │                 │                  │
             └────────────────┬┘                  │
                              │                   │
                              ▼                   ▼
                    ┌─────────────────┐   ┌─────────────────┐
                    │  Agent runs,    │   │  Agent runs,    │
                    │  tries tools    │   │  tries tools    │
                    └────────┬────────┘   └────────┬────────┘
                             │                     │
                             ▼                     ▼
                    ┌─────────────────┐   ┌─────────────────┐
                    │ before_tool_call│   │ before_tool_call│
                    │ → allow all     │   │ → check lists   │
                    └─────────────────┘   └────────┬────────┘
                                                   │
                              ┌─────────────────────┼──────────────┐
                              ▼                     ▼              ▼
                        ┌──────────┐         ┌──────────┐   ┌──────────┐
                        │ safe tool│         │dangerous │   │ unlisted │
                        │ → allow  │         │ → BLOCK  │   │ → allow  │
                        └──────────┘         └──────────┘   └──────────┘
```

## Configuration

Override defaults in `plugins.entries.wasp.config`:

```json
{
  "dangerousTools": ["exec", "write", "custom_dangerous_tool"],
  "safeTools": ["web_search", "custom_safe_tool"]
}
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No senderId in message | Logged as debug, no trust set |
| No toolName in tool call | Treated as unlisted (allowed) |
| Same person, different platforms | Separate trust per platform |
| Trust cleared between turns | `agent_end` resets to null (unknown) |
| Tool in both lists | Dangerous takes precedence (blocked) |
