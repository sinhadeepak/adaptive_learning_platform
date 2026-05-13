#!/usr/bin/env bash
#
# End-to-end test setup for the Adaptive Learning Platform.
#
# Provisions on top of `make dev-up`:
#   * 5 institutions (mix of schools + coaching centres)
#   * ~28 teachers + 50 students with seeded passwords
#   * Polymorphic question banks for NEET / JEE Main / CBSE 8-9
#     (24 types × 200 questions per exam = 14,400 fresh rows on top of
#     UPSC's 4,800 = ~19,200 questions in total)
#   * 8 mock-test blueprints honouring real exam-day rules
#     (NEET 200Q/200min/+4/-1, JEE Main 75Q/180min/+4/-1, CBSE 40Q/90min/+1/0)
#
# Then drives a few quiz sessions per cohort to populate analytics +
# cohort leaderboards, and prints a one-page summary.
#
# Idempotent: re-running on a fully-provisioned stack is safe — every
# migration uses ON CONFLICT DO NOTHING and the orchestrator's quiz
# activity is additive.
#
# Usage:
#   bash scripts/e2e_full_test_setup.sh                # full setup + activity
#   bash scripts/e2e_full_test_setup.sh --skip-quiz    # migrate-only
#   bash scripts/e2e_full_test_setup.sh --quiet        # less verbose
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

QUIET=""
SKIP_QUIZ=""
for arg in "$@"; do
    case "$arg" in
        --quiet)     QUIET="--quiet" ;;
        --skip-quiz) SKIP_QUIZ="--skip-quiz" ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# //'
            exit 0
            ;;
        *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
done

say() { [ -n "$QUIET" ] || echo "$@"; }

say "════════════════════════════════════════════════════════════════════════"
say "  ALP — End-to-End Test Setup"
say "════════════════════════════════════════════════════════════════════════"

# Pre-flight: verify the stack is up.
say
say "[pre-flight] Verifying docker compose stack is up…"
if ! docker compose -f infrastructure/docker/docker-compose.yml ps --status running 2>/dev/null \
        | grep -qE "identity|learning"; then
    echo "  ✗ stack not running. Start it with 'make dev-up' first."
    exit 1
fi
say "  ✓ identity + learning containers healthy"

# Step 1 — apply alembic migrations on identity (institutions + users)
say
say "[1/4] Applying identity migrations (5 institutions + 28 teachers + 50 students)…"
docker compose -f infrastructure/docker/docker-compose.yml exec -T identity \
    bash -lc 'cd /app && AUTH_SEED_LOCAL=1 alembic -n auth upgrade head && AUTH_SEED_LOCAL=1 alembic -n institution upgrade head' \
    || { echo "  ✗ identity migrations failed"; exit 2; }
say "  ✓ identity migrations applied"

# Step 2 — apply alembic migrations on learning (catalog + content)
say
say "[2/4] Applying learning migrations (CBSE catalog + mock blueprints + polymorphic banks)…"
docker compose -f infrastructure/docker/docker-compose.yml exec -T learning \
    bash -lc 'cd /app && CONTENT_SEED_LOCAL=1 alembic -n catalog upgrade head && CONTENT_SEED_LOCAL=1 alembic -n content upgrade head' \
    || { echo "  ✗ learning migrations failed"; exit 3; }
say "  ✓ learning migrations applied"

# Step 3 — print row-count summary directly from postgres
say
say "[3/4] Verifying row counts…"
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres \
    psql -U postgres -d identity -t -c \
    "SELECT 'institutions: ' || count(*) FROM institution_schema.tenants WHERE slug LIKE '%-coaching' OR slug LIKE 'dps-%' OR slug LIKE 'kv-%' OR slug LIKE 'allen-%' OR slug LIKE 'vedanta-%';" \
    | grep -v '^$' | xargs -I {} say "  {}"
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres \
    psql -U postgres -d identity -t -c \
    "SELECT 'teachers (e2e):  ' || count(*) FROM auth_schema.users WHERE email LIKE 'teacher%@e2e.alp.dev';" \
    | grep -v '^$' | xargs -I {} say "  {}"
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres \
    psql -U postgres -d identity -t -c \
    "SELECT 'students (e2e):  ' || count(*) FROM auth_schema.users WHERE email LIKE 'student%@e2e.alp.dev';" \
    | grep -v '^$' | xargs -I {} say "  {}"
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres \
    psql -U postgres -d learning -t -c \
    "SELECT 'questions:       ' || count(*) FROM content_schema.questions;" \
    | grep -v '^$' | xargs -I {} say "  {}"
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres \
    psql -U postgres -d learning -t -c \
    "SELECT 'mock blueprints: ' || count(*) FROM catalog_schema.exam_blueprints;" \
    | grep -v '^$' | xargs -I {} say "  {}"

# Step 3.5 — sync content → quiz mirror (Quiz Go reads from quiz_schema,
# which the polymorphic-seed migrations bypass — see script header).
say
say "[3.5/4] Mirroring MCQ rows into quiz_schema (via dblink)…"
bash scripts/e2e_sync_quiz_schema.sh \
    | { [ -n "$QUIET" ] && tail -1 || cat; }

# Step 4 — drive quiz activity + leaderboard pull
say
say "[4/4] Driving quiz activity + pulling leaderboards…"
python3 -u scripts/e2e_orchestrator.py $QUIET $SKIP_QUIZ

say
say "════════════════════════════════════════════════════════════════════════"
say "  E2E setup complete."
say "════════════════════════════════════════════════════════════════════════"
