CREATE TABLE IF NOT EXISTS quiz_schema.question_translations (
    question_id  UUID  NOT NULL,
    language     TEXT  NOT NULL,
    stem         TEXT,
    choices      JSONB,
    explanation  TEXT,
    payload      JSONB,
    version      INTEGER NOT NULL DEFAULT 1,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (question_id, language)
);
