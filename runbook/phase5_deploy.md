# Phase 5 deploy runbook

**Updated**: 2026-04-30
**Owner**: Eng (deploy lead)
**Required**: Docker Desktop running (Windows host needs WSL integration enabled), repo at `development` HEAD, Postgres + NATS + Redis healthy.

---

## TL;DR

```bash
make deploy-phase5
```

That's it. The single command rebuilds the two services that carry Phase 5 code (`learning` + `engagement`), applies pending migrations, restarts the services, runs the 99-step smoke, and probes 6 Phase 5 endpoints for round-trip health.

---

## What the deploy does, stage by stage

| Stage | What runs | Failure mode | Recovery |
|---|---|---|---|
| **1 sanity** | `docker info`, branch + git status checks | docker daemon down | Restart Docker Desktop; re-enable WSL integration; rerun |
| **2 build** | `docker compose build learning engagement` | dependency resolution / Dockerfile / network | Inspect build log; common cause is stale `~/.docker` registry cache → `docker buildx prune` |
| **3 migrate** | `alembic upgrade head` against content (18 revs), catalog (16 revs), analytics (14 revs) | migration syntax / FK violation / orphaned data | Down-migrate the offending revision (`alembic downgrade -1`), fix in place, re-up |
| **4 restart** | `docker compose up -d learning engagement` + healthcheck poll (60s budget per service) | port collision / OOM / lifespan crash | `docker logs alp-local-learning-1` reveals the lifespan exception; common cause is a missing env var |
| **5 smoke** | `bash scripts/smoke_test.sh` — 99 assertions through P5-S63 | new failures in steps 66–99 are blockers | Drill into the failing step's `curl` line; rerun with `-v` |
| **6 probe** | 6 quick post-deploy round-trips against the new endpoints | any 5xx | Same as stage 4 — logs + the assertion's curl |

---

## Phase 5 migration manifest

Three new alembic revisions land in this deploy:

| Schema | Revision | Description | Adds |
|---|---|---|---|
| `content_schema` | 017_cultural_flags | S57 audit gap close | 5 columns on `content_artifact_translations` (cultural_flags JSONB + review status/reviewer/timestamp/notes) + partial index for the cultural-review queue |
| `content_schema` | 018_reviewer_staffing | S63 operations | New `reviewer_staffing` table seeded with hi (6) + ta/te/bn/mr (3 each) per AIM §4.5 |
| `analytics_schema` | 014_session_item_outcomes | S41 transfer-ability metric | Per-item outcomes table for the multi-tag vs single-tag transfer score |

All three are **additive** (no column drops, no data rewrites) so down-migrations are clean rollbacks.

Earlier Phase 5 revisions (008–016 on content; 013–015 on catalog; 009–013 on analytics) should already be applied if you ran `make smoke` at any point during S37–S56. The deploy script's `alembic upgrade head` is idempotent — it skips revisions already at the head.

---

## Environment variables (optional)

| Var | Default behaviour when absent | Effect when set |
|---|---|---|
| `OPENAI_API_KEY` | Stub providers across AI Gateway + transcription. Routes return canned data. | Real OpenAI calls (Whisper transcription, GPT-4o for the 5 touchpoints). Cost dashboard tracks. |
| `AWS_REGION` + `AWS_ACCESS_KEY_ID` | StubImageModerator — every upload goes to pre-moderation. | RekognitionModerator — real NSFW/violence/copyright detection per S63. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Override the default model per touchpoint. |

The lifespan auto-detects which providers are available and logs the choice on startup:

```
INFO transcription provider: stub (no OPENAI_API_KEY)
INFO image moderator: stub (no AWS creds)
```

Both stubs are production-safe — they don't pretend to be real moderation; they default to "route to human review" for unknowns.

---

## Pre-deploy verification (without docker)

Run these to catch issues before the live deploy:

### Static route registration

```bash
cd services/learning && uv run python -c "
import os
[os.environ.setdefault(k, v) for k, v in {
    'DATABASE_URL': 'postgresql+asyncpg://x:y@localhost/test',
    # ...full env block, see scripts/static_verify.sh
}.items()]
from learning.main import app
phase5 = sum(1 for r in app.routes if any(p in getattr(r,'path','') for p in
    ('/grading','/content/ai','/content/types','/localisation','/admin/ai',
     '/evaluation','/adaptive/diagnostic','/adaptive/select')))
assert phase5 >= 35, f'expected >=35 phase 5 routes, got {phase5}'
print(f'OK {phase5} routes registered')
"
```

Expected output: `OK 37 routes registered`.

### Migration linearity

```bash
ls services/learning/alembic/content/versions/ | grep -E '^0[0-9]{2}_' | wc -l
# expect: 18

ls services/learning/alembic/catalog/versions/ | grep -E '^0[0-9]{2}_' | wc -l
# expect: 16

ls services/engagement/alembic/analytics/versions/ | grep -E '^0[0-9]{2}_' | wc -l
# expect: 14
```

