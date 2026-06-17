# ADR-0027 — Real-time Battle service (`alp-battle`)

- **Status:** Proposed (2026-05-11)
- **Deciders:** Platform team
- **Supersedes:** none
- **Related:** ADR-0001 (service boundaries), ADR-0005 (consolidation halt)

## Context

ADR-0005 froze service count at five (identity, learning, quiz,
engagement, payment) plus the marketplace addition for tutor/creator
flows. Until F7, all student-facing features fit inside that boundary
because they're request/response over HTTP.

Battle Mode breaks that pattern:

- **Live sync.** Two or more players see the same question at the same
  moment, see opponents' progress in real-time, and the result depends
  on a 30-second timer that all participants share.
- **Server-authoritative state.** Cheating prevention requires the
  server to be the source of truth for question delivery + scoring;
  clients send picks only.
- **Long-lived connections.** WebSocket sessions can live for ~5 min
  through a full match; matchmaking holds a player in a queue for
  ≤2 min.
- **Different scaling shape.** A handful of long-lived WS connections
  per host vs. thousands of short HTTP requests — different tuning,
  different metrics, different deploy cadence.

Stuffing this into one of the five existing services would mean either
making `quiz` long-lived-connection-aware (changing its scaling and
deploy story) or building a fragile in-process actor system. Neither
serves the Battle product or the rest of the platform well.

## Decision

Introduce a sixth deployable: **`alp-battle`**, a Go service dedicated
to the real-time battle gameplay loop.

### Surface

- **HTTP** — `/healthz`, `/v1/matches/:id` read (status snapshot).
- **WebSocket** — `wss://alp.app/battle/v1/socket?token=<jwt>`.

### Stack

| Layer | Choice | Why |
|---|---|---|
| Language | Go | Deterministic latency, established ops pattern (Quiz). |
| HTTP | stdlib `net/http` | Matches Quiz; no framework lock-in for the small surface. |
| WS | `gorilla/websocket` | Mature, battle-tested, simple. |
| Storage | Postgres (same cluster, separate DB `battle`) | Operational simplicity in v1; Redis for presence in F8a. |
| Rating | Glicko-2 (per-exam) | Better than Elo for sparse-match populations; spec is ~200 LOC. |
| Auth | Shared HMAC JWT secret (same as identity) | No round-trip on every WS message; signature suffices. |

### Schema (`battle_schema`)

- `matches(id, mode, exam_id, blueprint_id, status, invite_code,
  created_at, started_at, ended_at)`
- `match_players(match_id, user_id, joined_at, ready_at, final_score,
  final_rank, elo_before, elo_after)`
- `match_answers(match_id, user_id, question_idx, picked_idx, time_ms,
  is_correct, scored_at)` — server-authoritative.
- `elo(user_id, exam_id, rating, rd, volatility, n_matches,
  last_updated)` — Glicko-2 state per exam.
- `queue_snapshot(user_id, exam_id, elo_band, queued_at)` —
  crash-recovery only; in-memory queue is authoritative.

### Protocol

Every WS message is `{"t": "<type>", "p": <payload>}`. Types are
namespaced (`lobby.*`, `room.*`, `match.*`, `error`). Full enumeration
in [services/battle/internal/ws/protocol.go](../../services/battle/internal/ws/protocol.go).

### Matchmaking

- Public queue keyed by `(exam_id, elo_band)` where bands are 200pt
  wide.
- Match formed when 2–4 players occupy the same bucket within 30s.
- After 30s widen ±200; after 90s widen to ±∞.
- Private rooms: 6-char invite code, 5-min expiry, owner can `room.ready`
  alone (no auto-fill).

### Composition

- 10 questions, 30s each. Centred on average room rating.
- Reuses the existing `learning.exam_blueprints` composer with
  `kind='BATTLE'`. Server pulls + caches the item set up front so
  every player sees identical questions in identical order.

### Scoring

- Per-question: `max(0, 1000 - time_ms / 30)` if correct, else 0.
- Total: sum across 10 questions. Ties broken on total time.
- Glicko-2 update at match end; one match = one rating period
  (`τ = 0.5`).

### Connection lifecycle

- WS handshake includes JWT in `?token=` (works for browsers that
  forbid custom headers on WS upgrade). Mobile may send via
  `Authorization: Bearer …`.
- 5s heartbeat; missed answer = 0. Rejoin grace = 30s; after that the
  player is scored on what they sent and the match continues.
- Single connection per user — connecting again closes the prior one.

### Operability

- Port `38012` in local; `:80/battle/*` in staging+ (nginx WS-aware).
- Postgres database `battle` (separate from quiz to keep heat
  isolated).
- Sticky-session load balancing required once we deploy >1 replica;
  v1 is single-replica.
- Metrics: queue depth per band, match duration, ELO drift per exam.

## Rollout

| Sprint | Scope |
|---|---|
| **S60 (this sprint)** | Service skeleton, schema, Glicko-2, WS auth + protocol types, `lobby.queue` echo, Battle landing UI shell, nginx + compose wiring. **Ship the foundation runnable but not playable.** |
| S61 | Matchmaker (real queue + bucket widening). |
| S62 | Match engine (question delivery, timer, scoring, ELO update). |
| S63 | Result screen + history view; first playable end-to-end. |

## Alternatives considered

- **Extend Quiz to host WS.** Rejected: Quiz is request/response-tuned,
  scales by sharding stateless workers behind LB; pulling in a
  stateful actor system muddies its scaling story.
- **Use a third-party realtime service (Pusher/Ably).** Rejected:
  cost at scale + dependency on third-party SLO + harder to make
  server-authoritative when scoring lives on their side.
- **Build on NATS request/reply.** Considered: NATS already exists.
  Rejected because matchmaking needs a long-lived stateful actor per
  match (timers, presence) which doesn't naturally fit pub/sub —
  we'd recreate gorilla/websocket on top of NATS for no win.

## Consequences

- ADR-0005 (consolidation) is amended: from "five services" to "five
  services + one realtime service when the realtime requirement
  arises". Future stateless features still default to one of the
  five.
- New deploy artifact (`alp-battle`). Adds to ops surface area but
  the contract is small (1 WS endpoint).
- Cross-service joins (e.g., friend's ELO on student profile page)
  are HTTP, not DB joins, per ADR-0001.
