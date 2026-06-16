# API Contract — battle (service)

**Base URL:** `https://api.vidya.example/v1/battle`
**WS URL:** `wss://battle.vidya.example/v1/battle/ws`

---

## REST

### `POST /matchmake`
Enter matchmaking pool.
- **Body:** `{ exam, topic_id?, difficulty_band?: "easy"|"medium"|"hard"|"any" }`
- **200:** `{ ticket_id, expires_at }`

### `GET /matchmake/{ticket}`
Poll status.
- **200:** `{ status: "waiting" | "matched" | "expired" | "cancelled", ws_url?, session_id?, ws_token? }`

### `DELETE /matchmake/{ticket}`
Cancel.
- **204**

### `GET /history`
My recent battles.
- **200:** paginated.

### `GET /sessions/{id}/replay`
Battle log for replay.
- **200:** ordered events.

### `GET /leaderboard?period=daily&exam=neet`
- **200:** rankings (Phase 2).

---

## WebSocket Protocol (v1)

Connect: `wss://battle.vidya.example/v1/battle/ws?session_id={id}&token={ws_token}`

JSON messages. All messages have `{ type, ts_server_ms, ...payload }`.

### Server → Client

| `type` | Payload | When |
|---|---|---|
| `match_found` | `{ session_id, opponent_meta }` | After matchmaking pair |
| `question` | `{ item, time_budget_ms, q_seq, time_budget_started_at_ms }` | Each round |
| `round_result` | `{ q_seq, my: { status, marks }, opponent: { status, marks }, time_taken_ms }` | After both answer or timeout |
| `battle_end` | `{ session_id, winner_user_id?, my_total, opponent_total, rating_delta }` | End of battle |
| `opponent_disconnected` | `{ grace_seconds }` | Opponent dropped |
| `opponent_forfeited` | `{}` | Grace expired |
| `error` | `{ code, message }` | |
| `pong` | `{}` | Heartbeat |

### Client → Server

| `type` | Payload | When |
|---|---|---|
| `answer` | `{ q_seq, item_id, user_input, idempotency_key }` | Player submits |
| `tab_switch` | `{ q_seq, at_ms }` | Phase 2 anti-cheat signal |
| `ping` | `{}` | Heartbeat |
| `quit` | `{ reason }` | Player quits explicitly |

### Heartbeat

- Server sends `pong` in response to client `ping`.
- Server also pushes ping every 15 s.
- Missed 2 pings → disconnect.

### Errors

| Code | Meaning |
|---|---|
| `BATTLE_NOT_FOUND` | Session unknown |
| `BATTLE_FORFEITED` | Grace expired |
| `BATTLE_FINISHED` | Already over |
| `INVALID_ANSWER` | Schema failed |
| `RATE_LIMITED` | Too many messages |
| `IDEMPOTENCY_REQUIRED` | Missing idempotency_key |
| `OPPONENT_GONE` | Final after grace |

---

## Service-to-Service

### `POST /internal/result`
Used internally to update engagement.
- Triggered by battle service itself; published also to NATS.

---

## Common

- `GET /health`, `GET /ready`
- OTel + structured logs
- WS metrics: connection count, message rate, p99 ack latency
