-- Reverse of 013. The stem strip is irreversible (we don't know what
-- prefixes existed), but the column drop is clean.

ALTER TABLE quiz_schema.questions
    DROP COLUMN IF EXISTS payload;
