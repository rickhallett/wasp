# Would I Let This Into an Aircraft Control Tower?

**Assessment Date:** 2026-01-28  
**Assessor:** HAL (via simulated review)

## Executive Summary

**Verdict: YES, with documented limitations**

For its stated purpose (Moltbot security layer), wasp is production-ready. For an actual ATC, additional hardening would be required.

## Strengths ✅

### Security Model
- **Hard enforcement** — Tool blocking is in code, not prompts. Cannot be bypassed by prompt injection.
- **Defense in depth** — Audit logging, rate limiting, input validation
- **SQL injection protected** — All queries use parameterized statements
- **Auth on admin endpoints** — Localhost-only default, token for remote

### Test Coverage
- **88 tests** covering:
  - All trust levels (sovereign, trusted, limited, unknown)
  - All tool categories (dangerous, safe, unlisted)
  - Edge cases (SQL injection, unicode, race conditions)
  - Simulated user scenarios

### Code Quality
- TypeScript with strict mode
- No `any` types in production code
- Clear separation of concerns
- Comprehensive documentation

## Known Limitations ⚠️

### 1. Module-Level State
```typescript
let currentTurnTrust: TrustLevel | null = null;
let currentTurnSender: string | null = null;
```

**Risk:** In truly concurrent scenarios, race conditions possible.  
**Mitigation:** Moltbot processes messages sequentially per session.  
**For ATC:** Would need request-scoped context.

### 2. No Encryption at Rest
SQLite database stores contacts and audit log in plaintext.

**Risk:** If attacker gains filesystem access, data exposed.  
**Mitigation:** File permissions, disk encryption.  
**For ATC:** Would need SQLCipher or equivalent.

### 3. Default-Allow for Unlisted Tools
Tools not in dangerous or safe lists are allowed.

**Risk:** New dangerous tools could slip through.  
**Mitigation:** Regularly update tool lists.  
**For ATC:** Would want default-deny with explicit allowlist.

### 4. No Formal Verification
Tests are comprehensive but not formally proven.

**For ATC:** Would want formal methods verification of access control logic.

### 5. Single Point of Trust
Trust is determined solely by whitelist lookup.

**For ATC:** Would want multi-factor (IP, time, context).

## Test Matrix

| Scenario | Tests | Status |
|----------|-------|--------|
| Sovereign → all tools | 6 | ✅ |
| Trusted → all tools | 3 | ✅ |
| Limited → dangerous blocked | 6 | ✅ |
| Limited → safe allowed | 4 | ✅ |
| Unknown → dangerous blocked | 6 | ✅ |
| Unknown → safe allowed | 4 | ✅ |
| No context → dangerous blocked | 1 | ✅ |
| Cross-platform trust | 2 | ✅ |
| Trust escalation attempt | 1 | ✅ |
| Rapid message switching | 1 | ✅ |
| Session reset | 1 | ✅ |
| SQL injection | 3 | ✅ |
| Edge cases | 17 | ✅ |

## Conclusion

wasp achieves its security goals for the Moltbot use case:

1. **Unknown senders cannot use dangerous tools** — Verified in 12+ tests
2. **All decisions are audited** — Every check logged
3. **Cannot be bypassed by prompt injection** — Enforcement is in code
4. **Input validation prevents malformed data** — SQL injection, special chars tested

For a real ATC, I would require:
- Formal verification
- Encryption at rest
- Request-scoped context
- External security audit
- Default-deny for unlisted tools
- Multi-factor trust decisions

For Moltbot? **Ship it.**

---

*"I'm sorry Dave, I'm afraid I can't let an untrusted sender do that."*
