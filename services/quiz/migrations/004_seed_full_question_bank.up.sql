-- Local-dev question bank: 20 PUBLISHED questions per topic across all
-- 24 catalog topics. Mirrors content service migration 003 — they share
-- the same topic UUIDs and the same template approach. Quiz is the
-- service the student-facing /quiz/* surface actually reads from
-- (Sprint 4 introduces the content→quiz event consumer; until then,
-- both services need their own copies of the data).
--
-- Question IDs are md5-derived from (topic_id, n) so re-running this
-- migration is a no-op via ON CONFLICT (id) DO NOTHING. The md5 form
-- can't collide with the hand-crafted UUIDs in 002 (which use the
-- 44444444-... prefix), so existing rows survive.
--
-- After this migration, the three topics seeded in 002 (Mechanics,
-- Thermodynamics, Calculus) carry 25 questions each (5 hand-crafted
-- + 20 templated); the other 21 topics get exactly 20.

INSERT INTO quiz_schema.questions
  (id, topic_id, stem, choices, correct_idx, difficulty_b, language, status)
WITH topics(id, title) AS (
  VALUES
    -- JEE Main
    ('33333333-0000-0000-0000-000000000001'::uuid, 'Mechanics'),
    ('33333333-0000-0000-0000-000000000002'::uuid, 'Thermodynamics'),
    ('33333333-0000-0000-0000-000000000003'::uuid, 'Electrostatics'),
    ('33333333-0000-0000-0000-000000000004'::uuid, 'Physical Chemistry'),
    ('33333333-0000-0000-0000-000000000005'::uuid, 'Organic Chemistry'),
    ('33333333-0000-0000-0000-000000000006'::uuid, 'Calculus'),
    ('33333333-0000-0000-0000-000000000007'::uuid, 'Coordinate Geometry'),
    -- NEET
    ('33333333-0000-0000-0000-000000000008'::uuid, 'Cell Biology'),
    ('33333333-0000-0000-0000-000000000009'::uuid, 'Genetics'),
    ('33333333-0000-0000-0000-000000000010'::uuid, 'Mechanics & Waves'),
    ('33333333-0000-0000-0000-000000000011'::uuid, 'Optics'),
    ('33333333-0000-0000-0000-000000000012'::uuid, 'Inorganic Chemistry'),
    ('33333333-0000-0000-0000-000000000013'::uuid, 'Organic Chemistry (NEET)'),
    -- UPSC_CSE
    ('33333333-0000-0000-0000-000000000014'::uuid, 'Indian Constitution'),
    ('33333333-0000-0000-0000-000000000015'::uuid, 'Governance'),
    ('33333333-0000-0000-0000-000000000016'::uuid, 'Ancient India'),
    ('33333333-0000-0000-0000-000000000017'::uuid, 'Modern India'),
    ('33333333-0000-0000-0000-000000000018'::uuid, 'Physical Geography'),
    ('33333333-0000-0000-0000-000000000019'::uuid, 'Indian Geography'),
    -- CAT
    ('33333333-0000-0000-0000-000000000020'::uuid, 'Arithmetic'),
    ('33333333-0000-0000-0000-000000000021'::uuid, 'Algebra'),
    ('33333333-0000-0000-0000-000000000022'::uuid, 'Reading Comprehension'),
    ('33333333-0000-0000-0000-000000000023'::uuid, 'Grammar & Vocabulary'),
    ('33333333-0000-0000-0000-000000000024'::uuid, 'Data Interpretation')
),
templates(idx, stem_tpl) AS (
  VALUES
    (0, 'Question %s: Which of the following best describes the core principle?'),
    (1, 'Question %s: Identify the correct statement.'),
    (2, 'Question %s: Which option is NOT a feature of this concept?'),
    (3, 'Question %s: What is the most accurate explanation?'),
    (4, 'Question %s: Choose the correct answer.')
),
difficulties(idx, b) AS (
  VALUES
    (0, -1.5::real), (1, -1.0::real), (2, -0.5::real),
    (3, 0.0::real),  (4, 0.5::real),  (5, 1.0::real),
    (6, 1.5::real)
)
SELECT
  md5(t.id::text || '-quiz-seed-v1-' || gs.n)::uuid                           AS id,
  t.id                                                                         AS topic_id,
  t.title || ' — ' || format(tpl.stem_tpl, gs.n)                              AS stem,
  jsonb_build_array(
    t.title || ' — option A for Q' || gs.n,
    t.title || ' — option B for Q' || gs.n,
    t.title || ' — option C for Q' || gs.n,
    t.title || ' — option D for Q' || gs.n
  )                                                                            AS choices,
  ((gs.n - 1) % 4)::smallint                                                   AS correct_idx,
  d.b                                                                          AS difficulty_b,
  'en'                                                                         AS language,
  'PUBLISHED'                                                                  AS status
FROM topics t
CROSS JOIN generate_series(1, 20) AS gs(n)
JOIN templates tpl ON tpl.idx = (gs.n - 1) % 5
JOIN difficulties d ON d.idx = (gs.n - 1) % 7
ON CONFLICT (id) DO NOTHING;
