-- Sprint 22 (P4-S22) rollback.

DROP INDEX IF EXISTS quiz_schema.idx_questions_pyq_chapter;

ALTER TABLE quiz_schema.questions
    DROP COLUMN IF EXISTS pyq_flag,
    DROP COLUMN IF EXISTS paper_session,
    DROP COLUMN IF EXISTS exam_year;

ALTER TABLE quiz_schema.quiz_session_items
    DROP COLUMN IF EXISTS section_id,
    DROP COLUMN IF EXISTS time_spent_ms;
