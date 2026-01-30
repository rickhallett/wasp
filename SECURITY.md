# Security Policy

This document describes wasp's security model, threat assumptions, and known limitations. We believe in being honest about what security tools can and cannot do.

> **Why this document exists:** A community member asked a fair question about what wasp actually protects against. Rather than hand-wave, we wrote this. Security through obscurity isn't security.

---

## Threat Model

### Who Are the Adversaries?

| Adversary Type | Motivation | Capability |
|----------------|------------|------------|
| **Strangers/Spam** | Opportunistic, automated | Low — mass messaging, generic prompts |
| **Social Engineers** | Targeted manipulation | Medium — researched, personalized attacks |
| **Prompt Injectors** | Hijack agent capabilities | Medium — crafted payloads in messages |
| **Targeted Attackers** | Data exfiltration, sabotage | High — may combine multiple vectors |
| **Insider Threats** | Abuse trusted access | High — legitimate access, malicious intent |

### What Are They Trying to Do?

- **Prompt Injection:** Embed instructions in messages that override your agent's behavior
- **Social Engineering:** Manipulate trusted contacts to forward malicious content
- **Data Exfiltration:** Extract sensitive information through agent responses
- **Capability Hijacking:** Make the agent execute commands, send messages, or access files
- **Reputation Attacks:** Cause your agent to say/do embarrassing things

### What's In Scope vs Out of Scope

| In Scope (wasp addresses) | Out of Scope (wasp does not address) |
|---------------------------|--------------------------------------|
| Unknown senders reaching your agent | Compromised trusted accounts |
| Strangers attempting prompt injection | Platform-level vulnerabilities |
| Blocking/limiting untrusted contacts | End-to-end encryption |
| Audit logging of all decisions | Authentication of users to platforms |
| Tool-call restrictions by trust level | Physical device security |

---

## Trust Boundaries

wasp sits between the messaging platform and your AI agent. Understanding what we trust vs verify is critical.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         TRUST BOUNDARY DIAGRAM                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────┐                                                    │
│   │  SENDER DEVICE  │ ◄── Physical security: OUT OF SCOPE               │
│   │  (Phone/PC)     │                                                    │
│   └────────┬────────┘                                                    │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                    │
│   │    PLATFORM     │ ◄── wasp TRUSTS this layer                        │
│   │  (WhatsApp/     │     Platform verifies sender identity             │
│   │   Telegram)     │     (phone number, account ownership)             │
│   └────────┬────────┘                                                    │
│            │                                                             │
│            │ Authenticated sender ID (e.g., +440123456789)               │
│            ▼                                                             │
│   ┌─────────────────┐                                                    │
│   │      WASP       │ ◄── wasp VERIFIES this                            │
│   │   (Whitelist)   │     Is this sender ID in the whitelist?           │
│   └────────┬────────┘     What trust level do they have?                │
│            │                                                             │
│     ┌──────┴──────┐                                                      │
│     │             │                                                      │
│     ▼             ▼                                                      │
│  ┌──────┐    ┌──────┐                                                    │
│  │ALLOW │    │ DENY │ → Logged, dropped (or quarantined)                │
│  └──┬───┘    └──────┘                                                    │
│     │                                                                     │
│     ▼                                                                    │
│  ┌─────────────────┐                                                     │
│  │    AI AGENT     │ ◄── Tool restrictions enforced here                │
│  │   (Moltbot)     │     based on sender's trust level                  │
│  └─────────────────┘                                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Explicit Trust Statement

> **wasp trusts WhatsApp, Telegram, Signal, and other platforms to correctly authenticate senders.**
>
> By the time a message reaches wasp, the platform has verified that the sender controls the claimed phone number or account. wasp does not re-verify identity — it checks the verified ID against your whitelist.

This is not a weakness — it's a design decision. Platforms invest enormous resources in authentication (SMS verification, biometric login, device attestation). Duplicating this would be impractical and likely less secure.

---

## Trust Levels Explained

### `sovereign` — Full Control

The owner of the agent. Typically just you.

**Implications:**
- All messages reach the agent
- All tool calls are permitted (exec, file write, message send)
- Can modify the whitelist itself
- Can access audit logs
- Can override rate limits

**Who should be sovereign:** Only you. Maybe a co-owner of the system.

### `trusted` — Full Agent Access

Friends, family, close colleagues.

**Implications:**
- All messages reach the agent
- All tool calls are permitted
- Cannot modify the whitelist
- Rate limiting still applies

**Who should be trusted:** People you'd give your house key to. People whose compromised account you'd accept as a calculated risk.

### `limited` — Read-Only Agent Access

Acquaintances, new contacts, monitoring.

