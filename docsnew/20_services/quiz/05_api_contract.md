# API Contract — quiz (service)

**Base URL:** `https://api.vidya.example/v1/quiz`
**Auth:** Bearer JWT (validated via shared lib); internal endpoints accept S2S auth.
**Idempotency:** Required on `POST /sessions/.../answer` and `POST /sessions/.../submit`.

---

## Public — Session

### `POST /sessions`
Start a session.
- **Body:** `{ mode: "quick" | "focused" | "mock" | "pyq" | "revision", exam?, topic_ids?, blueprint_id?, n?, time_limit_sec? }`
- **200:** `{ session_id, first_item, total_items, time_limit_sec, mode, started_at_server }`
- **403** if rate-limited (concurrent session cap) or learning denies.

### `GET /sessions/{id}`
- **200:** session header (status, time_remaining_sec, current_item_seq).

### `GET /sessions/{id}/next-item`
- **200:** next item from server's ordered sequence (no answer key).
- **409 `SESSION_FINISHED`** if already submitted.

### `POST /sessions/{id}/answer`
Submit an answer to the current item.
- **Headers:** `Idempotency-Key: <uuid>`
- **Body:** `{ item_id, user_input, marked_for_review?: bool, time_ms_client?: int }` (client time advisory only)
- **200:** `{ resolution: { status, matched_count, total_count, per_part, evaluation_mode, evaluator_metadata }, server_time_ms: int }` (note: NO `marks` field)
- **409 `ALREADY_ANSWERED`** if same key + same item already answered (returns same payload).
- **400 `IDEMPOTENCY_REQUIRED`** if header missing.
- **503 `LEARNING_DOWN`** during outage; in Phase 2 queues for replay.

### `PATCH /sessions/{id}/answer/{item_id}`
Revise an answer before submit.
- **Body:** `{ user_input }`
- **200:** updated resolution.

### `POST /sessions/{id}/pause`
- **204** — only allowed in modes that permit (Quick, Focused).

### `POST /sessions/{id}/resume`
- **200:** `{ current_item, time_remaining_sec, server_time_ms }`

### `POST /sessions/{id}/submit`
Finalises session.
- **Headers:** `Idempotency-Key`
- **200:** `{ submitted_at_server, results_url }` (results then fetched separately to keep submit lean).
- Idempotent.

### `POST /sessions/{id}/abandon`
- **204**

### `GET /sessions/{id}/results`
Detailed results — per-item correctness, time, explanation, breakdown.
- **200:** rich payload.

### `GET /sessions`
List my sessions (paginated, cursor).
- **Query:** `mode?, status?, from?, to?, cursor`
- **200:** list.

### `GET /sessions/in-progress`
- **200:** continue-where-left-off list.

### `POST /items/{item_id}/flag`
Report a problem (forwards to learning).
- **Body:** `{ reason, comment? }`
- **204**

---

## Internal — Service-to-Service

### `POST /internal/battle/score`
Battle delegates per-response scoring.
- **Auth:** S2S
- **Body:** `{ session_ctx, item_id, user_input, scoring_profile_id }`
- **200:** `{ resolution, marks }` (battle gets marks because battle owns its own scoring profile)

### `POST /internal/offline-sync`
Mobile offline practice sync.
- **Auth:** Bearer (user)
- **Body:** `{ session_batch: [{ session_id_local, mode, started_at, items: [{ item_id, user_input, time_ms }], finished_at }] }`
- **200:** `{ reconciled: [{ session_id_local, server_session_id, resolutions: [...], readiness_delta }] }`
- Idempotent at session_id_local level.

---

## Common

- `GET /health`, `GET /ready`
- OTel + structured logs
- Error shape `{ code, message, details, request_id }`
- Cursor pagination

### Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `IDEMPOTENCY_REQUIRED` | 400 | Missing header |
| `SESSION_NOT_FOUND` | 404 | |
| `SESSION_FINISHED` | 409 | Already submitted/abandoned |
| `LEARNING_DOWN` | 503 | Resolution caller failed |
| `RATE_LIMITED` | 429 | Too many sessions/answers |
| `MODE_NOT_ALLOWED` | 403 | E.g. pause on mock |
| `BLUEPRINT_NOT_FOUND` | 404 | |
| `ALREADY_ANSWERED` | 409 | Idempotent dup |
| `INVALID_INPUT` | 422 | Bad payload |
