# Anomaly Detection Integrations — Future Research

*Captured: 2026-01-29*

wasp currently provides static trust-based filtering. These integrations could add dynamic behavioral analysis to detect compromised accounts, unusual patterns, and sophisticated attacks.

---

## Tier 1: Direct Fit (Behavioral + API-first)

| Service | What It Does | Potential Integration |
|---------|--------------|----------------------|
| **[Castle.io](https://castle.io)** | Real-time behavioral signals, bot detection, risk scoring | Call on every check — get risk score alongside trust level |
| **[Sift](https://sift.com)** | ML fraud detection, account takeover prevention | Flag anomalous patterns per trusted sender |
| **[Fingerprint](https://fingerprint.com)** | Device/browser fingerprinting, 99.5% accuracy | Tie sender identity to device — detect compromised accounts |

### Castle.io Deep Dive

Most promising for wasp's use case. Their API:

```bash
POST https://api.castle.io/v1/filter
{
  "type": "$login",
  "user": { "id": "+447375862225" },
  "context": { "ip": "...", "headers": {...} }
}

# Returns
{
  "risk": 0.23,
  "signals": { "bot_behavior": false, "impossible_travel": true },
  "policy": { "action": "challenge" }
}
```

**Integration concept:**
- Wrap Castle calls inside the `/check` endpoint
- Return `{ allowed: true, trust: "trusted", risk: 0.23, signals: {...} }`
- Plugin makes smarter decisions (trusted but high-risk = warn sovereign)

**Pricing:** ~$500/mo base, scales with volume. Business/Enterprise tier feature.

---

## Tier 2: Bot/Abuse Protection

| Service | What It Does | Potential Integration |
|---------|--------------|----------------------|
| **[DataDome](https://datadome.co)** | Bot mitigation, credential stuffing protection | Protect wasp HTTP API from abuse |
| **[Cloudflare Bot Management](https://cloudflare.com)** | Edge-level bot scoring | Free tier useful, paid for serious protection |
| **[Arkose Labs](https://arkoselabs.com)** | Fraud deterrence, challenge-based | For suspicious check patterns |

---

## Tier 3: Observability + Alerting

| Service | What It Does | Potential Integration |
|---------|--------------|----------------------|
| **[Datadog](https://datadoghq.com)** | APM + anomaly detection on metrics | Alert when check patterns deviate |
| **[Honeycomb](https://honeycomb.io)** | High-cardinality observability | Trace per-sender behavior over time |
| **[PagerDuty](https://pagerduty.com)** | Incident response | Alert sovereign when anomaly detected |

---

## Build vs Buy Considerations

### Lightweight DIY Anomaly Detection

Could build simple heuristics without third-party:
- Message frequency spikes (10x normal rate)
- Time-of-day anomalies (trusted user suddenly active at 3am)
- Tool usage changes (user never used `exec`, suddenly hammering it)
- Geographic impossibility (if IP available)

**Pros:** No external dependency, no cost, privacy-preserving
**Cons:** Less sophisticated, maintenance burden, false positives

### Third-Party Integration

**Pros:** Battle-tested ML, continuous improvement, signals we can't collect
**Cons:** Cost, latency, data sharing concerns, vendor dependency

---

## Research Questions

1. What behavioral signals are available from Moltbot context? (IP, device, session?)
2. What's acceptable latency for a `/check` call? (10ms? 50ms? 100ms?)
3. Privacy implications of sharing sender data with third parties?
4. Could we offer both modes? (Privacy-first local heuristics vs cloud-enhanced detection)

---

## Next Steps (When Ready)

- [ ] Sign up for Castle.io free tier, test API
- [ ] Prototype risk score pass-through in check response
- [ ] Define alert thresholds and sovereign notification flow
- [ ] Consider as WaaSp Business/Enterprise tier feature

---

```
wasp
static trust today
tomorrow, patterns emerge
the hive learns to see
```
