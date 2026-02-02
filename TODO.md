# wasp — Launch TODO

*Chill cadence. Quality over speed.*

## Learn the Code

- [ ] Walk `src/cli.ts` → trace each command to database
- [ ] Read through all test files as specification
- [ ] Rebuild one small piece from scratch (audit logger?)
- [ ] Explain the architecture to HAL (teaching = learning)

## Deploy

- [ ] Push wasp-site to GitHub
- [ ] Deploy to Vercel
- [ ] Point wasp.xyz DNS to Vercel
- [ ] Verify OG image / social previews work

## Community Introduction

- [ ] **Hacker News** — "Show HN: wasp – security whitelist for agentic AI"
  - Write honest, concise post
  - Be around to answer questions
  - Don't oversell

- [ ] **Reddit** — r/LocalLLaMA or r/MachineLearning
  - Similar tone to HN
  - Focus on the problem being solved

- [ ] **Twitter/X** — Short demo
  - GIF or 30s video showing problem → solution
  - Tag relevant AI/agent accounts if natural

- [ ] **Discord communities** — Be helpful first
  - Clawdbot Discord
  - LangChain Discord  
  - AutoGPT Discord
  - Contribute genuinely, mention wasp when relevant

- [ ] **Blog post** — "How I Secured My AI Agent"
  - Dev.to or Hashnode
  - Practical tutorial, not marketing
  - Link to repo naturally

## Talk to People

- [ ] Find 3-5 people building agentic systems
- [ ] Ask about their security concerns (listen first)
- [ ] Share wasp if it fits their problem

---

## Roadmap

### Contact Management
- [ ] **gog integration for bulk import** — Bootstrap trusted list from Google Contacts via gog CLI; reduces cold-start friction for new installs
- [ ] **In-chat contact review workflow** — Sovereign approval flow via Moltbot; review quarantined senders without leaving the chat surface

### Defense in Depth
- [ ] **Cryptographic challenge for dangerous tools** — Secondary auth layer requiring signed token before high-risk tool execution; mitigates compromised trust entry attacks
- [ ] **Trust attestation lifecycle** — Periodic review prompts with optional TTL on trust grants; prevents stale entries accumulating privilege

### UX / Security
- [ ] **Sudo/elevated permissions for key operations** — Key assignment, generation, regeneration, and other sensitive operations should require elevated confirmation or sudo-style authentication

---

*Most important: genuine conversation > broadcast marketing*
