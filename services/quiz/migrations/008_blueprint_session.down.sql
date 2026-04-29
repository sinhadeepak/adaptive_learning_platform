-- Sprint 23 (P4-S23) rollback.

DROP INDEX IF EXISTS quiz_schema.idx_sessions_blueprint_user;

ALTER TABLE quiz_schema.quiz_sessions
    DROP CONSTRAINT IF EXISTS chk_mode;

ALTER TABLE quiz_schema.quiz_sessions
    ADD CONSTRAINT chk_mode
    CHECK (mode IN ('PRACTICE', 'MOCK', 'ASSIGNMENT'));

ALTER TABLE quiz_schema.quiz_sessions
    DROP COLUMN IF EXISTS blueprint_id;
