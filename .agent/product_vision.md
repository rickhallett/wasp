# Product Vision

The soul of this project. What are we building and why?

---

## Project Type

- [x] **Micro-software** — Market of 1, utility of 10. Too niche to be a startup. Built for joy.
- [x] **Boring plumbing** — Security layer, integrations, message filtering. Structural, not mathematical.

## Iteration Tolerance

- [x] **"Good enough" ships** — Perfect emerges through iteration.

---

## One-Liner

> Security whitelist layer for agentic AI — blocks prompt injection by filtering untrusted input before it reaches your agent.

---

## Who Is This For?

- Developers running personal AI agents (Moltbot, Clawdbot, etc.)
- Anyone with an AI that reads external messages (WhatsApp, Telegram, email)
- Teams needing to control who can trigger agent actions

---

## Core Experience

What should using this *feel* like?

- **Simple**: `wasp add`, `wasp check`, done
- **Invisible when working**: messages flow through, trusted senders get through
- **Protective**: strangers and spam never reach your agent
- **Transparent**: clear audit log of all decisions

---

## Non-Goals

What are we explicitly NOT building?

- Identity verification (we trust the upstream platform's sender authentication)
- Public-facing agent security (this is for personal/team agents with known contacts)
- Complete prompt injection solution (we're one layer in defense-in-depth)
- Enterprise-scale multi-tenant SaaS

---

## Success Looks Like

How do we know we've won?

- Zero prompt injections from unknown senders
- Under 1ms latency overhead for whitelist checks
- Seamless Moltbot plugin integration
- Developers trust wasp to protect their agents
