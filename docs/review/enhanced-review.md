# Plugin Review: @oceanheartai/wasp

**Review Date:** 2026-01-28
**Reviewer:** Automated Code Review System
**Plugin Version:** 0.1.1
**Verdict:** REQUEST CHANGES

---

## Executive Summary

wasp is a security whitelist layer designed to protect Moltbot and similar agentic systems from prompt injection attacks by filtering inbound messages based on sender trust levels. The concept is sound and addresses a real security need. However, several issues prevent immediate approval:

1. **Critical:** Missing `SKILL.md` file (required for Moltbot agent integration)
2. **Critical:** `moltbot` not in `peerDependencies`
3. **High:** Uses `any` types instead of proper TypeScript typing
4. **Medium:** Native dependency (better-sqlite3) requires additional security review
5. **Low:** Missing schema validation for external input

---

## Security Assessment

### Checklist

- [x] **No arbitrary code execution** - Plugin does not execute user-provided input as shell commands
- [x] **Credentials access scoped appropriately** - Only accesses `~/.wasp/` directory, not core Moltbot credentials
- [x] **No undisclosed external endpoints** - HTTP server is local-only; no external network calls
- [x] **Data stored securely** - SQLite database with parameterized queries prevents SQL injection
- [ ] **Permissions appropriate** - Uses `process.env` modification which could affect other plugins
- [x] **No obfuscated code** - Source is fully readable TypeScript
- [x] **No remote code execution** - Does not download or execute remote code
- [x] **Does not modify core config** - Operates within its own scope

### Security Strengths

1. **Parameterized SQL Queries**
   All database operations use prepared statements with parameterized inputs:
   ```typescript
   // src/db/contacts.ts:12-22
   const stmt = db.prepare(`
     INSERT INTO contacts (identifier, platform, trust, name, notes)
     VALUES (?, ?, ?, ?, ?)
     ...
   `);
   stmt.run(identifier, platform, trust, name || null, notes || null);
   ```

2. **Rate Limiting Implementation**
   The HTTP server includes rate limiting to prevent abuse:
   ```typescript
   // src/ratelimit.ts - Sliding window rate limiting
   const RATE_LIMIT_CONFIG: RateLimitConfig = {
     windowMs: 60 * 1000,  // 1 minute
     maxRequests: 100      // 100 checks per minute per IP
   };
   ```

3. **Data Directory Isolation**
   Plugin stores data in its own directory (`~/.wasp/`), not accessing Moltbot credential stores:
   ```typescript
   // src/db/client.ts:6
   let DATA_DIR = process.env.WASP_DATA_DIR || join(homedir(), '.wasp');
   ```

4. **Tool-Call Interception**
   The plugin implements proper tool-call blocking for untrusted senders:
   ```typescript
   // plugin/index.ts:116-147
   api.on('before_tool_call', async (event: any, ctx: any) => {
     // Blocks dangerous tools for limited/unknown senders
     if (dangerousTools.includes(toolName)) {
       return {
         block: true,
         blockReason: `wasp: tool ${toolName} blocked for untrusted sender`
       };
     }
   });
   ```

### Security Concerns

1. **Environment Variable Side Effect**
   The plugin modifies `process.env.WASP_DATA_DIR` which could potentially affect other plugins or the host system:
   ```typescript
   // plugin/index.ts:52-54
   if (config.dataDir) {
     process.env.WASP_DATA_DIR = config.dataDir;
   }
   ```
   **Recommendation:** Use a module-scoped variable instead of environment mutation.

2. **Module-Level State for Trust Tracking**
   Trust level is stored in module-level variables which could lead to race conditions in concurrent scenarios:
   ```typescript
   // plugin/index.ts:44-45
   let currentTurnTrust: TrustLevel | null = null;
   let currentTurnSender: string | null = null;
   ```
   **Recommendation:** Consider request-scoped context instead of module globals.

3. **Native Dependency**
   The plugin includes `better-sqlite3` which has native bindings:
   ```
   node_modules/better-sqlite3/build/Release/better_sqlite3.node
   ```
   Native dependencies require additional security review as they execute compiled code outside the JavaScript sandbox.

### Prompt Injection Handling

The plugin's core purpose is prompt injection defense. Assessment:

