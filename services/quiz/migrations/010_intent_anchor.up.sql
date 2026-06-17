-- P6-S54 — difficulty agency: intent_anchor + post-session calibration_feedback
-- + mid-quiz friction_fired_at_idx tracker. All additive; defaults preserve
-- pre-Phase-6 quiz behaviour.

ALTER TABLE quiz_schema.quiz_sessions
    ADD COLUMN intent_anchor TEXT NOT NULL DEFAULT 'match'
        CHECK (intent_anchor IN ('match','push','build_confidence')),
    ADD COLUMN calibration_feedback TEXT NULL
        CHECK (calibration_feedback IS NULL OR calibration_feedback IN ('too_easy','right','too_hard')),
    ADD COLUMN friction_fired_at_idx INT NULL;
