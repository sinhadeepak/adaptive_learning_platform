-- One-shot backfill: copy every PUBLISHED question from
-- learning.content_schema.questions → quiz.quiz_schema.questions.
--
-- The NATS-based content→quiz mirror only fires on `content.question.published`
-- events; questions inserted directly via seed migrations bypass the event
-- bus, so most of the 19k+ seeded items never reached the quiz bank.
-- This migration closes the gap once. Future inserts continue to flow via
-- the event bus.
--
-- Uses dblink (built-in Postgres extension) to read across DBs since
-- we're on a single Postgres instance with separate logical DBs per
-- service. ON CONFLICT (id) DO NOTHING makes it idempotent and safe
-- to re-run.

CREATE EXTENSION IF NOT EXISTS dblink;

INSERT INTO quiz_schema.questions (
  id, topic_id, stem, choices, correct_idx, difficulty_b, language,
  status, discrimination_a, guessing_c, explanation, exam_year,
  paper_session, pyq_flag, question_type, created_at
)
SELECT
  id, topic_id, stem, choices::jsonb, correct_idx, difficulty_b, language,
  status, discrimination_a, guessing_c, explanation, exam_year,
  paper_session, pyq_flag, question_type, created_at
FROM dblink(
  'host=postgres port=5432 dbname=learning user=postgres password=postgres',
  $q$
    SELECT id, topic_id, stem, choices::text, correct_idx, difficulty_b, language,
           status, discrimination_a, guessing_c, explanation, exam_year,
           paper_session, pyq_flag, question_type, created_at
    FROM content_schema.questions
    WHERE status = 'PUBLISHED'
  $q$
) AS src(
  id uuid, topic_id uuid, stem text, choices text, correct_idx smallint,
  difficulty_b real, language text, status text, discrimination_a real,
  guessing_c real, explanation text, exam_year smallint, paper_session text,
  pyq_flag boolean, question_type text, created_at timestamptz
)
ON CONFLICT (id) DO NOTHING;
