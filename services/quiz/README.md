# quiz

Quiz service (Go) — session lifecycle, question serving, idempotent answer submission, scoring (STU-REQ-09..19).

## Surface

| Method | Path | Description |
|---|---|---|
| `POST` | `/quiz/sessions/start` | Create a session for `(userId, topicId, mode)`. Strategy chosen by `irt_model_enabled` flag. |
| `GET`  | `/quiz/sessions/{id}` | Full session state + item history (resume / review). |
| `GET`  | `/quiz/sessions/{id}/next` | Next question, or the in-flight unanswered item (resume). `done=true` once `targetCount` reached. |
| `POST` | `/quiz/sessions/{id}/answers` | Record `{itemIdx, answerIdx}`. Idempotent — first write wins (GAP-21 AC-05). |
| `POST` | `/quiz/sessions/{id}/submit` | Close the session; returns score. |

Session FSM: `IN_PROGRESS → SUBMITTED | EXPIRED`. TTL defaults to 90 min (GAP-10), configurable via `QUIZ_SESSION_TTL_MIN`. Expiry is enforced inline on `/next`, `/answers`, `/submit`, and `GET /quiz/sessions/{id}`.

## Run locally

```bash
# Bring up infrastructure
make dev

# Apply migrations + seed questions (3 topics × 5 questions, mixed difficulty)
make migrate svc=quiz

# Start the service
go run ./cmd/quiz
curl http://localhost:38011/health
```

End-to-end smoke:

```bash
SID=$(curl -s -X POST http://localhost:38011/quiz/sessions/start \
  -H 'content-type: application/json' \
  -d '{"topicId":"33333333-0000-0000-0000-000000000001","userId":"'"$(uuidgen)"'","mode":"PRACTICE"}' \
  | jq -r .sessionId)

curl -s "http://localhost:38011/quiz/sessions/$SID/next" | jq
curl -s -X POST "http://localhost:38011/quiz/sessions/$SID/answers" \
  -H 'content-type: application/json' -d '{"itemIdx":0,"answerIdx":1}' | jq
curl -s -X POST "http://localhost:38011/quiz/sessions/$SID/submit" \
  -H 'content-type: application/json' -d '{}' | jq
```

## Test

```bash
go test ./...
```

The integration tests (`internal/server/sessions_pg_test.go`) use the real Postgres at `QUIZ_DATABASE_URL`; they auto-skip if the DB is unreachable. Cleanup is per-test via `t.Cleanup`, so they coexist with manual seed data without bleeding state between runs.

## Migrations

Plain SQL files under `migrations/`, applied via the [golang-migrate](https://github.com/golang-migrate/migrate) library wrapped by `cmd/migrate`:

```bash
go run ./cmd/migrate up           # apply all pending
go run ./cmd/migrate version      # print current version
go run ./cmd/migrate down 1       # roll back one step
go run ./cmd/migrate force <ver>  # mark version as clean (recovery only)
```

## Configuration

All settings come from the environment (see [`.env.example`](../../.env.example)):

| Env var | Default | Notes |
|---|---|---|
| `QUIZ_PORT` | `8000` | HTTP listen port. Compose maps `38011`. |
| `QUIZ_DATABASE_URL` | `postgres://postgres:postgres@localhost:35432/quiz?sslmode=disable` | Must use `postgres://` scheme (not `postgresql://`) for `golang-migrate`. |
| `QUIZ_NATS_URL` | `nats://localhost:34222` | For flag invalidation. |
| `QUIZ_INSTITUTION_BASE_URL` | `http://localhost:38008` | Flag-fetch source. |
| `QUIZ_SESSION_TTL_MIN` | `90` | Session expiry, in minutes. |

## Lint

```bash
go vet ./...
gofmt -l -s .
```