Or use the full chain check:

```bash
python3 -c "
import re
from pathlib import Path
def check(d, name):
    files = sorted(Path(d).glob('*.py'))
    files = [f for f in files if f.name != '__init__.py']
    expected = 'None'
    for f in files:
        t = f.read_text()
        rev = re.search(r'^revision:\s*str\s*=\s*\"(\w+)\"', t, re.M).group(1)
        down = re.search(r'^down_revision:\s*str\s*\|\s*None\s*=\s*\"?(\w+|None)\"?', t, re.M).group(1)
        assert down == expected, f'{name}: chain broken at {f.name} (down={down}, expected {expected})'
        expected = rev
    print(f'OK {name} chain linear ({len(files)} migrations)')
check('services/learning/alembic/content/versions',  'content')
check('services/learning/alembic/catalog/versions',  'catalog')
check('services/engagement/alembic/analytics/versions', 'analytics')
"
```

Expected: 3 OK lines.

### Backend test sanity

```bash
cd services/learning && uv run python -m pytest tests/payload_contracts/ -q
# expect: 405 passed
```

---

## Rollback

Phase 5 is strictly additive at the schema layer; **no Phase 5 commit needs a destructive rollback**. To revert to pre-Phase-5 state:

1. **Code**: `git revert b41577b..3f3f5c8` (everything from S37 ADRs through S67 mobile catchup).
2. **Migrations**: down-migrate to the Phase 4 head:
   ```bash
   docker compose run --rm learning  alembic -c alembic_content.ini  downgrade 007
   docker compose run --rm learning  alembic -c alembic_catalog.ini  downgrade 012
   docker compose run --rm engagement alembic -c alembic_analytics.ini downgrade 008
   ```
3. **Rebuild + restart**: `docker compose build learning engagement && docker compose up -d`.

Rollback is itself smoke-tested (the project's test discipline runs both up + down migrations in staging).

---

## Post-deploy verification

The 6 stage-6 probes cover the highest-value endpoints. For a deeper check:

```bash
# All three dashboards render data shape:
curl -sf http://localhost:38101/admin/ai-cost | jq '.day, .alerts'
curl -sf http://localhost:38101/evaluation/calibration/dashboard | jq '.floorKappa, .autoPausedCriteria'
curl -sf http://localhost:38101/localisation/analytics | jq '.targets, .perLanguage[0]'

# Translation round-trip (uses a real seeded question id):
QID=$(docker exec alp-local-postgres-1 psql -U postgres -d learning -t -A \
  -c "SELECT id FROM content_schema.questions LIMIT 1")
curl -sf -X POST "http://localhost:38101/content/questions/$QID/translations/hi/request" \
  -H 'Content-Type: application/json' \
  -d '{"sourceLang":"en","subject":"general"}' | jq

# Verify the row landed:
docker exec alp-local-postgres-1 psql -U postgres -d learning \
  -c "SELECT artifact_id, language, status, version, jsonb_array_length(cultural_flags) AS flag_count
        FROM content_schema.content_artifact_translations
       WHERE artifact_id = '$QID' ORDER BY updated_at DESC LIMIT 5"
```

---

## Operational follow-ups (week-1 audits)

Per `docs/02_planning/84_Phase5_Closure_Retro.md`:

- [ ] Verify auto-pause refresh task fires every 5 min (logs: `auto_pause refreshed`)
- [ ] Verify audit retention task fires within 7 days (logs: `audit_log.purged`)
- [ ] Confirm cost dashboard 80% / 95% alerts wire to Slack (currently UI-only)
- [ ] If `OPENAI_API_KEY` set: 10-sample Whisper transcription quality check against representative NEET / JEE / UPSC media
- [ ] If AWS creds set: 5-sample Rekognition sanity (clean vs known-NSFW vs known-copyright)
- [ ] Calibration dashboard shows live samples within 1 week of staging traffic
- [ ] Translation analytics dashboard populates within 1 week of first translation request

---

## Known gaps documented in the closure retro (deferred — not blockers)

- Per-concept IRT calibration (gated on item bank ≥ 30/concept)
- Whisper-driven LISTENING_COMP / VIDEO_QUESTION submission (gated by `audio_video_questions_enabled` flag)
- Interactive families flag flip (KBC / TIMED_REVEAL / ADAPTIVE_DIFFICULTY — UX flow + scoring profile pending Product)
- Cultural-flag-rate-per-language metric returns null in `/localisation/analytics` until the breach-count field is exposed
- Map tile renderer locale-aware labels (currently OSM English-only)

These don't block the deploy. They're tracked on the 90-day audit checklist.
