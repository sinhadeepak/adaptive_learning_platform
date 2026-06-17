-- No-op down: we don't selectively delete the backfilled rows because
-- once they're mirrored they may be referenced by quiz_session_items
-- (FK protection). Re-applying is idempotent via ON CONFLICT DO NOTHING.
SELECT 1;
