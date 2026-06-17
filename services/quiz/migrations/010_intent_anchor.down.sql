ALTER TABLE quiz_schema.quiz_sessions
    DROP COLUMN intent_anchor,
    DROP COLUMN calibration_feedback,
    DROP COLUMN friction_fired_at_idx;
