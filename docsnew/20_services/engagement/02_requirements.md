# Requirements Catalogue — engagement (service)

**Anchored to:** [BRD §5](./01_brd.md#5-functional-areas) · [Master BRD §5.2.7](../../00_platform/02_master_brd/master_brd.md#527-engagement)

> See OQ-EN-00: service-ceiling resolution pending.

---

## FA-01 — Channel Routing

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-01-01 | In-app notification API | P0 | 1 |
| FR-EN-01-02 | Email send via SendGrid (or SES — OQ-EN-01) | P0 | 1 |
| FR-EN-01-03 | Push via FCM (Android) | P0 | 1 |
| FR-EN-01-04 | Push via APNS (iOS) | P0 | 1 |
| FR-EN-01-05 | SMS via Twilio (selective categories) | P1 | 2 |
| FR-EN-01-06 | Channel fallback rules (if push fails, fall back to in-app) | P1 | 1 |

## FA-02 — User Notification Preferences

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-02-01 | Prefs schema: channel × category × on/off | P0 | 1 |
| FR-EN-02-02 | Get / Update my prefs | P0 | 1 |
| FR-EN-02-03 | Default prefs per role | P0 | 1 |
| FR-EN-02-04 | "Pause all" toggle (e.g. exam day) | P1 | 1 |
| FR-EN-02-05 | Unsubscribe link processes (one-click) | P0 | 1 |

## FA-03 — Templates + i18n

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-03-01 | Versioned templates (Jinja-style) | P0 | 1 |
| FR-EN-03-02 | en + hi at launch | P0 | 1 |
| FR-EN-03-03 | Per-channel variants (push has shorter copy) | P0 | 1 |
| FR-EN-03-04 | Template variables — typed and validated | P0 | 1 |
| FR-EN-03-05 | Preview API | P1 | 1 |
| FR-EN-03-06 | A/B variant support | P2 | 2 |

## FA-04 — Delivery Tracking

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-04-01 | Sent / delivered / opened / clicked tracking | P0 | 1 |
| FR-EN-04-02 | Webhook from ESP (delivery + bounce) | P0 | 1 |
| FR-EN-04-03 | Bounce auto-suppression after 3 hard bounces | P0 | 1 |
| FR-EN-04-04 | Per-template + per-channel dashboards | P1 | 1 |

## FA-05 — Quiet Hours

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-05-01 | Per-user quiet hours config | P0 | 1 |
| FR-EN-05-02 | TZ-aware enforcement (IST default; user override) | P0 | 1 |
| FR-EN-05-03 | Priority override for critical (e.g. payment failure) | P0 | 1 |
| FR-EN-05-04 | Quiet mode "all" toggle | P1 | 1 |

## FA-06 — Community Threads (Phase 2)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-06-01 | Create thread (by topic) | P1 | 2 |
| FR-EN-06-02 | List threads (filter, sort) | P1 | 2 |
| FR-EN-06-03 | Thread detail + comments | P1 | 2 |
| FR-EN-06-04 | Subscribe / unsubscribe thread | P2 | 2 |

## FA-07 — Comments + Reactions + Reports

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-07-01 | Post comment | P1 | 2 |
| FR-EN-07-02 | Edit comment (within 5 min) | P2 | 2 |
| FR-EN-07-03 | Delete own comment | P1 | 2 |
| FR-EN-07-04 | React to a post/comment (limited set) | P1 | 2 |
| FR-EN-07-05 | Report a post/comment | P1 | 2 |
| FR-EN-07-06 | Auto-flag heuristics (Phase 2 ML in Phase 3) | P1 | 2 |

## FA-08 — Moderation Handoff

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-08-01 | Reports surface in web-admin queue | P1 | 2 |
| FR-EN-08-02 | Mod decision: keep / hide / remove + reason | P1 | 2 |
| FR-EN-08-03 | Author warned on repeated removals | P1 | 2 |
| FR-EN-08-04 | Author banned (admin) | P1 | 2 |

## FA-09 — Gamification

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-09-01 | XP awarded for events (configurable point values) | P1 | 1 |
| FR-EN-09-02 | Streak tracker (daily) | P1 | 1 |
| FR-EN-09-03 | Streak shield (1 missed day/calendar month grace) | P1 | 1 |
| FR-EN-09-04 | Badges (catalogue with unlock conditions) | P1 | 1 |
| FR-EN-09-05 | Award badge on condition met (event-driven) | P1 | 1 |
| FR-EN-09-06 | Streak-broken UX surface (notification) | P1 | 1 |
| FR-EN-09-07 | XP/streak history (paginated) | P2 | 2 |

## FA-10 — Leaderboards (Phase 2)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-10-01 | Daily / weekly leaderboard per exam | P2 | 2 |
| FR-EN-10-02 | Cohort leaderboard (institution scoped) | P2 | 2 |
| FR-EN-10-03 | Battle-derived ladder snapshot | P2 | 2 |
| FR-EN-10-04 | Refresh cadence (OQ-EN-03) | P2 | 2 |

## FA-11 — Broadcasts

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-11-01 | Admin compose broadcast (rich text) | P1 | 2 |
| FR-EN-11-02 | Target audience (all / role / cohort / tenant) | P1 | 2 |
| FR-EN-11-03 | Schedule (one-shot) | P1 | 2 |
| FR-EN-11-04 | Send / cancel | P1 | 2 |
| FR-EN-11-05 | Per-broadcast delivery metrics | P1 | 2 |
| FR-EN-11-06 | Fan-out 100k recipients < 5 min | P1 | 2 |

## FA-12 — NATS Event Ingestion

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-12-01 | Consume `quiz.session.completed` | P0 | 1 |
| FR-EN-12-02 | Consume `payment.invoice.failed` | P0 | 1 |
| FR-EN-12-03 | Consume `learning.kappa.paused` | P1 | 2 |
| FR-EN-12-04 | Consume `marketplace.session.completed` | P1 | 2 |
| FR-EN-12-05 | Consume `battle.match.completed` | P1 | 2 |
| FR-EN-12-06 | Idempotent on NATS delivery id | P0 | 1 |
| FR-EN-12-07 | Dead-letter queue for poison events | P0 | 1 |

## FA-13 — In-App Messaging (Phase 2)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-EN-13-01 | 1:1 thread between tutor and student | P2 | 2 |
| FR-EN-13-02 | Message send + read receipt | P2 | 2 |
| FR-EN-13-03 | Block user | P2 | 2 |
| FR-EN-13-04 | Report message | P2 | 2 |

## Cross-Cutting

Standard 10 FRs (health, OTel, OpenAPI, idempotency, etc.).
