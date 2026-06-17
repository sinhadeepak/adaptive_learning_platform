-- Phase 7: payload column + strip seed debug-prefix stems.
--
-- Two related fixes:
--
-- 1. Polymorphic payload column. Migration 009 mirrored question_type
--    from content_schema, but never the matching `payload` JSON. Without
--    payload, Quiz Go has nothing to ship to the polymorphic renderers
--    (CASE_STUDY rubric, NUMERIC range, ESSAY word counts, etc.) — the
--    student-side dispatcher fires but renders empty data. Add the column
--    and backfill from content_schema via dblink (same one-shot pattern
--    as migration 012's backfill).
--
-- 2. Stale debug-prefix stems. The polymorphic-engine seed code used to
--    prepend `[CBSE C8_LIGHT Case #74]`-style debug tags to every stem.
--    A previous migration (033) stripped them in content_schema, but the
--    quiz_schema mirror was already populated from the debug builds and
--    nobody refreshed it — students still see the prefix when answering.
--    Strip with a regex_replace that matches `[<TOKENS>]` at the very
--    start of the string + the optional whitespace that follows.
--
-- Both steps are idempotent; the column add is IF NOT EXISTS, the
-- backfill UPDATEs only rows where payload IS NULL, and the regex_replace
-- is a no-op for stems already cleaned.

CREATE EXTENSION IF NOT EXISTS dblink;

ALTER TABLE quiz_schema.questions
    ADD COLUMN IF NOT EXISTS payload jsonb;

-- Backfill payload for every existing row that has one in content_schema.
-- Done in a single dblink call for efficiency. Cross-DB via dblink
-- because content_schema and quiz_schema live in different logical DBs
-- on the same Postgres instance.
WITH src AS (
  SELECT * FROM dblink(
    'host=postgres port=5432 dbname=learning user=postgres password=postgres',
    $q$
      SELECT id, payload
        FROM content_schema.questions
       WHERE payload IS NOT NULL
    $q$
  ) AS t(id uuid, payload jsonb)
)
UPDATE quiz_schema.questions q
   SET payload = src.payload
  FROM src
 WHERE q.id = src.id
   AND q.payload IS NULL;

-- Strip leading `[…]` debug prefix off stems. The pattern matches an
-- opening bracket, any non-bracket characters, the closing bracket, and
-- optional whitespace. Anchored at start so we never trim mid-stem
-- legitimate brackets (e.g. "[A]" inside an MCQ choice list).
UPDATE quiz_schema.questions
   SET stem = regexp_replace(stem, '^\s*\[[^\]]+\]\s*', '')
 WHERE stem ~ '^\s*\[[^\]]+\]';
