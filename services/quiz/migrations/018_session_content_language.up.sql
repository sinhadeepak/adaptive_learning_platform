ALTER TABLE quiz_schema.quiz_sessions
  ADD COLUMN IF NOT EXISTS content_language TEXT NOT NULL DEFAULT 'en';
