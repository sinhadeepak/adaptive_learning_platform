# Smoke test — golden-path post-deploy verification

**Purpose**: confirm the consolidated 5-service stack passes the end-to-end student journey before declaring a deploy successful. Per Sprint 14 / [ADR-0005](../docs/adr/0005-service-consolidation.md), this replaces the ad-hoc curl scripting that was used during the consolidation cutover.

**When to run**: after every `make dev` cycle on a fresh stack, after every backend deploy in staging, before announcing a release in `#deploys` in production.

**Time**: ~20 seconds end-to-end.

## Run

```
make smoke
```

Or directly: `bash scripts/smoke_test.sh`. Override URLs for staging/prod with env vars:

```
IDENTITY_URL=https://api.staging.alp.com \
LEARNING_URL=https://api.staging.alp.com \
ENGAGEMENT_URL=https://api.staging.alp.com \
QUIZ_URL=https://api.staging.alp.com \
PG_CONTAINER=<remote-postgres-bastion> \
make smoke
```

(Note: in staging+ where Postgres is Aurora, replace `PG_CONTAINER` with a `kubectl exec` proxy or run the SQL assertions via Aurora Data API. The current script assumes a local Docker Postgres container.)

## What it asserts (16 steps)

1. **Service health** — `/health` returns 200 on all 4 Python services (`alp-identity` 38001, `alp-learning` 38101, `alp-engagement` 38100) and the Go service (`alp-quiz` 38011).
2. **Identity → JWT** — `POST /auth/login` for `student@alp.dev` returns a token and the role is `STUDENT`.
3. **Learning → catalog** — `GET /catalog/exams` returns ≥4 exams; subjects/topics drill-down works.
4. **Quiz → real content** — `POST /quiz/sessions/start` + `GET /quiz/sessions/{id}/next` returns a question whose stem and choices contain neither `option [A-D] for Q\d+` nor `— Question \d+:` (the dummy seed patterns from the templated era).
5. **Quiz → answers + submit** — answer 3 questions correctly (using the stored `correct_idx` for each), submit the session, assert `status=SUBMITTED`.
6. **Engagement consumers fire** — within 3s of submit:
   - `analytics_schema.mastery` has a row for `(student, Mechanics)`.
   - `notification_schema.notifications` has a row keyed on `payload.sessionId`.
7. **Engagement HTTP read** — `GET /analytics/readiness/<userId>` returns `nTopics ≥ 1`.

Output is colour-coded; the script exits 0 on full pass, 1 on any assertion failure.

## What it does NOT cover

- **Stripe webhook flow** (`alp-payment` POST `/payment/webhook` → `payment.subscription.changed` → `alp-identity` premium-until update). Needs Stripe CLI fixtures; out of scope for the basic smoke. Track separately in payment-specific runbooks.
- **SSE leaderboard** — `GET /analytics/cohorts/{id}/leaderboard/stream` is event-driven; the smoke uses a single user with no cohort.
- **Hindi search** — `seed-hindi` populates the Hindi index; smoke tests English only.
- **AI / adaptive endpoints** — `/adaptive/study-plan/{userId}`, `/adaptive/tutor/chat`. They depend on the OpenAI key and stub-vs-real LLM mode; treat their fall-back behaviour separately.
- **Educator authoring** — POST `/content/questions` with a teacher token. Worth adding when an integration suite for teacher persona is built (Sprint 14.4 or later).
- **Cross-tenant flag overrides** — global flag fetch works; tenant-scoped overrides need a tenant fixture.

The smoke is deliberately the *floor*. If it fails, the deploy is broken. If it passes, the deploy *might* still have issues outside its scope.

## Extending the smoke

The script is plain bash + Python helpers. Add a new step:

1. New `assert "what you're checking"` line in `scripts/smoke_test.sh`.
2. Increment `step` counter is automatic.
3. Use the `psql_q <db> "<sql>"` helper for DB assertions, or call `curl` for HTTP.
4. For complex JSON checks, use the heredoc-`<<'PY'` style (see `check_real_content` for the pattern) — single quotes around the heredoc tag prevent shell expansion of Python content.

Keep individual steps under 1 second so the whole smoke stays under 30s — anything longer and engineers won't run it.

## Troubleshooting

| Failure | Likely cause | Fix |
|---|---|---|
| `step 01–04 health` fails | Stack isn't up or healthchecks haven't completed | `docker compose ps`, wait 15s; if persistent, `docker logs alp-local-<svc>-1` |
| `step 05 JWT issued` fails | identity migrations didn't run, or seed-restore didn't insert `student@alp.dev` | `make migrate svc=identity mod=auth` then check `auth_schema.users` |
| `step 11 first question is real content` fails | Quiz seed migration ran but `restore_seed` didn't | `cd services/learning && uv run python ../quiz/scripts/restore_seed.py` |
| `step 14–15 engagement consumers` fail | NATS consumers not bound (e.g. engagement just started, lifespan still booting) | Wait 5s and re-run; if persistent, `nats consumer info QUIZ_EVENTS analytics-quiz-completed` |
| `step 16 readiness nTopics≥1` fails but mastery exists | engagement.analytics.processing.recompute_readiness didn't run | Check engagement logs for the readiness recompute callback wired into `process_session` |
