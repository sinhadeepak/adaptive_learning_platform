ALTER TABLE quiz_schema.questions DROP CONSTRAINT IF EXISTS chk_guessing_c_range;
ALTER TABLE quiz_schema.questions DROP CONSTRAINT IF EXISTS chk_discrimination_a_pos;
ALTER TABLE quiz_schema.questions DROP COLUMN IF EXISTS guessing_c;
ALTER TABLE quiz_schema.questions DROP COLUMN IF EXISTS discrimination_a;
