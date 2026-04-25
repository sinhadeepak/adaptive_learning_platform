# Delegation Order (GAP-18)

**Purpose**: name exactly who can make binding decisions when a production incident, rollback, or emergency flag-toggle is needed, and in what order they are reached. Eliminates ambiguity about "who can authorise X" during a live incident.

**Authority source**: CTO + Tech Lead (co-signed).
**Applies to**: Phase 1 launch window (Week 9 soft launch → Week 13 T+21 post-launch review). Renewed at each subsequent launch.
**Review cadence**: updated at every Drill 2 and Drill 2b (GAP-29). Any change requires CTO countersignature.

---

## 1. Five-level escalation chain

The chain is walked **in order**. The next level is only engaged if the previous level does not acknowledge within the acknowledgement window. No skipping.

| # | Role | Name | Primary contact | Secondary contact | Ack window |
|---|---|---|---|---|---|
| 1 | DevOps on-call (rotating) | _per PagerDuty roster_ | PagerDuty page | Slack `#incident-response` mention | 5 min |
| 2 | BE Tech Lead (Python) | _______________________ | _______________________ | _______________________ | 10 min |
| 3 | Tech Lead | _______________________ | _______________________ | _______________________ | 15 min |
| 4 | DevOps Lead | _______________________ | _______________________ | _______________________ | 20 min |
| 5 | Staff Engineer / VP Engineering (blackout window) | _______________________ | _______________________ | _______________________ | 30 min |

**Total worst-case reach time**: 80 min from first page to 5th delegate acknowledging.
**Target reach time**: ≤ 10 min via levels 1–2 on any ordinary incident.

Level 5 exists specifically for **blackout windows** (CTO + Tech Lead + DevOps Lead all unreachable — vacation, travel, personal leave overlapping). Drill 2b (per [OI-05](../06_gaps_resolution/Appendix_OpenItems_GapRegister_v1.2.md)) validates this level annually.

---

## 2. Pre-authorised rollback scopes

A named delegate may execute these actions **without additional approval** during an active incident. These are the powers the chain confers.

| Action | Authorised from level | Notes |
|---|---|---|
| `kubectl rollout undo deployment/<service>` on any Phase 1 service in staging or prod | Level 1+ | Always safe fallback; PIR required afterward |
| ArgoCD application manual sync rollback to previous revision | Level 1+ | Auto-sync is OFF per GAP-17; all syncs are manual anyway |
| Feature flag kill-switch toggle (via Super Admin panel or direct SQL + audit row) | Level 2+ | Payment / Auth / Quiz kill switches preauthorised; others require level 3 |
| Database failover (Aurora cluster promote reader) | Level 3+ | RTO target < 60s per GAP-22 |
| `kubectl scale deployment/<service> --replicas=0` (full service disable) | Level 3+ | Payment and Auth require level 4 |
| Route 53 DNS failover to maintenance page | Level 4+ | Full-service outage. CTO notified within 15 min of execution. |
| Cancel / halt in-flight deploy via ArgoCD or CI | Level 1+ | Always safe |
| Cache flush (Redis `FLUSHDB` on a specific db index) | Level 2+ | Runbook Step 2.5 per GAP-28. Requires cache key versioning bump in same action. |

**Explicitly NOT pre-authorised** (always require CTO sign-off regardless of level):
- Any `DROP`, `TRUNCATE`, or destructive schema change.
- Manual Stripe refund or subscription cancellation at scale.
- Public communications (Twitter/X, press, status page text beyond canned templates).
- Any action that touches user PII outside the Runbook's documented procedures.

---

## 3. On-call rotation (Phase 1 launch, Weeks 9–13)

### 3.1 Schedule template

Two parallel rotations during launch weeks:

- **Primary (student journey)**: DevOps + BE Python. Covers Auth, Profile, Quiz, Adaptive, Analytics, Content, Catalog, Search, Notification.
- **Secondary (payment + institution)**: BE Python with Payment / Institution domain expertise. Covers Stripe webhooks, subscription FSM, teacher dashboards.

| Week | Primary DevOps | Primary BE | Secondary BE | Tech Lead coverage |
|---|---|---|---|---|
| 9 (soft launch) | _______________________ | _______________________ | _______________________ | Full |
| 10 (full launch) | _______________________ | _______________________ | _______________________ | Full |
| 11 | _______________________ | _______________________ | _______________________ | Business hours |
| 12 | _______________________ | _______________________ | _______________________ | Business hours |
| 13 (PIR review) | _______________________ | _______________________ | _______________________ | Ad-hoc |

### 3.2 Shift boundaries

- Primary on-call: 24/7 during Weeks 9–10, business hours only from Week 11 onward.
- Shift length: 24 hours, handover at 09:00 IST.
- Compensation: time-in-lieu or on-call allowance per engineering norms.
- Handover ritual: 15 min sync at 09:00 IST covering overnight pages, open incidents, known degradations, planned maintenance.

### 3.3 Page conditions

PagerDuty fires a page to primary on-call for:

- Any P1 or P0 SLO breach (availability < 99.5%, p99 latency > 2× target).
- Failure of automated Aurora failover.
- NATS cluster partition alert.
- Stripe webhook failure rate > 5% over 5 min.
- Any `feature_flag_audit` row where `admin_user_id` is not in the pre-approved Admin list (audit anomaly).

### 3.4 Blackout window protocol

If the engineer rostered as primary on-call cannot respond (planned leave, illness, unreachable):

1. Rostered engineer notifies DevOps Lead ≥ 24 hours in advance (except emergencies).
2. DevOps Lead re-rosters or engages level-5 delegate for the duration.
3. PagerDuty roster is updated in real time — no informal handoffs.
4. If level 5 itself is unavailable: launch is deferred or a named external contractor is pre-authorised (to be arranged before any such blackout).

---

## 4. Drill validation schedule

| Drill | Purpose | When | Pass criterion |
|---|---|---|---|
| Drill 2 | Levels 1–3 reachable via PagerDuty | T-14 | All three ack within ack-window |
| Drill 2b | Level 5 reachable when 1–4 silent | T-14 (same session, +15 min) | Level 5 acks within 10 min of level 4 timeout |
| Drill 3 | Flag kill switch under 2 min (independent of chain) | T-7 | See ADR-0001 drill budget |
| Post-incident | Replay actual incident's escalation path | After every P1 | Every timing within expected window |

Failed drills trigger a re-roster or contact-update and re-run within 48 hours.

---

## 5. Sign-off

This delegation order is binding once signed below. Re-signature required annually or at any change of role.

| Role | Name | Signature | Date |
|---|---|---|---|
| CTO | _______________________ | _______________________ | _________ |
| Tech Lead | _______________________ | _______________________ | _________ |
| DevOps Lead | _______________________ | _______________________ | _________ |
| Head of Product | _______________________ | _______________________ | _________ |

**Effective**: upon all four signatures.
**Expires**: 12 months from effective date, or upon any signatory role change, whichever is earlier.

---

## 6. Cross-references

- Rollback decision tree: [Go-Live Checklist §VI](01_GoLiveChecklist_AdaptiveLearningPlatform.docx) and GAP-12 in Gap Register v1.2.
- Flag kill switch procedure: [ADR-0001](../adr/0001-feature-flag-platform.md) §Kill-switch drill budget.
- PIR template: Gap Register v1.2 GAP-30.
- Contact directory: PagerDuty (authoritative), mirrored in `runbook/contacts.md` for offline access.
