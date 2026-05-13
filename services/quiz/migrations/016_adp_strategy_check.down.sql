ALTER TABLE quiz_schema.quiz_sessions
    DROP CONSTRAINT IF EXISTS chk_strategy;

ALTER TABLE quiz_schema.quiz_sessions
    ADD CONSTRAINT chk_strategy
        CHECK (strategy IN ('irt', 'binary_search'));
