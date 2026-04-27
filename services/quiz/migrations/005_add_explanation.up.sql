-- Sprint 5 deepening: mirror Content's explanation column into Quiz so the
-- Quiz results endpoint can return per-question explanations without a
-- second hop to Content. Bridge consumer carries the value over.
ALTER TABLE quiz_schema.questions ADD COLUMN IF NOT EXISTS explanation TEXT;
