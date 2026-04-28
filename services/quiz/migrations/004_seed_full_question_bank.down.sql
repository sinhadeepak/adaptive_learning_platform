-- Reverse the seed by deleting only rows whose stem matches the
-- template. Avoids touching the 15 hand-crafted rows from migration 002.
DELETE FROM quiz_schema.questions
WHERE language = 'en'
  AND status = 'PUBLISHED'
  AND stem LIKE '% — Question %';
