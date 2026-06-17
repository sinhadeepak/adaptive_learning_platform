# NATS dead-letter handling

**Purpose**: investigate and recover from JetStream messages that hit `MaxDeliver` and were dropped — the operational close-out for GAP-06 + the durable-stream promotion in PR #11. Used when a `quiz.session.completed` or `content.question.published` was published but never landed downstream.

**Note (post-[ADR-0005](../docs/adr/0005-service-consolidation.md))**: durable consumer **names** are unchanged from the pre-consolidation world (JetStream remembers consumers by name and we deliberately preserved them across the merge). What changed: the consumer **lives in** a different pod now. `analytics-quiz-completed` and `notification-quiz-completed` both run inside `alp-engagement`; `quiz-content-published` runs inside `alp-quiz`; `content-assignment-progress` runs inside `alp-learning`. Pod selectors below reflect that.

**Authorisation**: any level 2+ may run §1–§3 (read-only). §4 (replay) is level 2+ for Analytics backfill, level 3+ for any direct DB write.

**Expected end-to-end latency**: detection → mitigation < 5 minutes. Full recovery (backfill complete) within one cron cycle (24h).

---

## 1. Streams + durable consumers in scope

| Stream | Subjects | Publisher pod | Durable consumers | Consumer pod | Idempotency key |
|---|---|---|---|---|---|
| `QUIZ_EVENTS` | `quiz.>` | `alp-quiz` on `/quiz/sessions/{id}/submit` | `analytics-quiz-completed` | `alp-engagement` | `analytics_schema.processed_sessions.session_id` |
| `QUIZ_EVENTS` | `quiz.>` | `alp-quiz` | `notification-quiz-completed` | `alp-engagement` | `notification_schema.processed_events.event_id` |
| `QUIZ_EVENTS` | `quiz.>` | `alp-quiz` | `content-assignment-progress` | `alp-learning` | `content_schema.assignment_progress` (PK) |
| `CONTENT_EVENTS` | `content.>` | `alp-learning` on `/content/questions/{id}/review` (approve) + `/content/assignments/{id}/publish` | `quiz-content-published` | `alp-quiz` | `quiz_schema.questions.id` (ON CONFLICT DO UPDATE) |
| `CONTENT_EVENTS` | `content.>` | `alp-learning` | `notification-assignment-created` | `alp-engagement` | `notification_schema.processed_events.event_id` |

**Stream config** (all): FILE storage, R=1 local / R=3 staging+prod, `LimitsPolicy` retention. **Consumer config**: `AckExplicit`, `AckWait=60s`, `MaxDeliver=5`. After 5 failed deliveries the message is **dropped** — there is no auto-DLQ subject in this config.

---

## 2. Detect — is something stuck or lost?

Three signals trigger this runbook:

| Signal | Source | What it means |
|---|---|---|
| Alert: `JetStream consumer lag > 100` for ≥ 5 min | Prometheus on `nats_consumer_num_pending` | Consumer is alive but falling behind — fixable by restart/scale-up. **Not** dead-letter yet. |
| Alert: `JetStream messages dropped > 0` (rate) | Prometheus `nats_consumer_num_redelivered` paired with `MaxDeliver` exceeded | A message just ran out of retries. **This** is the dead-letter case. |
| User report: "my quiz score never updated" / "I approved a question but Quiz still doesn't see it" | Support / on-call | Latent symptom; could be either. |

Run §3 first regardless — observation before action.

---

## 3. Triage — what's the lag look like?

Three commands. Each has an observable outcome.

### 3.1 Stream + consumer state

```
nats stream report --server=nats://<host>:4222
nats consumer report QUIZ_EVENTS
nats consumer report CONTENT_EVENTS
```

Read the columns:
- **`Pending`** — messages in the stream not yet acked by this consumer. > 0 is normal during traffic; > 100 sustained is lag.
- **`Redelivered`** — count of messages currently in retry. Climbs when downstream is failing.
- **`Ack Floor`** — last contiguous acked seq number. Static across two reports = no progress.

### 3.2 Stream age vs. config

```
nats stream info QUIZ_EVENTS --server=nats://<host>:4222
```

Compare `state.bytes` and `state.messages` to the configured limits. With `LimitsPolicy` and our (intentionally unset) `MaxAge`, retention defaults are fine for closed-beta volumes — this is a **liveness sanity check**, not the problem.

### 3.3 Dropped count

```
nats consumer info QUIZ_EVENTS analytics-quiz-completed | grep -E "num_pending|num_ack_pending|num_redelivered"
```

If `num_redelivered` >> `num_ack_pending` and the gap is widening, messages are entering the retry loop faster than they're being acked. They will hit `MaxDeliver` and drop.

**Hard signal that a drop has already happened**: subscribe to JetStream advisory subjects:
```
nats sub '$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.>' --server=nats://<host>:4222
```

Each line is a dropped message. Capture the `stream_seq` from each — it's the JetStream sequence number, useful for §5 forensics.

---

## 4. Mitigate — get back to caught-up

Decision table by symptom:

| Symptom | Action |
|---|---|
| Pending climbing, redelivered ≈ 0, downstream looks healthy | Consumer pod is alive but slow. Scale: `kubectl scale deployment/<service> --replicas=+1`. |
| Pending climbing, redelivered climbing, downstream errors in logs | Downstream is broken. Fix the downstream first; JetStream retries automatically once the handler stops failing. |
| Pending stable but `num_redelivered` near `MaxDeliver` for many messages | About to drop. **Pause the consumer** to stop the bleeding while you fix downstream: `nats consumer pause QUIZ_EVENTS analytics-quiz-completed --pause-until="$(date -u -Iseconds -d '+30 minutes')"`. Resume after the fix. |
| Already dropped (advisory subject fired, or `num_pending` collapsed without ack progress) | Go to §5. |
| Subscriber service was down for > 6 minutes (5 retries × 60s ack-wait) | Assume drops; go to §5. |

