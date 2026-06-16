# Business Requirements Document — engagement (service)

| | |
|---|---|
| **Service** | `services/engagement` |
| **Tech** | Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 · Alembic · NATS JetStream |
| **Schema** | `engagement_schema` (Aurora Postgres 15) |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.2.7](../../00_platform/02_master_brd/master_brd.md#527-engagement) |

> ⚠ **TOP-LEVEL OPEN QUESTION (OQ-EN-00):** This service exists **outside the ADR-0005 service ceiling of 6**. The Master BRD §5.2 explicitly flags this. The rebuild must resolve whether engagement folds into `learning` (notifications) + `marketplace` (community + reviews), or stays as a 7th service with a new ADR superseding ADR-0005. This doc pack scopes engagement as a standalone service for completeness; **the architectural resolution is out of scope for this pack**.

---

## 1. Purpose

The `engagement` service drives all **non-content user touchpoints**:
- Notifications (email + push + in-app + SMS) routed to user-preferred channels
- Community (threads, comments, reactions, reports)
- Gamification (XP, streaks, badges, leaderboards)
- Platform broadcasts (admin-driven)
- Event ingestion from peer services (NATS) to drive XP/streak/notif

When engagement goes down, users miss notifications and lose streak credit — both are perception-killers.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Channel routing** | in-app, email (SES/SendGrid), push (FCM/APNS), SMS (Twilio fallback) |
| **Notification preferences** | per-user channel × category matrix |
| **Templates** | i18n (en/hi launch) |
| **Delivery tracking** | sent/delivered/opened/clicked |
| **Quiet hours** | per-user TZ-aware throttling |
| **Community threads** | by topic |
| **Comments + reactions + reports** | with moderation queue handoff to web-admin |
| **Gamification** | XP awards · streak tracker (incl shield) · badges · achievements |
| **Leaderboards** | global + cohort + battle-derived |
| **Broadcasts** | platform-wide announcements (admin) |
| **NATS event ingestion** | consume `quiz.session.completed`, `payment.subscription.failed`, etc., to drive XP/notif |
| **In-app messaging** (Phase 2) | lightweight tutor↔student |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Email infra | SendGrid / SES (we wrap, don't run) |
| Live video sessions | marketplace + Daily.co |
| Subscription gating | each app via entitlement claim |

### 2.3 Scope by Phase

| Phase | engagement ships |
|---|---|
| **Phase 1 (M0–M6)** | Channel routing (in-app + email + push) · Templates · Prefs · Quiet hours · XP · Streak + shield · Badges · NATS ingestion · Quiet-hours · Notif centre |
| **Phase 2 (M6–M12)** | Community threads + comments + reports · Leaderboards · Broadcasts · In-app messaging (lightweight) · SMS channel · Advanced gamification |
| **Phase 3+** | Sentiment moderation · Achievement engine (complex chains) · Group messaging |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Backend Lead** | Tech owner | Architecture |
| **Product Owner** | Functional scope | AC approval |
| **Design Lead** | Template UX, tone | Content review |
| **Compliance** | Spam law, opt-in | Sign-off |
| **DevOps** | Provider integration | Cost/perf |
| **All other services** | Event emitters | NATS subjects |

## 4. Top Internal Journeys

| # | Journey | Trigger |
|---|---------|---------|
| 1 | Quiz complete → award XP + check streak + notify | NATS event |
| 2 | Failed-charge → notify user | NATS event |
| 3 | Broadcast launched → fan-out | Admin |
| 4 | Comment posted → moderation if flagged | User action |
| 5 | Streak shield consumed | Daily job |
| 6 | Leaderboard snapshot | Daily job |

## 5. Functional Areas

| Area | Description |
|------|-------------|
| FA-01 Channel Routing | in-app/email/push/SMS |
| FA-02 User Notification Prefs | matrix CRUD |
| FA-03 Templates + i18n | versioned, en/hi |
| FA-04 Delivery Tracking | sent/delivered/opened/clicked |
| FA-05 Quiet Hours | TZ-aware throttle |
| FA-06 Community Threads | browse + post |
| FA-07 Comments + Reactions + Reports | with moderation handoff |
| FA-08 Moderation Handoff | report queue → web-admin |
| FA-09 Gamification | XP, streak, shield, badges |
| FA-10 Leaderboards | global + cohort + battle |
| FA-11 Broadcasts | admin compose + fan-out |
| FA-12 NATS Event Ingestion | from peer services |
| FA-13 In-App Messaging (Phase 2) | lightweight |
| FA-XC | health/ready, OTel, OpenAPI, migrations |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-EN-01 | Perf | Notification send latency | p95 < 5 s |
| NFR-EN-02 | Perf | In-app feed read | p95 < 100 ms |
| NFR-EN-03 | Avail | Service uptime | 99.9% |
| NFR-EN-04 | Delivery | Push success rate (24h window) | ≥ 95% |
| NFR-EN-05 | Delivery | Email opens (campaign avg) | ≥ 20% (KPI) |
| NFR-EN-06 | Reliab | Streak job correctness | no double credit |
| NFR-EN-07 | Reliab | Streak shield logic | 1 missed day/calendar month |
| NFR-EN-08 | i18n | TZ correctness (IST default) | user override supported |
| NFR-EN-09 | Compliance | Unsubscribe in every marketing email | required |
| NFR-EN-10 | Compliance | India spam law + CAN-SPAM | reviewed |
| NFR-EN-11 | Compliance | DPDPA consent for marketing | required |
| NFR-EN-12 | Security | No PII in template variables passed to external providers | redaction |
| NFR-EN-13 | Cost | Per-tenant notification budget | enforced |
| NFR-EN-14 | Scalability | Fan-out 100k broadcast in < 5 min | required |
| NFR-EN-15 | Observability | Per-channel delivery dashboard | required |
| NFR-EN-16 | Reliability | Event ingestion exactly-once (NATS JetStream) | yes |
| NFR-EN-17 | Migration | Alembic up/down | required |
| NFR-EN-18 | API | OpenAPI 3.1 | required |

---

## 8. Constraints & Assumptions

- **C-EN-00** **Service-ceiling OQ** per ADR-0005 — see top of doc.
- **C-EN-01** Email via SendGrid (OQ-EN-01 — vs SES); push via FCM + APNS; SMS via Twilio.
- **C-EN-02** NATS JetStream for event ingestion + retries.
- **C-EN-03** All marketing email has unsubscribe link.
- **C-EN-04** Quiet hours respected (no push during quiet).
- **C-EN-05** Streak logic deterministic + idempotent.

### Assumptions
- **A-EN-01** SendGrid / SES provisioned by DevOps.
- **A-EN-02** FCM / APNS keys provisioned.
- **A-EN-03** NATS JetStream cluster up.

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-EN-01 | identity | user id, prefs storage location (TBD) |
| D-EN-02 | NATS JetStream | event ingestion |
| D-EN-03 | SendGrid / SES | email |
| D-EN-04 | FCM / APNS | push |
| D-EN-05 | Twilio | SMS |
| D-EN-06 | learning, quiz, battle, payment, marketplace | event sources |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-EN-01 | Spam complaints → email blocklisting | Med | High | Strict opt-in + unsubscribe + ESP best practices |
| R-EN-02 | Streak double-credit on duplicate event | Med | Med | Idempotent processing on NATS delivery id |
| R-EN-03 | Push notif during exam | Med | High | Quiet-hours config + per-service hint flag |
| R-EN-04 | LLM-cost-style provider runaway (SMS) | Low | Med | Per-tenant cap |
| R-EN-05 | Community moderation lag (offensive posts) | Med | High | Auto-flag heuristics + admin queue + SLA |
| R-EN-06 | Service-ceiling unresolved → architecture drift | High | Med | Resolve OQ-EN-00 in Phase 1 |

## 11. Success Criteria

engagement Phase 1 **Done** when:

1. All P0 stories shipped
2. NFR-EN-* verified
3. Notif delivery dashboard live
4. Quiet hours verified across TZs
5. Streak shield logic verified end-to-end (1 missed day/month)
6. NATS event ingestion exactly-once tested
7. OQ-EN-00 service-ceiling decision recorded as ADR

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-EN-00 | **Service-ceiling**: fold into learning + marketplace, or new ADR? | Architecture | Phase 1 Week 2 |
| OQ-EN-01 | Email provider: SendGrid vs SES | DevOps + Finance | Phase 1 Week 2 |
| OQ-EN-02 | Community moderation: rule-based vs ML classifier (Phase 2) | Product + ML | Phase 2 Week 4 |
| OQ-EN-03 | Leaderboard refresh: real-time vs daily snapshot | Product | Phase 2 Week 1 |
| OQ-EN-04 | In-app chat: build vs integrate (Stream / Sendbird) | Eng | Phase 2 Week 2 |
| OQ-EN-05 | Streak grace policy: 1/month vs 2/month vs paid-only | Product | Phase 1 Week 6 |
| OQ-EN-06 | Notification prefs: stored here or in identity | Architecture | Phase 1 Week 2 |
| OQ-EN-07 | Bulk-fan-out vs per-user queue tradeoff | DevOps | Phase 2 Week 4 |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Lead | _Pending_ | | |
| Product Owner | _Pending_ | | |
| Architecture | _Pending_ | (must resolve OQ-EN-00) | |
| Compliance | _Pending_ | | |
| QA Lead | _Pending_ | | |
