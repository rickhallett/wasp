# Changelog

All notable changes to wasp will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-01-28

### Fixed
- **[BLOCKER] Session-keyed state management** - Trust state is now stored per-session using `Map<SessionKey, TurnState>` instead of module-level globals. This ensures concurrent sessions have isolated trust states and prevents race conditions.
- **[NIT] Removed process.env mutation** - Plugin now uses explicit `setDataDir()` function instead of mutating `process.env.WASP_DATA_DIR`.

### Added  
- Concurrent session isolation tests (2 new tests)
- `setDataDir()` function in db/client.ts for explicit configuration

### Changed
- Plugin hooks now extract `sessionKey` from context for state isolation
- `agent_end` properly clears only the specific session's state

## [0.2.0] - 2026-01-28

### Added
- SKILL.md for Moltbot agent integration
- Authentication middleware for admin HTTP endpoints
- Input validation on all HTTP endpoints
- Proper TypeScript interfaces for database rows
- Comprehensive test suite (88 tests total):
  - Plugin hook tests (7)
  - HTTP server tests (14)
  - Audit log tests (3)
  - Edge case tests (17)
  - Simulated user scenario tests (27)
- CHANGELOG.md
- TOOL-ACCESS-MATRIX.md - complete access control reference
- ATC-ASSESSMENT.md - production readiness review

### Changed
- CLI version now imported from package.json
- X-Forwarded-For parsing extracts first IP (client) from comma-separated list
- `before_tool_call` hook now blocks dangerous tools for unknown senders (trust=null)
- Rate limiter interval uses `.unref()` for clean test exit

### Fixed
- **Critical:** Bug where unknown senders (trust=null) could use dangerous tools
- JSON parsing errors now caught with proper 400 response

### Security
- Admin endpoints (`/contacts`, `/audit`) now require authentication
- Default: localhost-only access
- Set `WASP_API_TOKEN` environment variable for remote access
- Bearer token or raw token supported in Authorization header
- SQL injection verified protected (parameterized queries)
- All trust × tool combinations tested

## [0.1.1] - 2026-01-28

### Added
- Initial public release
- SQLite storage with Bun/Node.js compatibility
- CLI commands: init, add, remove, list, check, log, serve, review, blocked
- HTTP API with rate limiting
- Moltbot plugin with message_received and before_tool_call hooks
- Trust levels: sovereign, trusted, limited
- Message quarantine system
- Audit logging

### Security
- Parameterized SQL queries prevent injection
- Rate limiting (100 requests/minute per IP)
- Tool-call interception for untrusted senders

## [0.1.0] - 2026-01-28

### Added
- Initial development release (pre-npm publish)

[Unreleased]: https://github.com/rickhallett/wasp/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/rickhallett/wasp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/rickhallett/wasp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/rickhallett/wasp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rickhallett/wasp/releases/tag/v0.1.0
