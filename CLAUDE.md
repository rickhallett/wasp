# wasp

> Security whitelist layer for agentic AI — blocks untrusted input before it reaches your agent's context window.

---

## Quick Orient

```bash
./bin/bootstrap   # Fix environment
./bin/gate        # Verify your work
```

---

## Architecture

See `.agent/architecture.md` for full rules.

```
src/
├── cli/         # CLI interface (Commander)
├── http/        # HTTP API (Hono)
├── signature.ts # Cryptographic signatures
├── db.ts        # SQLite operations
├── schema.ts    # Database schema
├── types.ts     # Type definitions
└── index.ts     # Public API
plugin/          # Moltbot plugin integration
```

---

## Current Focus

**Active:** v0.2.x stabilization, Moltbot plugin polish
**Next:** Encrypted storage, Web UI
**Blocked:** —

---

## The Gate

Before any task is "done":
```bash
./bin/gate
```

Exit code 0 = ready. Non-zero = fix it first.

---

## Reference Code

When implementing, follow patterns in:
- `src/db.ts` — SQLite operations, session management
- `src/cli/` — CLI structure with Commander
- `src/http/` — Hono routes and middleware

---

## Prompts

Reusable prompts in `.prompts/`:
- `refactor.md` — refactoring guidelines
- `feature_spec.md` — spec before implementation
- `review.md` — audit checklist

---

## Known Gotchas

- Session state isolation is critical for concurrent operations
- Database lives at `~/.wasp/wasp.db` by default (configurable via `WASP_DATA_DIR`)
- Tests use in-memory SQLite (`:memory:`)
- Bun's native SQLite (`bun:sql`) is used throughout
