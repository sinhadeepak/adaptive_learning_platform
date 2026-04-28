-- Reverse Sprint 12 S12-D additions.
DROP INDEX IF EXISTS quiz_schema.idx_sessions_assignment_user;

ALTER TABLE quiz_schema.quiz_sessions
    DROP CONSTRAINT IF EXISTS chk_mode;

ALTER TABLE quiz_schema.quiz_sessions
    ADD CONSTRAINT chk_mode CHECK (mode IN ('PRACTICE', 'MOCK'));

ALTER TABLE quiz_schema.quiz_sessions
    DROP COLUMN IF EXISTS assignment_id;
