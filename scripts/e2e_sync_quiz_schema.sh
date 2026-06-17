#!/usr/bin/env bash
#
# Sync MCQ-shaped rows from learning.content_schema.questions →
# quiz.quiz_schema.questions, so Quiz Go can serve quizzes against
# the polymorphic seed-migration content.
#
# In production, quiz_schema is fed asynchronously by the
# ``content.question.published`` NATS subscriber inside Quiz Go.
# The local polymorphic-seed migrations bypass the publish flow and
# insert directly into content_schema, so Quiz Go can't see those
# rows and ``/quiz/sessions/start`` returns ``empty_topic`` for any
# of the new topics. We close the gap with one ``INSERT … FROM
# dblink(…)`` statement that runs against the same Postgres instance.
#
# Idempotent: ``ON CONFLICT (id) DO NOTHING``.
#
# Usage:
#   bash scripts/e2e_sync_quiz_schema.sh                 # default container name
#   bash scripts/e2e_sync_quiz_schema.sh my-postgres     # override container
#
set -euo pipefail

CONTAINER="${1:-alp-local-postgres-1}"

echo "Syncing MCQ rows: learning.content_schema → quiz.quiz_schema (via dblink)…"

# Ensure dblink extension exists in the quiz database (idempotent).
docker exec -i "$CONTAINER" psql -U postgres -d quiz \
    -c "CREATE EXTENSION IF NOT EXISTS dblink" >/dev/null

docker exec -i "$CONTAINER" psql -U postgres -d quiz <<'SQL' | tail -3
INSERT INTO quiz_schema.questions
  (id, topic_id, stem, choices, correct_idx, difficulty_b, language, status)
SELECT id, topic_id, stem, choices, correct_idx, difficulty_b, language, status
FROM dblink(
    'host=localhost port=5432 dbname=learning user=postgres password=postgres',
    $$
      SELECT id, topic_id, stem, choices,
             correct_idx::smallint, difficulty_b::real, language, status
      FROM content_schema.questions
      WHERE question_type IN ('MCQ','MCQ_SINGLE') OR question_type IS NULL
    $$
) AS src(id uuid, topic_id uuid, stem text, choices jsonb,
         correct_idx smallint, difficulty_b real, language text, status text)
ON CONFLICT (id) DO NOTHING;

SELECT 'quiz_schema rows now: ' || count(*) AS status
FROM quiz_schema.questions;
SQL

echo "Sync complete."
