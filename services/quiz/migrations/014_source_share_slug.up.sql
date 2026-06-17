-- F4 — Test Sharing.
-- Track which shared blueprint (if any) a quiz session was launched from.
-- The author of a CUSTOM blueprint reads aggregated attempts from this
-- column ("3 friends took your test") via a join in the share-stats
-- endpoint on the learning service.

ALTER TABLE quiz_schema.quiz_sessions
  ADD COLUMN IF NOT EXISTS source_share_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_share_slug
  ON quiz_schema.quiz_sessions (source_share_slug)
  WHERE source_share_slug IS NOT NULL;
