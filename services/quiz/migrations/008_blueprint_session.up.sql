-- Sprint 23 (P4-S23) — wire MOCK_BLUEPRINT mode end-to-end.
--
-- A blueprint-driven mock is a real Quiz session (so /next, /answers,
-- /submit, IRT skip, time_spent_ms, etc. all reuse the existing
-- machinery), tagged with mode='MOCK_BLUEPRINT' and carrying a
-- blueprint_id reference. section_id on items (added in S22) is now
-- populated from the composer.
--
-- Schema additions:
--   - blueprint_id  nullable UUID. Non-null only for MOCK_BLUEPRINT mode.
--   - chk_mode loosens to allow MOCK_BLUEPRINT alongside the existing modes.

ALTER TABLE quiz_schema.quiz_sessions
    ADD COLUMN IF NOT EXISTS blueprint_id UUID;

ALTER TABLE quiz_schema.quiz_sessions
    DROP CONSTRAINT IF EXISTS chk_mode;

ALTER TABLE quiz_schema.quiz_sessions
    ADD CONSTRAINT chk_mode
    CHECK (mode IN ('PRACTICE', 'MOCK', 'ASSIGNMENT', 'MOCK_BLUEPRINT'));

-- "What blueprints has this user attempted?" + retake lookups.
CREATE INDEX IF NOT EXISTS idx_sessions_blueprint_user
    ON quiz_schema.quiz_sessions (blueprint_id, user_id)
    WHERE blueprint_id IS NOT NULL;
