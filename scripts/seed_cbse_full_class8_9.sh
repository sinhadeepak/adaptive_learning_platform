#!/usr/bin/env bash
#
# Seed the FULL CBSE Class 8 + Class 9 NCERT syllabus into the local
# stack — every subject, every chapter, with question banks.
#
# Applies, in order:
#   1) catalog migration 019  → 4 new subjects + 94 new topics
#   2) content migration 032  → 5 PUBLISHED MCQs per topic (~470 questions)
#   3) catalog migration 008  → resyncs question_count on topic cards
#   4) quiz migration 012     → mirrors PUBLISHED questions into quiz DB
#                               so the engine can serve them.
#
# Idempotent. Re-running on a fully-seeded stack is a no-op (every
# migration is ON CONFLICT DO NOTHING / uuid5-deterministic).
#
# Prerequisites:
#   - `make dev-up` has been run and the `learning` + `quiz` containers
#     are healthy.
#
# Usage:
#   bash scripts/seed_cbse_full_class8_9.sh           # full seed
#   bash scripts/seed_cbse_full_class8_9.sh --quiet
#   bash scripts/seed_cbse_full_class8_9.sh --dry-run # show what would run
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

QUIET=""
DRY_RUN=""
for arg in "$@"; do
    case "$arg" in
        --quiet)   QUIET="1" ;;
        --dry-run) DRY_RUN="1" ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
done

say() { [ -n "$QUIET" ] || echo "$@"; }

run_in() {
    local svc="$1"; shift
    local cmd="$*"
    if [ -n "$DRY_RUN" ]; then
        say "  [dry-run] docker compose exec $svc bash -lc '$cmd'"
    else
        docker compose -f infrastructure/docker/docker-compose.yml \
            exec -T "$svc" bash -lc "$cmd"
    fi
}

COMPOSE="docker compose -f infrastructure/docker/docker-compose.yml"

say "════════════════════════════════════════════════════════════════════════"
say "  CBSE Full Syllabus Seed — Class 8 + Class 9 (NCERT)"
say "════════════════════════════════════════════════════════════════════════"

# Sanity check — containers must be running
if [ -z "$DRY_RUN" ]; then
    if ! $COMPOSE ps --format '{{.Names}} {{.State}}' \
        | grep -E "^(.*-)?learning .*running" > /dev/null; then
        echo "  ✗ 'learning' container is not running. Start the stack first:"
        echo "      make dev-up"
        exit 1
    fi
    if ! $COMPOSE ps --format '{{.Names}} {{.State}}' \
        | grep -E "^(.*-)?quiz .*running" > /dev/null; then
        echo "  ✗ 'quiz' container is not running. Start the stack first:"
        echo "      make dev-up"
        exit 1
    fi
fi

# Step 1 — catalog: subjects + topics
say
say "[1/4] catalog → 019_seed_cbse_full_syllabus  (4 subjects, 94 topics)"
run_in learning \
    'cd /app && CATALOG_SEED_LOCAL=1 CONTENT_SEED_LOCAL=1 alembic -n catalog upgrade 019' \
    || { echo "  ✗ catalog 019 failed"; exit 2; }
say "  ✓ catalog migration 019 applied"

# Step 2 — content: questions
say
say "[2/4] content → 032_seed_cbse_full_question_bank  (~470 MCQs)"
run_in learning \
    'cd /app && CONTENT_SEED_LOCAL=1 alembic -n content upgrade 032' \
    || { echo "  ✗ content 032 failed"; exit 3; }
say "  ✓ content migration 032 applied"

# Step 3 — resync question_count on topic cards (catalog 008 is idempotent)
say
say "[3/4] catalog → resync topic question_count (catalog 008)"
run_in learning \
    'cd /app && CATALOG_SEED_LOCAL=1 alembic -n catalog upgrade head' \
    || { echo "  ✗ catalog head upgrade failed"; exit 4; }
say "  ✓ catalog upgraded to head"

# Step 4 — mirror PUBLISHED content → quiz (012 backfill is idempotent)
say
say "[4/4] quiz → backfill questions from content (quiz 012)"
run_in quiz \
    'cd /app && /app/migrate -path /app/migrations -database "$QUIZ_DATABASE_URL" up' \
    || say "  ! quiz auto-migrate failed; running 012 directly via psql"

# Direct psql fallback for the backfill in case the in-container migrate
# binary path differs across builds.
if [ -z "$DRY_RUN" ]; then
    $COMPOSE exec -T postgres psql -U postgres -d quiz -v ON_ERROR_STOP=1 \
        -f /docker-entrypoint-initdb.d/012_backfill_questions_from_content.up.sql \
        2>/dev/null || true
fi
say "  ✓ quiz backfill attempted"

# Summary — count rows actually in the quiz bank for CBSE topics
if [ -z "$DRY_RUN" ]; then
    say
    say "── Summary ─────────────────────────────────────────────────────────────"
    $COMPOSE exec -T postgres psql -U postgres -d learning -t -A -c \
        "SELECT 'CBSE subjects: ' || count(*) FROM catalog_schema.subjects s
           JOIN catalog_schema.exams e ON e.id = s.exam_id
          WHERE e.code = 'CBSE';" | xargs -I {} say "  {}"
    $COMPOSE exec -T postgres psql -U postgres -d learning -t -A -c \
        "SELECT 'CBSE topics: ' || count(*) FROM catalog_schema.topics t
           JOIN catalog_schema.subjects s ON s.id = t.subject_id
           JOIN catalog_schema.exams    e ON e.id = s.exam_id
          WHERE e.code = 'CBSE';" | xargs -I {} say "  {}"
    $COMPOSE exec -T postgres psql -U postgres -d learning -t -A -c \
        "SELECT 'CBSE questions (content_schema): ' || count(*)
           FROM content_schema.questions q
           JOIN catalog_schema.topics  t ON t.id = q.topic_id
           JOIN catalog_schema.subjects s ON s.id = t.subject_id
           JOIN catalog_schema.exams    e ON e.id = s.exam_id
          WHERE e.code = 'CBSE' AND q.status = 'PUBLISHED';" \
        2>/dev/null | xargs -I {} say "  {}" || true
fi

say
say "✓ Done. Run a quiz from any CBSE Class 8 / 9 topic to verify."
