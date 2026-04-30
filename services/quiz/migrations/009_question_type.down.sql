-- Phase 5 (P5-S38) reverse — drop question_type mirror column.

DROP INDEX IF EXISTS quiz_schema.idx_questions_question_type;

ALTER TABLE quiz_schema.questions
    DROP COLUMN IF EXISTS question_type;
