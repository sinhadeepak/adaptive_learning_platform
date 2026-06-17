# Requirements Catalogue — battle (service)

**Anchored to:** [BRD §5](./01_brd.md#5-functional-areas) · [Master BRD §5.2.4](../../00_platform/02_master_brd/master_brd.md#524-battle)

> Most P0/P1 deliverables are Phase 2; Phase 1 is foundation only.

---

## FA-01 — Matchmaking

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-01-01 | Player joins matchmaking with topic + difficulty band | P1 | 2 |
| FR-BT-01-02 | Server returns ticket (poll or WS subscribe) | P1 | 2 |
| FR-BT-01-03 | Pool by exam + difficulty band ± rating window | P1 | 2 |
| FR-BT-01-04 | Widen tolerance every 5 s wait | P1 | 2 |
| FR-BT-01-05 | Cancel matchmaking (player abandons) | P1 | 2 |
| FR-BT-01-06 | Timeout after 60 s — refund attempt | P1 | 2 |
| FR-BT-01-07 | Bot opponent on low-traffic timeout (Phase 3) | P2 | 3 |

## FA-02 — WebSocket Session

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-02-01 | WS endpoint accepts JWT in upgrade header | P1 | 2 |
| FR-BT-02-02 | Per-connection rate limit | P0 | 2 |
| FR-BT-02-03 | Ping/pong every 15 s | P0 | 2 |
| FR-BT-02-04 | Message protocol versioned + JSON | P0 | 2 |
| FR-BT-02-05 | Server graceful shutdown drains active sessions (≤ 60 s) | P0 | 2 |
| FR-BT-02-06 | Reconnect resumes same session within grace | P0 | 2 |
| FR-BT-02-07 | Message size cap 4 KB | P0 | 2 |

## FA-03 — Question Fanout

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-03-01 | Both players see same item simultaneously (< 50 ms skew) | P1 | 2 |
| FR-BT-03-02 | No answer key in client payload | P0 | 2 |
| FR-BT-03-03 | Item count per battle = 5 (configurable per OQ-BT-05) | P1 | 2 |
| FR-BT-03-04 | Item time budget enforced server-side | P1 | 2 |

## FA-04 — Answer Acceptance + Race Scoring

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-04-01 | Answer submission via WS message | P1 | 2 |
| FR-BT-04-02 | Server delegates scoring to quiz `/internal/battle/score` | P1 | 2 |
| FR-BT-04-03 | First correct gets bonus points | P1 | 2 |
| FR-BT-04-04 | Ties broken by server-timestamp (ms) | P1 | 2 |
| FR-BT-04-05 | Late answer (after own item time budget) → 0 | P1 | 2 |
| FR-BT-04-06 | Both players notified of outcome after both answer (or time out) | P1 | 2 |

## FA-05 — Disconnect + Reconnect

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-05-01 | Disconnect detected via missed pings | P0 | 2 |
| FR-BT-05-02 | 30 s grace for reconnect | P0 | 2 |
| FR-BT-05-03 | Reconnect with same ws auth resumes | P0 | 2 |
| FR-BT-05-04 | Grace expired → forfeit; opponent wins | P1 | 2 |
| FR-BT-05-05 | Forfeit rating penalty mild (smaller than legit loss) | P1 | 2 |
| FR-BT-05-06 | Excessive forfeit detection (5/day → warning) | P2 | 2 |

## FA-06 — Anti-Cheat

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-06-01 | Server holds answer key | P0 | 2 |
| FR-BT-06-02 | Rate limit answers per player per second | P0 | 2 |
| FR-BT-06-03 | Tab-switch detection via client signal (Phase 2 extension) | P1 | 2 |
| FR-BT-06-04 | Suspicious-speed flag (< 200 ms answers) | P1 | 2 |
| FR-BT-06-05 | Per-user anomaly counter; soft ban at threshold | P2 | 2 |

## FA-07 — Rating + Ladder

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-07-01 | Glicko-2 rating per user (OQ-BT-01) | P1 | 2 |
| FR-BT-07-02 | Rating update post-battle (atomic with battle close) | P1 | 2 |
| FR-BT-07-03 | Per-exam separate rating | P1 | 2 |
| FR-BT-07-04 | Daily / weekly leaderboard snapshot | P2 | 2 |

## FA-08 — Replay + History

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-08-01 | Battle log stored | P1 | 2 |
| FR-BT-08-02 | Replay reconstructs sequence client-side | P1 | 2 |
| FR-BT-08-03 | List my recent battles | P1 | 2 |

## FA-09 — Leaderboards

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-09-01 | Per-exam daily/weekly | P2 | 2 |
| FR-BT-09-02 | Snapshot at midnight (per exam TZ) | P2 | 2 |
| FR-BT-09-03 | Cohort scoping (Phase 3) | P2 | 3 |

## FA-10 — XP/Badge Events to engagement

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-BT-10-01 | Emit `battle.match.completed` to NATS | P1 | 2 |
| FR-BT-10-02 | Emit `battle.rating.updated` | P1 | 2 |
| FR-BT-10-03 | Idempotent delivery id | P0 | 2 |

## Cross-Cutting

Standard 10 FRs.