---

## 5. Recover dropped messages — replay from source-of-truth

JetStream doesn't keep dropped messages. Recovery means **re-driving the downstream from the upstream's durable record**.

### 5.1 Analytics — `quiz.session.completed` drops

The source-of-truth is `quiz_schema.quiz_sessions` (status = SUBMITTED). Backfill replays anything missing from `processed_sessions`:

```
make engagement-backfill                                     # default: --since "36 hours ago"
SINCE=2026-04-25T00:00:00Z make engagement-backfill          # explicit window
```

Or directly:
```
cd services/engagement
uv run python -m engagement.analytics.backfill --since 2026-04-25T00:00:00Z --limit 10000
```

Outcome: `applied=N skipped=M failed=0` log line. `applied` = sessions that were missing and have now been processed. `skipped` = already in `processed_sessions` (idempotent re-run is safe).

Re-run with the same `--since` → expect `applied=0 skipped=N` on the second pass. If that doesn't hold, escalate.

### 5.2 Notification — `quiz.session.completed` drops (notification side)

Same shape as Analytics. Source-of-truth is `quiz_schema.quiz_sessions`; backfill replays anything missing from `notification_schema.processed_events`:

```
# Notification backfill is now part of the unified engagement-backfill target
make engagement-backfill                                     # default: --since "36 hours ago"
SINCE=2026-04-25T00:00:00Z make engagement-backfill          # explicit window
```

Or directly:
```
cd services/engagement
uv run python -m engagement.notification.backfill --since 2026-04-25T00:00:00Z --limit 10000
```

Outcome counters: `appended` = fresh notification rows; `dropped` = channel disabled at the time (terminal — `processed_events` still marked so flag-flips don't replay backlog); `skipped` = already in `processed_events` (idempotent re-run); `failed` = errors. Re-run must show `appended=0 skipped=N`.

### 5.3 Quiz — `content.question.published` drops

The source-of-truth is `content_schema.questions` (status = PUBLISHED). Re-publish:

1. Find the gap: `psql -d learning -c "SELECT id FROM content_schema.questions WHERE status='PUBLISHED' AND id NOT IN (SELECT id FROM quiz_schema.questions);"` — `content_schema` lives in the `learning` DB; `quiz_schema` in the `quiz` DB. If they're separate clusters, run each query and diff in your shell.
2. For each missing id, re-emit by re-approving (no-op if already PUBLISHED, but the `/review` endpoint short-circuits with the existing row and emits the event again — see PR #21):
   ```
   curl -X POST "$CONTENT_URL/content/questions/<qid>/review" \
     -H "Authorization: Bearer $MOD_TOKEN" \
     -d '{"approve": true, "notes": "DLQ replay"}'
   ```
   **Note**: Content's `/review` errors with `invalid_state` if the row is already PUBLISHED. To force a re-emit, use the direct NATS publish path:
   ```
   nats pub content.question.published "$(psql -c '<<select-row-as-json>>')" --server=nats://<host>:4222
   ```
3. Quiz's subscriber will upsert the row idempotently (`ON CONFLICT (id) DO UPDATE`).

---

## 6. Validate recovery

Two signals must both be true:

- **No new advisories**: `nats sub '$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.>'` is silent for ≥ 5 minutes.
- **Downstream caught up**: `nats consumer info <stream> <durable> | grep num_pending` returns 0 (or matches incoming traffic rate).

For Analytics specifically: `SELECT count(*) FROM analytics_schema.processed_sessions WHERE created_at > now() - interval '1 hour';` should match the `quiz_schema.quiz_sessions WHERE status='SUBMITTED' AND submitted_at > now() - interval '1 hour'` count.

---

## 7. Post-incident

- File a PIR using [pir_template.md](pir_template.md).
- If MaxDeliver was hit because of a deploy-induced downstream outage, add a pre-deploy NATS lag check to that service's deploy gate.
- If MaxDeliver was hit because the handler is genuinely failing on a poison-pill payload, the handler should `Term()` the message (immediate dead-letter, no retry) — verify the handler does this; if not, file a ticket with the consumer service's owner.
- If the same stream+consumer dead-letters twice in a quarter, raise `MaxDeliver` to 10 OR migrate that consumer's idempotent-replay surface (analytics-style backfill) to the same shape.

---

## 8. Why no auto-DLQ subject?

Sprint 3's PR #11 chose the simpler path: explicit ack/term/nak with `MaxDeliver=5`, plus per-domain replay surfaces (Analytics backfill, Content re-approve). A separate `*.DLQ` subject would have required:
- A second stream + retention policy
- A drain-er service to pull from it
- Yet another idempotency boundary

For closed-beta volumes the human-driven recovery in §5 is faster than building the auto-drain. Re-evaluate when we hit `>1 drop / day` sustained — that's the trigger to invest in auto-DLQ.

---

## 9. Drill validation

Exercised as **GAP-06 drill** quarterly. Pass criteria:
- Inject a downstream failure (kill Analytics pod for 6 minutes) → `quiz.session.completed` drops observed via advisory subject.
- Run `make analytics-backfill --since 1h` → all dropped sessions land in `processed_sessions`.
- Re-run → `applied=0 skipped=N`.
- Total time from inject to recovered < 15 minutes.
