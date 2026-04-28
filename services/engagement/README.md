# alp-engagement

Consolidated service that absorbs `services/analytics/` and `services/notification/`.

Per [ADR-0005](../../docs/adr/0005-service-consolidation.md), this is the destination for:

- **analytics** → `engagement.analytics.*` (mastery / readiness / streak; durable consumer `analytics-quiz-completed`)
- **notification** → `engagement.notification.*` (in-app + email + push dispatch; durable consumers `notification-quiz-completed`, `notification-assignment-created`)

## State

**Sprint A**: skeleton — boots `/health` only.
**Sprint B**: modules move in; routers mount at `/analytics/*` and `/notifications/*`; durable consumer names preserved verbatim.

## Storage

Postgres DB `engagement` with two schemas:

- `analytics_schema` (mastery, readiness_topic, streak, milestones, processed_sessions)
- `notification_schema` (notifications, processed_events, push_tokens, notification_prefs_cache)

Each schema keeps its own `alembic_version` table via `version_table_schema=<schema>`.
