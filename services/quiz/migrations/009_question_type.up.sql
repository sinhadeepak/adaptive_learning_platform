-- Phase 5 (P5-S38): mirror question_type from content_schema.
-- Backfill all existing rows to MCQ_SINGLE. Future bridge events
-- carry question_type in the payload (omitempty for pre-S38 producers).

ALTER TABLE quiz_schema.questions
    ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'MCQ_SINGLE';

-- Backfill existing 480 rows (idempotent — DEFAULT applies to existing,
-- but explicit UPDATE catches any prior NULL via earlier migration).
UPDATE quiz_schema.questions
SET question_type = 'MCQ_SINGLE'
WHERE question_type IS NULL OR question_type = '';

CREATE INDEX IF NOT EXISTS idx_questions_question_type
    ON quiz_schema.questions (question_type);
