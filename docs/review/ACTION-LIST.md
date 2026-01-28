# wasp Code Review - Action List

**Compiled:** 2026-01-28
**Source:** code-review-2026-01-28.md + enhanced-review.md

---

## 🔴 CRITICAL (Blocking)

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 1 | **Missing SKILL.md** | `plugin/SKILL.md` | Create skill file for Moltbot agent integration |
| 2 | **Missing peerDependencies** | `package.json` | Add `"moltbot": ">=2024.1.0"` to peerDependencies |
| 3 | **Missing engines.node** | `package.json` | Add `"node": ">=22"` alongside bun |

---

## 🟠 HIGH PRIORITY (Should Fix)

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 4 | **HTTP API lacks authentication** | `src/server/index.ts` | Add auth middleware for admin endpoints (`/contacts`, `/audit`) |
| 5 | **No input validation** | `src/server/index.ts` | Validate `platform` against Platform type, add try/catch for JSON parsing |
| 6 | **Extensive `any` types** | `src/db/*.ts`, `plugin/index.ts` | Replace with proper interfaces (ContactRow, AuditRow, etc.) |
| 7 | **CLI version hardcoded** | `src/cli.ts` | Import version from package.json |
| 8 | **Plugin tests missing** | `plugin/` | Add tests for message_received and before_tool_call hooks |

---

## 🟡 MEDIUM PRIORITY (Recommended)

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 9 | **Global state for trust tracking** | `plugin/index.ts` | Consider per-request context or request ID tracking for concurrency |
| 10 | **process.env mutation** | `plugin/index.ts` | Use module-scoped variable instead of mutating process.env |
| 11 | **HTTP endpoint tests missing** | `src/server/` | Add Hono test client tests for all endpoints |
| 12 | **X-Forwarded-For parsing** | `src/server/index.ts` | Extract first IP from header (could contain multiple) |
| 13 | **Interactive review stubbed** | `src/commands/review.ts` | Implement or remove stub |
| 14 | **Consider `blocked` trust level** | `src/types.ts`, `src/db/contacts.ts` | Add explicit blocked level distinct from limited |
| 15 | **Create CHANGELOG.md** | root | Track version history |

---

## 🟢 LOW PRIORITY (Nice to Have)

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 16 | **setInterval in ratelimit** | `src/ratelimit.ts` | Add `.unref()` to prevent test hangs |
| 17 | **Magic strings** | various | Extract to constants (DEFAULT_TRUST, DEFAULT_PLATFORM) |
| 18 | **OpenAPI documentation** | `docs/` | Add formal API spec |
| 19 | **Database migrations** | `src/db/` | Consider migration system for schema evolution |
| 20 | **Metrics/observability** | plugin | Add hooks for monitoring |

---

## Implementation Order (Recommended)

### Wave 1: Critical Fixes (30 mins)
1. Create `plugin/SKILL.md`
2. Update `package.json` (peerDependencies, engines)
3. Fix CLI version import

### Wave 2: Security Hardening (1 hour)
4. Add HTTP authentication middleware
5. Add input validation with try/catch
6. Fix X-Forwarded-For parsing

### Wave 3: Type Safety (1 hour)
7. Define proper TypeScript interfaces
8. Replace `any` with typed interfaces
9. Add explicit return types

### Wave 4: Testing (1-2 hours)
10. Add plugin hook tests (mock PluginApi)
11. Add HTTP endpoint tests
12. Add audit.ts tests

### Wave 5: Polish (optional)
13-20. Remaining items as time permits

---

## Quick Wins (< 5 mins each)

- [ ] CLI version from package.json
- [ ] Add engines.node to package.json
- [ ] Add peerDependencies to package.json
- [ ] Add .unref() to setInterval
- [ ] Wrap JSON parsing in try/catch

---

## Security Model Validation ✅

Both reviews confirm the security model is **sound**:
- Pre-inference filtering prevents unknown messages reaching agent
- Tool interception provides hard guarantees (code enforcement, not prompt-based)
- SQL injection prevented via parameterized queries
- Rate limiting prevents abuse

The core architecture is solid. Issues are implementation details, not design flaws.
