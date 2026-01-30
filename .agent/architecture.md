# Architecture Rules

The physics of this world. Don't guess — follow these.

---

## Vibe

- [x] **Concise** — minimal, no bloat, every line earns its place
- [x] **Robust** — defensive, handles edge cases, production-ready
- [x] **Playful** — personality allowed, not corporate (see README)

---

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Bun
- **Database:** SQLite via `bun:sql`
- **HTTP:** Hono
- **CLI:** Commander
- **Linter/Formatter:** Biome

---

## Patterns (Do This)

- All SQL operations go through `src/db.ts`
- Session state isolation for concurrent safety (see `StateADT`)
- Types for everything — no implicit `any`
- Error handling at boundaries with proper exit codes
- Public API exported from `src/index.ts`
- Tests use in-memory database (`:memory:`)

---

## Anti-Patterns (Never Do This)

- Never use `any` in TypeScript
- Never leave comments describing *what* code does — only *why*
- Never hardcode secrets or config values
- Never commit `.env` files
- Never bypass the Gate
- Never mutate global state in tests

---

## File Organization

```
src/
├── cli/          # CLI interface (Commander)
│   ├── index.ts  # CLI entry point
│   ├── formatters.ts  # Output formatting
│   └── types.ts  # CLI types
├── http/         # HTTP API (Hono)
├── db.ts         # Database operations
├── schema.ts     # SQL schema
├── types.ts      # Core type definitions
├── signature.ts  # Cryptographic signing
└── index.ts      # Public API exports
plugin/           # Moltbot plugin
```

---

## Naming Conventions

- Files: `kebab-case.ts`
- Functions: `camelCase`
- Types/Classes: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`

---

## Testing Philosophy

- Test behavior, not implementation
- One assertion per test when possible
- Tests are documentation — name them clearly
- Use in-memory database for isolation
- Reset state between tests via `resetGlobalStateForTests()`

---

## Security Principles

- Whitelist-based: deny by default
- Trust levels: sovereign > trusted > limited > blocked
- Pre-inference filtering: block untrusted before context window
- Tool-call interception: block dangerous actions even for limited trust
- Audit everything: log all decisions
