-- F4 — Test Sharing rollback.

DROP INDEX IF EXISTS quiz_schema.idx_quiz_sessions_share_slug;
ALTER TABLE quiz_schema.quiz_sessions
  DROP COLUMN IF EXISTS source_share_slug;
