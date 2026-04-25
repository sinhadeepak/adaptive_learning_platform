-- Add per-item IRT discrimination + guessing columns to the question bank.
-- Sprint 4 SPIKE-01 follow-up — closes the 2PL→3PL gap left in Sprint 2/3.
--
-- Defaults (a=1.0, c=0.0) match the constants Quiz used to send to Adaptive
-- before this migration, so existing rows keep behaving identically until
-- a moderator (or future content authoring v2) calibrates them. Range
-- constraints mirror what Adaptive Engine validates on its DTOs.

ALTER TABLE quiz_schema.questions
    ADD COLUMN discrimination_a REAL NOT NULL DEFAULT 1.0,
    ADD COLUMN guessing_c       REAL NOT NULL DEFAULT 0.0;

ALTER TABLE quiz_schema.questions
    ADD CONSTRAINT chk_discrimination_a_pos CHECK (discrimination_a > 0),
    ADD CONSTRAINT chk_guessing_c_range     CHECK (guessing_c >= 0 AND guessing_c < 1);
