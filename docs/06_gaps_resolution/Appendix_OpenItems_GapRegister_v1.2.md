# Appendix — Open Items from Fourth-Pass Review

**Applies to**: [Gap Resolution Register v1.2](GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx)
**Date**: April 2026
**Status**: Informational appendix — not a v1.3. Items below are to be tracked in Sprint 1 backlog, the Runbook, or accepted-risk documents rather than added to the register.

The three prior register versions (v1.0, v1.1, v1.2) converged cleanly. A fourth-pass review surfaced five residual items, each small enough that it does not merit a formal register entry but should be visible to the team. Each item has a proposed owner and a proposed landing place.

---

## OI-01   Enforcement mechanism for GAP-27 backward-compatibility rule

**Problem**
GAP-27 commits "no breaking API changes for Phase 1" and introduces `X-Client-Version`. The rule is an aspiration without a mechanism. After Sprint 3 the rule is likely to decay — an engineer in a hurry will rename a JSON field.

**Recommendation**
| Action | Owner | Landing place |
|---|---|---|
| Add a contract test job to CI that asserts response shapes against an `openapi/phase1.yaml` reference committed at MVP freeze | BE Lead Python | `.github/workflows/contract-tests.yml` |
| Add PR template checklist item: "☐ No breaking API changes OR a 2-sprint deprecation notice is filed in `docs/adr/`" | Tech Lead | `.github/PULL_REQUEST_TEMPLATE.md` |
| Open STU-REQ-60 for backward-compatibility enforcement | Head of Product | User Stories v2.2 |

**Severity**: Low. **Due**: End of Sprint 2.

---

## OI-02   App Store emergency coordination for `min_ios_version` 426 dead-end

**Problem**
GAP-27 specifies an HTTP 426 Upgrade Required response when a client version falls below `min_ios_version`. Apple's App Store review takes 1–7 days. If a security bug requires an immediate forced upgrade, the replacement build may not yet be published — clients receive 426 with no available upgrade.

**Recommendation**
| Action | Owner | Landing place |
|---|---|---|
| Document Apple expedited review request process in Runbook | Mobile Lead (iOS) | `runbook/mobile_expedited_review.md` |
| Add paragraph to Go-Live Runbook: "If a critical vulnerability requires forced upgrade and the replacement build is not yet approved, serve HTTP 200 with a modal 'Please update' rather than 426. Switch to 426 only after replacement build is live in both stores." | DevOps Lead | Go-Live Runbook §I |
| Confirm Google Play emergency review process is equivalent | Mobile Lead (Android) | Same section |

**Severity**: Low (edge case). **Due**: Before T-7 review.

---

## OI-03   Third-party vendor failover undefined

**Problem**
GAP-16 added channel flags (push off → email, SMS off → email). But:
- No backup payment processor for a Stripe regional outage (Phase 1 accepts 100% Stripe dependency).
- No secondary email provider for a SendGrid outage.
- No fallback SMS provider for a Twilio outage.

For Phase 1 India scale (≤ 10K users, 99.5% uptime target) this is probably acceptable — but it should be an accepted risk, not an implicit assumption.

**Recommendation**
Publish a one-page **Vendor Risk Register** at `docs/05_launch/03_VendorRiskRegister.md`:

| Vendor | Role | Single point of failure? | Mitigation | Accepted? |
|---|---|---|---|---|
| Stripe | Payment processing | Yes | Feature flag `checkout_enabled=false` → show maintenance page. Manual refund SOP in Runbook. | Yes (Phase 1) |
| SendGrid | Transactional email | Yes | Outbound OTP + receipts switch to AWS SES if down > 30 min. SES account pre-provisioned but not active. | Pre-provisioned, warm-standby |
| Twilio | SMS OTP | Yes | OTP falls back to email delivery. `sms_channel_enabled=false`. | Yes (Phase 1) |
| FCM + APNs | Push | Partial (2 vendors) | If FCM fails, Android degrades to email. iOS unaffected. | Yes |

**Owner**: Head of Product + DevOps Lead
**Landing place**: New file `docs/05_launch/03_VendorRiskRegister.md`
**Severity**: Medium. **Due**: Before go-live.

---

## OI-04   GAP-25 flag-logging log-volume budget unchecked

**Problem**
GAP-25 request middleware logs 6+ flag fields per request. At ~1000 req/s sustained (500 VU × 2 rps/VU) = 6000 extra log fields per second. Loki / Elasticsearch ingestion cost scales roughly linearly with field count. The Infrastructure Design cost model caps at $2–3.5K/mo; a 10–15% ingest increase was not accounted for.

**Recommendation**
| Action | Owner | Landing place |
|---|---|---|
| Measure log ingestion rate in staging before Sprint 3 load tests | DevOps Lead | Load test report |
| If > 10% cost increase observed, move flag logging from per-request to sampled (1-in-10) for non-auth paths | DevOps Lead + BE Leads | `app/middleware/flag_logging.py` add `LOG_SAMPLE_RATE` env var |
| Add line item to Infrastructure Design cost model: "Observability ingest: +$150/mo (flag logging)" | DevOps Lead | Infrastructure Design §9 |

**Severity**: Low (cost, not correctness). **Due**: After first LT-SEARCH-03 run.

---

## OI-05   GAP-29 Drill 2 does not exercise 5th delegate escalation

**Problem**
GAP-29 Drill 2 tests the delegation chain up to Tech Lead. The GAP-18 v1.2 amendment added a 5th delegate (Staff Engineer / VP Engineering) for blackout windows. That branch is never drilled — if the 5th delegate is only reached during a real blackout incident, the chain is untested when it matters most.

**Recommendation**
Add **Drill 2b: Blackout Escalation** to GAP-29 drill schedule.

| Drill 2b | Spec |
|---|---|
| Setup | Primary + Secondary + Tech Lead + DevOps Lead + CTO all marked as "do not respond." |
| Trigger | Simulated P1 alert on `quiz-service`. |
| Expected | Escalation reaches 5th delegate within 10 minutes of initial alert. 5th delegate acknowledges and would execute rollback if real. |
| When | T-14 days, same session as Drill 1 + Drill 2 (additional 15 minutes). |
| Owner | CTO observes. Tech Lead validates PagerDuty paths. |
| Pass criterion | 5th delegate reachable on registered contact within the 10-min window. |

**Severity**: Medium (untested escalation path). **Due**: T-14 days (next drill cycle).

---

## Closure

None of OI-01 through OI-05 blocks Sprint 1 kick-off. They are tracked here so the team does not lose sight of them during execution.

| # | Landing | Owner | Due |
|---|---|---|---|
| OI-01 | STU-REQ-60 + CI job + PR template | Tech Lead + BE Lead Python | End Sprint 2 |
| OI-02 | Runbook §I paragraph | DevOps Lead + Mobile Leads | T-7 review |
| OI-03 | New `docs/05_launch/03_VendorRiskRegister.md` | HoP + DevOps Lead | Before go-live |
| OI-04 | Sample-rate env var + cost model footnote | DevOps Lead | Post-LT-SEARCH-03 |
| OI-05 | Drill 2b added to GAP-29 schedule | Tech Lead | T-14 drill cycle |