# Runbook — Adaptive Learning Platform

**Purpose**: actionable procedures for live operations. Read during incidents, not during retrospectives. Short, scannable, no narrative.

**Owners**: DevOps Lead (primary), Tech Lead (reviewer).
**Update cadence**: after every P1 incident, after every drill, at every sprint review.
**Authoritative PagerDuty + contact info**: [contacts.md](contacts.md) (mirror of PagerDuty; PagerDuty is the source of truth).

---

## When to use what

| Situation | Procedure |
|---|---|
| "Something broke after a deploy — do we roll back?" | [rollback.md](rollback.md) |
| "We rolled back but the old version is serving stale cache" | [cache_flush.md](cache_flush.md) (Step 2.5 of rollback) |
| "A feature needs to be disabled right now" | [feature_flag_kill_switch.md](feature_flag_kill_switch.md) |
| "JetStream messages dropped / consumer caught up but missed events" | [nats_dlq.md](nats_dlq.md) |
| "Did the deploy actually work end-to-end?" | [smoke_test.md](smoke_test.md) (`make smoke`) |
| "An incident just closed — what do we document?" | [pir_template.md](pir_template.md) |
| "Who do I page?" | [contacts.md](contacts.md) → PagerDuty |

---

## Not here yet — tracked and owned

| File | Owner | Due | Source |
|---|---|---|---|
| `mobile_expedited_review.md` | Mobile Leads | T-7 | [OI-02](../docs/06_gaps_resolution/Appendix_OpenItems_GapRegister_v1.2.md) — Apple/Google emergency review path when `min_ios_version` 426 has no replacement build |
| `stripe_regional_outage.md` | HoP + DevOps Lead | Before go-live | OI-03 — accepted-risk procedure |
| `sendgrid_outage.md` | HoP + DevOps Lead | Before go-live | OI-03 — AWS SES warm-standby switchover |
| `twilio_outage.md` | HoP + DevOps Lead | Before go-live | OI-03 — SMS→email fallback via `sms_channel_enabled=false` |
| `nats_partition.md` | DevOps Lead | Sprint 2 | Output of SPIKE-07 |
| `aurora_failover.md` | DevOps Lead | Sprint 3 | Validated by GAP-22 failover test |
| ~~`nats_dlq.md`~~ | ✅ landed Sprint 4 — see [nats_dlq.md](nats_dlq.md) | done | GAP-06 closure |

These files are listed so the team knows they are missing. Do not add content without the named owner's review.

---

## Authoritative cross-references

- **Rollback decision tree** — this runbook. Canonical version.
- **Delegation order + pre-authorised rollback scopes** — [docs/05_launch/03_DelegationOrder.md](../docs/05_launch/03_DelegationOrder.md).
- **Go-Live Checklist** — [docs/05_launch/01_GoLiveChecklist_AdaptiveLearningPlatform.docx](../docs/05_launch/01_GoLiveChecklist_AdaptiveLearningPlatform.docx).
- **Post-Launch Monitoring Plan** — [docs/05_launch/02_PostLaunchMonitoringPlan_AdaptiveLearningPlatform.docx](../docs/05_launch/02_PostLaunchMonitoringPlan_AdaptiveLearningPlatform.docx).
- **Gap Register v1.2** — [docs/06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx](../docs/06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx).

---

## Writing new procedures here

Format rules (non-negotiable — runbook readability is an SLO):

1. **One-sentence purpose at top.** If you can't say what the procedure is for in one sentence, it's two procedures.
2. **Numbered steps, present tense, imperative.** "Run X. Check Y. If Z, then …" — not "you should run X".
3. **Each step has an observable outcome.** The reader knows if the step worked.
4. **Decision points use tables, not prose.** "If A → do X. If B → do Y."
5. **Every external dependency is linked or named.** No "check the dashboard" without saying which dashboard.
6. **Max one page per procedure when printed.** If it's longer, split it.
7. **No narrative, no "why"**, no "as you know" — this is read under pressure.