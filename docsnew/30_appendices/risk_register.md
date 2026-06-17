# Risk Register

**Status:** DRAFT v0.1 · 2026-05-27
**Anchored to:** Master BRD §8 · each surface's `01_brd.md` §10

Likelihood / Impact: **L = Low · M = Medium · H = High** · **Sev = L × I composite (low/med/high/critical)**

---

## Platform-Wide Top Risks

| ID | Risk | L | I | Sev | Owner | Mitigation | Status |
|----|------|---|---|---|-------|------------|--------|
| R-01 | Content seed unavailable at launch | M | H | High | Content + Eng | Pre-launch content sprint M-2; AI-assisted authoring fallback (Phase 2) | Open |
| R-02 | Adaptive engine under-performs vs heuristic baseline | M | H | High | ML | Maintain heuristic shadow scoring; A/B per cohort | Open |
| R-03 | Marketplace fraud (fake tutors) | M | H | High | Marketplace squad | Stripe Identity KYC + manual review + rating threshold | Open |
| R-04 | Stripe approval delayed | L | H | Med | Finance | Razorpay fallback prototype kept | Open |
| R-05 | Mobile App Store rejection | M | M | Med | Mobile | Pre-submission privacy review; staged rollout | Open |
| R-06 | Service-count breach (7 vs ADR-0005 ceiling of 6) | H | M | High | Architecture | Resolve OQ-EN-00 in rebuild Phase 1; fold engagement | **OPEN — PRIORITY** |
| R-07 | Design system drift (Aurora ↔ Vidya artefacts) | H | M | High | Design + FE | Single design tokens package; lint enforcement | Open |
| R-08 | LLM cost overruns | M | M | Med | Eng leadership | AI Gateway hard caps; per-tenant quotas; provider failover | Open |
| R-09 | Data residency for global expansion | L | H | Med | Architecture + Legal | Architecture supports multi-region; defer GDPR Phase 2 | Open |
| R-10 | Founder/PO bandwidth (clarity drift) | H | H | Critical | Tech Lead | This rebuild doc pack + weekly architecture review | **OPEN — MITIGATING NOW** |

## Service-Specific Top Risks (per BRD §10)

| Source | ID | Risk | Sev |
|--------|----|------|-----|
| identity | R-ID-01 | Refresh-token theft | Critical |
| identity | R-ID-02 | JWT signing key leak | Critical |
| identity | R-ID-04 | DDoS on login endpoint | High |
| learning | R-LR-01 | LLM provider outage | High |
| learning | R-LR-02 | Kappa drift → mass mis-eval | High |
| learning | R-LR-04 | Resolution contract leak | Critical |
| quiz | R-QZ-01 | Session state desync | High |
| quiz | R-QZ-04 | Answer-key exfiltration | Critical |
| battle | R-BT-01 | WS pod restart loses battles | High |
| battle | R-BT-03 | Cheating via DevTools / bot | High |
| marketplace | R-MK-02 | Booking inventory race → double-book | High |
| marketplace | R-MK-04 | Payouts incorrect | High |
| payment | R-PY-01 | Webhook delivered twice → double entitlement | High |
| payment | R-PY-04 | Refund issued to wrong account | Critical |
| engagement | R-EN-01 | Spam complaints → email blocklisting | High |
| engagement | R-EN-06 | Service-ceiling unresolved | Med (architectural) |

## App-Surface Risks

| Source | ID | Risk | Sev |
|--------|----|------|-----|
| web-student | R-WS-01 | Bundle bloat | Med |
| web-student | R-WS-03 | Quiz state desync (user mid-quiz) | High |
| mobile | R-MB-01 | App Store IAP-bypass rejection | High |
| mobile | R-MB-04 | Build pipeline brittle | High |
| web-portal | R-WP-01 | Editor perf on large items | High |
| web-portal | R-WP-02 | KYC rejection rate high | High |
| web-admin | R-WA-01 | Compromised admin account → mass data leak | **Critical** |
| web-admin | R-WA-03 | Feature flag mis-toggle | High |
| web-admin | R-WA-05 | Audit log tampered | **Critical** |

## Top-5 Critical Risks (Combined)

These are the items the team should track in a weekly risk standup:

1. **R-10 PO/Tech-Lead bandwidth + clarity drift** — the rebuild doc pack mitigates; weekly review keeps it from re-emerging.
2. **R-WA-01 Compromised admin account** — hardware MFA + IP allowlist + impersonation audit required.
3. **R-PY-04 Refund to wrong account** — 2-step admin confirm + audit.
4. **R-LR-04 Resolution contract leak (marks from learning)** — CI gate already specified.
5. **R-WA-05 Audit log tampered** — hash chain + S3 immutable copy.

## Quantified Risk Reserve

- Cost: 15–25% schedule buffer per surface WBS (already baked in).
- Schedule: Phase 1 launch target M6; realistic M7 with buffer; risk-adjusted M8.
- Reserve plan: if any "Critical" risk realizes, hold Phase 2 start to fix before scaling.
