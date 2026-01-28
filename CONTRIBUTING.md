# Contributing to wasp

Thanks for your interest in contributing! wasp is part of the Sandcastle Architecture — lightweight, transparent tools for agentic systems.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- Git

### Setup

```bash
git clone https://github.com/rickhallett/wasp.git
cd wasp
bun install
```

### Running Tests

```bash
bun test
```

### Linting

```bash
bun run lint        # Check for issues
bun run lint:fix    # Auto-fix issues
```

### Type Checking

```bash
bun run typecheck
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch** for your feature/fix: `git checkout -b feature/your-feature`
3. **Make your changes** with tests
4. **Run the checks**: `bun test && bun run lint && bun run typecheck`
5. **Commit** with a descriptive message (see below)
6. **Push** and open a Pull Request

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation only
- `style` — Formatting (no code change)
- `refactor` — Code change that neither fixes a bug nor adds a feature
- `test` — Adding or updating tests
- `chore` — Maintenance tasks

**Examples:**
```
feat(cli): add export command for whitelist backup
fix(plugin): handle missing sessionKey in context
docs: update API authentication examples
test: add concurrent session isolation tests
```

## Code Style

- We use [Biome](https://biomejs.dev/) for linting and formatting
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Line width: 100 characters

Run `bun run lint:fix` to auto-format before committing.

## Testing

- All new features should include tests
- All bug fixes should include a regression test
- Tests live alongside source files (`*.test.ts`)
- Run the full suite before submitting: `bun test`

**Test categories:**
- Unit tests — Individual functions
- Integration tests — Plugin hooks, HTTP endpoints
- Scenario tests — Simulated user workflows

## Pull Request Guidelines

- Keep PRs focused — one feature/fix per PR
- Update documentation if needed
- Add tests for new functionality
- Ensure CI passes before requesting review
- Link related issues in the PR description

## Security

If you discover a security vulnerability, please **do not** open a public issue. Instead, email the maintainers directly or use GitHub's private vulnerability reporting.

## Questions?

Open an issue with the `question` label, or reach out to the maintainers.

---

Built by Kai & HAL 🔴
