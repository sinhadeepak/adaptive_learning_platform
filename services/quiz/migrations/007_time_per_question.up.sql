-- Sprint 22 (P4-S22): time-per-question + section_id + PYQ mirror columns.
--
-- All additive, NULL-able. New sessions populate time_spent_ms at submit time;
-- historical items stay NULL and are skipped by aggregators.
--
-- ADR-0012 (PYQ schema), ADR-0013 (time-per-question analytics).

ALTER TABLE quiz_schema.quiz_session_items
    ADD COLUMN IF NOT EXISTS time_spent_ms INTEGER NULL,
    ADD COLUMN IF NOT EXISTS section_id    TEXT    NULL;

ALTER TABLE quiz_schema.questions
    ADD COLUMN IF NOT EXISTS exam_year     SMALLINT NULL,
    ADD COLUMN IF NOT EXISTS paper_session TEXT     NULL,
    ADD COLUMN IF NOT EXISTS pyq_flag      BOOLEAN  NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_questions_pyq_chapter
    ON quiz_schema.questions (pyq_flag, exam_year, topic_id)
    WHERE pyq_flag = TRUE;
