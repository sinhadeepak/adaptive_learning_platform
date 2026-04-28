-- Sprint 12 S12-D — wire ASSIGNMENT mode end-to-end.
--
-- Goal: when a student starts an assignment from /assignments/{id}, we
-- create a real Quiz session pinned to the educator's question list so
-- the play loop, bookmarks, feedback, IRT-skipping etc. all reuse the
-- existing Quiz machinery. The assignment_id rides along on the row so
-- the post-submit fan-out can mirror the score back into Content's
-- assignment_progress.
--
-- Schema additions:
--   - assignment_id  nullable UUID. Non-null only for ASSIGNMENT mode.
--   - chk_mode loosens to allow 'ASSIGNMENT' alongside PRACTICE / MOCK.

ALTER TABLE quiz_schema.quiz_sessions
    ADD COLUMN IF NOT EXISTS assignment_id UUID;

-- Drop + recreate the mode CHECK so ASSIGNMENT is permitted.
ALTER TABLE quiz_schema.quiz_sessions
    DROP CONSTRAINT IF EXISTS chk_mode;

ALTER TABLE quiz_schema.quiz_sessions
    ADD CONSTRAINT chk_mode
    CHECK (mode IN ('PRACTICE', 'MOCK', 'ASSIGNMENT'));

-- Lookup the assignment a student already started — the educator UI
-- expects "you've started this; resume?" not "create another session".
CREATE INDEX IF NOT EXISTS idx_sessions_assignment_user
    ON quiz_schema.quiz_sessions (assignment_id, user_id)
    WHERE assignment_id IS NOT NULL;
