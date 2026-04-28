-- Quiz service schema. Stores the question bank + per-user session state.
-- Sessions are short-lived (90 min TTL per GAP-10); items survive for analytics joins.

CREATE SCHEMA IF NOT EXISTS quiz_schema;

CREATE TABLE quiz_schema.questions (
    id            UUID PRIMARY KEY,
    topic_id      UUID NOT NULL,
    stem          TEXT NOT NULL,
    choices       JSONB NOT NULL,        -- ordered array of choice strings
    correct_idx   SMALLINT NOT NULL,
    difficulty_b  REAL NOT NULL DEFAULT 0.0,  -- IRT b-parameter; 0 = average
    language      TEXT NOT NULL DEFAULT 'en',
    status        TEXT NOT NULL DEFAULT 'PUBLISHED',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_correct_idx_nonneg CHECK (correct_idx >= 0),
    CONSTRAINT chk_status CHECK (status IN ('DRAFT','REVIEW','PUBLISHED','RETIRED'))
);
CREATE INDEX idx_questions_topic ON quiz_schema.questions (topic_id, status);
CREATE INDEX idx_questions_difficulty ON quiz_schema.questions (topic_id, difficulty_b);

CREATE TABLE quiz_schema.quiz_sessions (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL,
    tenant_id       TEXT,
    topic_id        UUID NOT NULL,
    mode            TEXT NOT NULL,          -- 'PRACTICE' | 'MOCK'
    strategy        TEXT NOT NULL,          -- 'irt' | 'binary_search'
    status          TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    target_count    SMALLINT NOT NULL DEFAULT 10,
    served_count    SMALLINT NOT NULL DEFAULT 0,
    correct_count   SMALLINT NOT NULL DEFAULT 0,
    ability_estimate REAL NOT NULL DEFAULT 0.0,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    submitted_at    TIMESTAMPTZ,
    CONSTRAINT chk_mode CHECK (mode IN ('PRACTICE','MOCK')),
    CONSTRAINT chk_strategy CHECK (strategy IN ('irt','binary_search')),
    CONSTRAINT chk_status CHECK (status IN ('IN_PROGRESS','SUBMITTED','EXPIRED'))
);
CREATE INDEX idx_sessions_user ON quiz_schema.quiz_sessions (user_id, started_at DESC);
CREATE INDEX idx_sessions_status ON quiz_schema.quiz_sessions (status);

CREATE TABLE quiz_schema.quiz_session_items (
    session_id    UUID NOT NULL REFERENCES quiz_schema.quiz_sessions(id) ON DELETE CASCADE,
    item_idx      SMALLINT NOT NULL,
    question_id   UUID NOT NULL REFERENCES quiz_schema.questions(id),
    served_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    answer_idx    SMALLINT,
    is_correct    BOOLEAN,
    answered_at   TIMESTAMPTZ,
    PRIMARY KEY (session_id, item_idx)
);
CREATE INDEX idx_items_question ON quiz_schema.quiz_session_items (question_id);
