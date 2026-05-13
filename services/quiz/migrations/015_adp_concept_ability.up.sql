-- ADP — Adaptive Difficulty Progression (Pillar C, Phase B2).
--
-- Two tables:
--
--   concept_ability       — per-(user, concept) θ estimate + SE.
--                            Read on every "next question" decision.
--                            Updated after every answer via EAP.
--
--   flow_corridor_events  — frustration / boredom detection log.
--                            Drives the "drop difficulty by 0.5σ" /
--                            "raise by 0.4σ" corrective actions.
--
-- Both tables sit in quiz_schema next to the existing session_items
-- so the ADP path stays a single-service query.

CREATE TABLE IF NOT EXISTS quiz_schema.concept_ability (
    user_id          uuid NOT NULL,
    concept_id       uuid NOT NULL,
    theta            real NOT NULL DEFAULT 0.0,
    se               real NOT NULL DEFAULT 1.0,
    n_attempts       integer NOT NULL DEFAULT 0,
    n_correct        integer NOT NULL DEFAULT 0,
    last_updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, concept_id)
);

CREATE INDEX IF NOT EXISTS concept_ability_user_idx
    ON quiz_schema.concept_ability (user_id, last_updated_at DESC);

CREATE TABLE IF NOT EXISTS quiz_schema.flow_corridor_events (
    user_id          uuid NOT NULL,
    concept_id       uuid NOT NULL,
    event_type       text NOT NULL
        CHECK (event_type IN ('frustration', 'boredom', 'normal', 'corrected')),
    triggered_at     timestamptz NOT NULL DEFAULT now(),
    correction_applied text,
    -- Why we triggered: e.g., "3 wrong in a row" / "5 right in a row".
    rationale        text,
    PRIMARY KEY (user_id, concept_id, triggered_at)
);

CREATE INDEX IF NOT EXISTS flow_corridor_events_user_idx
    ON quiz_schema.flow_corridor_events (user_id, triggered_at DESC);

-- Per-question item calibration (3PL parameters refined as student
-- attempts accumulate). Independent of (user, concept) — keyed by
-- question_id alone.
CREATE TABLE IF NOT EXISTS quiz_schema.question_calibration (
    question_id      uuid PRIMARY KEY,
    b_estimate       real NOT NULL DEFAULT 0.0,
    a_estimate       real NOT NULL DEFAULT 1.0,
    c_estimate       real NOT NULL DEFAULT 0.0,
    n_attempts       integer NOT NULL DEFAULT 0,
    n_correct        integer NOT NULL DEFAULT 0,
    last_calibrated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_calibration_b_idx
    ON quiz_schema.question_calibration (b_estimate);