- [x] **Pre-inference filtering** - Messages from unknown senders blocked before reaching agent context
- [x] **Tool-call interception** - Dangerous tools blocked for limited-trust senders
- [x] **Trust boundaries documented** - README clearly documents trust levels and their implications
- [ ] **Input sanitization** - No explicit sanitization of message content before logging/quarantine

**Note:** The plugin does not process external content directly into prompts. Its role is filtering, not content injection. The trust boundary documentation is excellent.

---

## Package Structure Assessment

### package.json Analysis

**Root package.json:**
```json
{
  "name": "@oceanheartai/wasp",
  "version": "0.1.1",
  "type": "module",
  "engines": {
    "bun": ">=1.0.0"  // Issue: Should specify node >=22
  },
  "dependencies": {
    "better-sqlite3": "^12.6.2",
    "commander": "^12.0.0",
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

### Issues

| Check | Status | Notes |
|-------|--------|-------|
| `moltbot` in `peerDependencies` | Missing | **CRITICAL**: Required for plugin compatibility |
| No `workspace:*` in dependencies | Pass | Clean dependencies |
| `type: "module"` set | Pass | ESM enabled |
| `engines.node` >= 22 | Fail | Only specifies `bun`, not `node` |
| Semver versioning | Pass | Using 0.1.1 correctly |

**Plugin package.json (plugin/package.json):**
```json
{
  "name": "wasp",
  "version": "0.1.0",
  "main": "index.ts",
  "dependencies": {}
}
```

This is minimal but acceptable for an embedded plugin module.

### Required Changes

1. Add to root `package.json`:
   ```json
   {
     "peerDependencies": {
       "moltbot": ">=2024.1.0"
     },
     "engines": {
       "node": ">=22",
       "bun": ">=1.0.0"
     }
   }
   ```

---

## TypeScript Standards Assessment

### tsconfig.json Review

```json
{
  "compilerOptions": {
    "strict": true,              // Good
    "noUncheckedIndexedAccess": true,  // Good - strict array access
    "noImplicitOverride": true,  // Good
    "noFallthroughCasesInSwitch": true,  // Good
    // ...
  }
}
```

**Positive:** Strict mode is enabled with additional safety flags.

### Type Safety Issues

1. **Extensive use of `any` type**

   ```typescript
   // src/db/adapter.ts:16-17
   run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
   get(...params: any[]): any;
   all(...params: any[]): any[];
   ```

   ```typescript
   // src/db/contacts.ts:26,49
   const row = db.prepare('SELECT * FROM contacts WHERE identifier = ? AND platform = ?')
     .get(identifier, platform) as any;
   ```

   ```typescript
   // plugin/index.ts:49
   const config: WaspConfig = (api as any).pluginConfig || {};
   ```

   **Recommendation:** Use `unknown` with type guards or properly typed interfaces:
   ```typescript
   interface ContactRow {
     id: number;
     identifier: string;
     platform: string;
     name: string | null;
     trust: string;
     added_at: string;
     notes: string | null;
   }

   const row = stmt.get(identifier, platform) as ContactRow | undefined;
   ```

2. **Missing explicit return types on some functions**

   Most exported functions have return types, but some are inferred:
   ```typescript
   // src/db/client.ts:12-15 - Missing explicit return type
   export function reloadPaths(): void {  // Good - has return type

   // plugin/index.ts:47 - Missing return type
   export default function register(api: PluginApi) {  // Should be: ): void {
   ```

3. **No schema validation for external input**

   The HTTP server accepts JSON input without validation:
   ```typescript
   // src/server/index.ts:38-39
   const body = await c.req.json();
   const { identifier, platform = 'whatsapp' } = body;
   ```

   **Recommendation:** Add TypeBox or Zod validation:
   ```typescript
   import { Type, Static } from '@sinclair/typebox'
   import { Value } from '@sinclair/typebox/value'

   const CheckRequestSchema = Type.Object({
     identifier: Type.String(),
     platform: Type.Optional(Type.Union([
       Type.Literal('whatsapp'),
       Type.Literal('telegram'),
       // ...
     ]))
   });

   const body = await c.req.json();
   if (!Value.Check(CheckRequestSchema, body)) {
     return c.json({ error: 'Invalid request body' }, 400);
   }
   ```

---

## SKILL.md Assessment

### Status: MISSING (CRITICAL)

**This is a rejection-level issue.** The `SKILL.md` file is required for Moltbot agents to understand when and how to use the plugin.

### Required SKILL.md Content

Create `plugin/SKILL.md` with the following structure:

```markdown
# wasp - Security Whitelist Layer

A security filter that protects the agent from prompt injection by
maintaining a whitelist of trusted contacts.

## When to Use

This plugin operates automatically on all inbound messages. The agent
should not invoke wasp tools directly during normal operation.

Use the wasp CLI commands when:
- A user requests to add/remove contacts from the whitelist
- A user asks to review quarantined messages
- A user wants to see the security status or audit log

## Tools Provided

### /wasp
- **Description**: Show wasp security status
- **Parameters**: None
- **Returns**: Summary of active contacts by trust level
- **Example**: `/wasp` returns contact counts and default action

### /wasp-review
- **Description**: Show quarantined messages awaiting review
- **Parameters**: None
- **Returns**: List of messages from unknown senders held for review
- **Example**: `/wasp-review` shows pending messages

## CLI Commands (via `moltbot wasp`)

### wasp status
Show current security configuration and contact counts.

### wasp add <identifier>
- `-p, --platform`: whatsapp, telegram, email, etc.
- `-t, --trust`: sovereign, trusted, limited
- `-n, --name`: Human-readable name

### wasp remove <identifier>
Remove a contact from the whitelist.

### wasp list
List all whitelisted contacts.

### wasp audit
View the decision audit log.

### wasp review
Review quarantined messages from unknown senders.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dataDir` | string | `~/.wasp` | Custom data directory |
| `defaultAction` | enum | `block` | Action for unknown contacts |
| `dangerousTools` | array | `["exec", "write", ...]` | Tools blocked for limited trust |
| `safeTools` | array | `["web_search", ...]` | Tools allowed for limited trust |

## Trust Levels

| Level | Message Reaches Agent? | Tools Allowed |
|-------|------------------------|---------------|
| `sovereign` | Yes | All |
| `trusted` | Yes | All |
| `limited` | Yes (with warning) | Safe tools only |
| Unknown | No (blocked/quarantined) | None |

## Limitations

- Cannot retroactively filter messages already in the agent's context
- Interactive review mode not yet implemented
- Web UI not yet available
- Does not filter output (response leakage still possible for limited senders)

## Security Boundaries

wasp provides hard security guarantees through code enforcement:
- Unknown senders NEVER reach agent context (blocked at message_received)
- Limited senders CANNOT invoke dangerous tools (blocked at before_tool_call)
- All decisions are logged for audit

wasp does NOT guarantee:
- LLM won't leak information in responses to limited senders
- Sophisticated prompt injection won't influence reasoning
```

---

## Testing Assessment

### Test Coverage

| Module | Tests Exist | Coverage Assessment |
|--------|-------------|---------------------|
| `db/client.ts` | Yes | Basic initialization, table creation |
| `db/contacts.ts` | Yes | CRUD operations, trust checks |
| `db/quarantine.ts` | Yes | Message quarantine lifecycle |
| `ratelimit.ts` | Yes | Rate limiting logic |
| `db/audit.ts` | No | Missing tests |
| `server/index.ts` | No | Missing API endpoint tests |
| `plugin/index.ts` | No | **Critical gap** - Plugin logic untested |

### Test Quality

**Strengths:**
- Tests use isolated temporary directories
- Tests clean up after themselves
- Good coverage of core database operations
- Tests cover edge cases (rate limit expiry, long message truncation)

**Weaknesses:**
- No tests for the Moltbot plugin hooks (`message_received`, `before_tool_call`)
- No integration tests for the HTTP server
- Tests are Bun-specific (`bun:test`)

### Example Test Code (Good)

```typescript
// src/db/contacts.test.ts:25-32
it('should add a contact', () => {
  const contact = addContact('+440123456789', 'whatsapp', 'sovereign', 'Kai');

  expect(contact.identifier).toBe('+440123456789');
  expect(contact.platform).toBe('whatsapp');
  expect(contact.trust).toBe('sovereign');
  expect(contact.name).toBe('Kai');
});
```

### Required Additions

1. **Plugin hook tests** - Mock the PluginApi and verify:
   - Messages from unknown senders are logged correctly
   - `before_tool_call` blocks dangerous tools for limited senders
   - State is cleared on `agent_end`

2. **HTTP server tests** - Test all endpoints:
   - `/check` with valid/invalid input
   - `/contacts` CRUD operations
   - Rate limiting behavior

---

## Error Handling Assessment

### Checklist

- [x] Async operations in try/catch (plugin init)
- [x] Errors logged with context
- [ ] All promise rejections handled
- [ ] User-facing errors are actionable
- [ ] Timeout handling for external calls

### Error Handling Quality

**Good:**
```typescript
// plugin/index.ts:57-62
try {
  initSchema();
  api.logger.info('[wasp] Database initialized');
} catch (err) {
  api.logger.error(`[wasp] Failed to initialize database: ${err}`);
}
```

**Needs Improvement:**
```typescript
// src/server/index.ts:38 - No try/catch around JSON parsing
const body = await c.req.json();  // Could throw on invalid JSON
```

**Recommendation:**
```typescript
app.post('/check', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  // ...
});
```

---

## Documentation Assessment

### Checklist

- [x] README.md with installation instructions
- [x] Configuration requirements documented
- [x] Example usage shown
- [x] Architecture diagram included
- [ ] CHANGELOG.md maintained
- [ ] API reference documentation

### README Quality

The README is comprehensive and well-written:
- Clear problem statement and value proposition
- ASCII architecture diagram
- Multiple integration patterns documented (plugin, hook, HTTP)
- Security model thoroughly explained
- Trust levels documented with use cases

### Missing Documentation

1. **CHANGELOG.md** - No changelog file for version history
2. **API Reference** - HTTP endpoints documented in README but not formally specified
3. **SKILL.md** - Critical missing documentation for Moltbot integration

---

## Code Style Assessment

### Checklist

- [x] Consistent formatting
- [x] No lint errors (assumed - no linter config provided)
- [x] Clear function names
- [x] No commented-out code blocks
- [ ] Brief comments for non-obvious logic

### Style Observations

**Positive:**
- Consistent use of ESM imports
- Clear, descriptive function names (`checkContact`, `quarantineMessage`)
- Good file organization (commands/, db/, server/)
- Consistent error message formatting

**Minor Issues:**
- Some magic strings that could be constants:
  ```typescript
  // Could extract to constant
  const DEFAULT_TRUST: TrustLevel = 'trusted';
  const DEFAULT_PLATFORM: Platform = 'whatsapp';
  ```

---

## Native Dependency Review

### better-sqlite3

**Purpose:** Provides Node.js compatibility for SQLite (Bun has built-in `bun:sqlite`).

**Assessment:**
- Widely used, well-maintained package
- Native compilation required on installation
- Prebuilt binaries available for common platforms

**Concerns:**
- Adds installation complexity
- Binary compatibility issues possible on unusual platforms
- Increases attack surface (native code)

**Recommendation:** Document the native dependency clearly. Consider:
1. Making it optional (Bun users don't need it)
2. Testing the Bun-only code path more thoroughly

---

## Summary

### Blocking Issues (Must Fix)

1. **Create SKILL.md** - Plugin is unusable without agent instructions
2. **Add `moltbot` to peerDependencies** - Required for proper installation
3. **Add `engines.node` >= 22** - Required per Moltbot plugin guidelines

### High Priority (Should Fix)

4. Replace `any` types with proper TypeScript typing
5. Add schema validation for HTTP API input
6. Add tests for plugin hooks
7. Add try/catch around JSON parsing in server

### Medium Priority (Recommended)

8. Use request-scoped context instead of module globals for trust tracking
9. Avoid mutating `process.env` for configuration
10. Add HTTP server endpoint tests
11. Create CHANGELOG.md

### Low Priority (Nice to Have)

12. Add comments for complex logic
13. Extract magic strings to constants
14. Document API formally (OpenAPI spec)

---

## Verdict: REQUEST CHANGES

The plugin demonstrates solid security design and addresses a real need in the Moltbot ecosystem. The core whitelist logic is well-implemented with proper SQL parameterization and rate limiting. However, the missing `SKILL.md` is a critical blocker - without it, the Moltbot agent cannot understand how to use the plugin.

### Required Before Approval

1. Create `plugin/SKILL.md` following the template above
2. Add `peerDependencies: { "moltbot": ">=2024.1.0" }` to package.json
3. Add `engines: { "node": ">=22" }` to package.json

### Suggested Timeline

After addressing the blocking issues, this plugin would be a strong candidate for approval. The security model is sound, the code is readable, and the documentation is above average.

---

*Review generated by automated code analysis system based on Moltbot Plugin Reviewer guidelines.*
