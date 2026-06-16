# API Contract — engagement (service)

**Base URL:** `https://api.vidya.example/v1/engagement`
**Auth:** Bearer JWT; admin endpoints + admin RBAC + re-auth; S2S endpoints with peer auth.

---

## User — Notifications

### `GET /me/notifications`
Paginated in-app feed.
- **Query:** `cursor, unread_only?`
- **200:** `{ items: [...], unread_count, next_cursor }`

### `POST /me/notifications/{id}/read`
- **204**

### `POST /me/notifications/read-all`
- **204**

### `GET /me/prefs`
- **200:** `{ matrix: { channel: { category: bool } }, quiet_hours: { start, end, tz }, paused: bool }`

### `PUT /me/prefs`
- **Body:** updated matrix
- **204**

### `GET /unsubscribe?token=...` (public)
One-click unsubscribe from email link.
- **204** (idempotent)

---

## User — Gamification

### `GET /me/gamification`
- **200:** `{ xp, current_streak, longest_streak, shields_available, badges: [...], next_badge: {...} }`

### `GET /me/xp-history`
- **200:** paginated XP events (Phase 2).

### `GET /leaderboards/{scope}` (Phase 2)
- `scope`: `global-daily | exam-weekly | cohort-{id} | battle-elo`
- **200:** rankings.

---

## User — Community (Phase 2)

### `GET /threads`
- **Query:** `topic_id?, sort, cursor`
- **200:** list.

### `POST /threads`
- **Body:** `{ topic_id, title, body }`
- **200:** thread.

### `GET /threads/{id}`
- **200:** thread + comments (paginated).

### `POST /threads/{id}/comments`
- **Body:** `{ body }`
- **200:** comment.

### `POST /comments/{id}/react`
- **Body:** `{ kind: "like" | "helpful" | "agree" }`
- **204**

### `POST /comments/{id}/report`
- **Body:** `{ reason, comment? }`
- **204**

---

## User — Messaging (Phase 2)

### `POST /messages` { recipient_id, body }
### `GET /threads/dms` (1:1 list)
### `POST /messages/{id}/report`
### `POST /me/blocks/{user_id}`

---

## Internal — Service-to-Service

### `POST /internal/notify`
Other services trigger a notification.
- **Auth:** S2S
- **Body:** `{ user_id, category, template_key, params, hint_channels?, priority? }`
- **200:** `{ notification_id }`

### `POST /internal/events`
NATS bridge / direct invoke for testing.
- **Auth:** S2S
- **Body:** `{ event_type, payload, delivery_id }`
- **200:** `{ processed: bool }`

---

## Admin

### `POST /admin/broadcasts`
Compose + schedule a broadcast.
- **Auth:** admin + re-auth
- **Body:** `{ subject, body, audience: { all|role|cohort|tenant }, schedule_at? }`
- **200:** `{ broadcast_id }`

### `GET /admin/broadcasts`
- **200:** list with deliverability metrics.

### `POST /admin/broadcasts/{id}/cancel`
- **204**

### `GET /admin/templates`
- **200:** list.

### `PUT /admin/templates/{key}`
- **200:** updated template.

### `GET /admin/delivery-stats`
- **Query:** `template_key?, channel?, range?`
- **200:** stats.

---

## Webhooks (ESP → us)

### `POST /webhooks/sendgrid` (or SES)
- **Body:** ESP webhook payload
- **200:** ack
- Tracks delivered / opened / clicked / bounced / spam.

---

## Common

- `GET /health`, `GET /ready`
- OTel + structured logs
- Standard error shape

### Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `PREF_OPT_OUT` | 403 | User opted out of category |
| `QUIET_HOURS` | 409 | Send blocked by quiet hours (unless priority) |
| `RATE_LIMITED` | 429 | |
| `TEMPLATE_NOT_FOUND` | 404 | |
| `TEMPLATE_INVALID_VARS` | 422 | |
| `ESP_DOWN` | 503 | |
| `MODERATION_BLOCKED` | 403 | Comment auto-flagged |
