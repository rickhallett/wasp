# Code Review Checklist

Act as the Auditor. Review the code against these criteria:

---

## Architecture
- [ ] Follows patterns in `.agent/architecture.md`
- [ ] Business logic in correct layer (db.ts for data, cli/ for interface)
- [ ] No forbidden anti-patterns

## Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] No SQL injection vectors (parameterized queries only)
- [ ] Trust level checks where needed

## Quality
- [ ] Types are explicit (no `any`)
- [ ] Error handling at boundaries
- [ ] Tests cover new behavior
- [ ] No dead code

## Style
- [ ] Naming is clear and consistent
- [ ] Comments explain *why*, not *what*
- [ ] No unnecessary complexity
- [ ] Biome passes

---

If any box is unchecked, fix it before merge.
