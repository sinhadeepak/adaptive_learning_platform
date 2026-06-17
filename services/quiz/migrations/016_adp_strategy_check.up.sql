-- Phase B2 — extend the strategy CHECK to allow the new 'adp' value
-- alongside the existing 'irt' / 'binary_search'. New value is the
-- in-process Adaptive Difficulty Progression strategy added per
-- the Statistics-Driven Guidance System build plan §B2.

ALTER TABLE quiz_schema.quiz_sessions
    DROP CONSTRAINT IF EXISTS chk_strategy;

ALTER TABLE quiz_schema.quiz_sessions
    ADD CONSTRAINT chk_strategy
        CHECK (strategy IN ('irt', 'binary_search', 'adp'));