**Implications:**
- Messages reach the agent with a trust warning injected
- Only "safe" tools are permitted (read-only, non-exfiltrating)
- Blocked tools: `exec`, `write`, `message`, `email`, filesystem modifications
- Higher scrutiny in audit logs

**Who should be limited:** New contacts you're evaluating. Business contacts. Anyone you're not sure about yet.

### `blocked` — No Access

Known bad actors, spam sources, or default for unknown contacts.

**Implications:**
- Message never enters the agent's context window
- Logged for audit purposes
- Optionally quarantined for later review (`wasp review`)
- No notification to sender

**Who should be blocked:** Spam numbers. Known problematic contacts. Anyone you explicitly don't want reaching your agent.

### Unknown Contacts

Anyone not in the whitelist defaults to `blocked`. Their messages are logged and optionally quarantined for review.

---

## Known Limitations

We believe in honest security documentation. Here's what wasp does NOT protect against:

### 1. Compromised Trusted Accounts

If a trusted contact's phone or account is hijacked, the attacker inherits their trust level.

**Mitigation:** Keep the whitelist minimal. Use `limited` trust generously. Regularly audit who has `trusted` or `sovereign` access.

### 2. Platform-Level Vulnerabilities

If WhatsApp has a bug that allows sender spoofing, wasp cannot detect it.

**Mitigation:** This is largely outside user control. Major platforms have strong security teams and bug bounty programs. The risk is low but non-zero.

### 3. Social Engineering of Trusted Contacts

An attacker might convince a trusted contact to forward a malicious message.

**Mitigation:** Tool-call interception helps here — even if injected instructions reach the agent, dangerous tools can be blocked. But responses may still leak information.

### 4. Response Exfiltration

A `limited` sender cannot trigger tool calls, but the agent's response might contain sensitive information.

**Mitigation:** Output filtering is on the roadmap. For now, `limited` senders should be treated as semi-trusted: they can't *act*, but they can *ask*.

### 5. Insider Threats

Someone you trusted who becomes malicious.

**Mitigation:** Regular whitelist audits. Principle of least privilege — don't grant `trusted` when `limited` is sufficient.

### 6. What About SMS Spoofing?

SMS spoofing is a real attack vector for raw SMS systems. However, wasp doesn't handle raw SMS — it receives messages from platforms (WhatsApp, Telegram, etc.) that have their own authentication layers on top of phone numbers.

When you receive a WhatsApp message from +440123456789, WhatsApp has verified that phone number is registered to that account. You're not trusting raw SMS; you're trusting WhatsApp's sender verification.

---

## Responsible Disclosure

If you discover a security vulnerability in wasp, please report it responsibly.

### How to Report

**Email:** security@getwasp.xyz

**GitHub:** Use [Security Advisories](https://github.com/rickhallett/wasp/security/advisories) for private disclosure.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### What to Expect

- Acknowledgment within 48 hours
- Initial assessment within 7 days
- We'll work with you on disclosure timing
- Credit in release notes (unless you prefer anonymity)

### Scope

In-scope:
- wasp core library (`@oceanheartai/wasp`)
- CLI tools
- HTTP API
- Official integrations

Out of scope:
- Third-party integrations we don't maintain
- Platform vulnerabilities (WhatsApp, Telegram, etc.)
- Social engineering attacks

---

## Recommendations

### For Personal Agents

1. **Keep the whitelist minimal.** Every entry is attack surface.

2. **Use `limited` trust generously.** It's not an insult — it's prudent security. Most contacts don't need full tool access.

3. **Regularly audit trusted contacts.** Run `wasp list` monthly. Remove contacts who no longer need access.

4. **Review quarantined messages.** Use `wasp review` to catch legitimate contacts you might want to add.

5. **Monitor audit logs.** Run `wasp log` periodically to spot unusual patterns.

6. **Don't share your sovereign contact.** The phone number with `sovereign` access should be known only to people who need to reach you as the system owner.

### For Team Deployments

1. **Separate sovereign access.** Only system administrators should have `sovereign` trust.

2. **Use `limited` for external contacts.** Business contacts, vendors, customers should default to `limited`.

3. **Implement approval workflows.** Use `wasp review` to vet new contacts before adding them.

4. **Log to external SIEM.** The audit log can be exported for security monitoring.

5. **Regular access reviews.** Quarterly review of the whitelist with team leads.

---

## Version

This document covers wasp v0.2.x.

Last updated: 2025-01-28

---

## Acknowledgments

Thanks to the community members who asked hard questions about our security claims. Good security documentation comes from honest critique.

If you have questions or concerns about this document, open an issue or reach out.
