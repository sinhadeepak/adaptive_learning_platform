#!/usr/bin/env bash
#
# Seed synthetic PENDING_HUMAN_REVIEW evaluation_records + one
# calibration_samples row so the Grader Queue page has data to render.
#
# In production these rows land via the AI evaluator: SHORT_TEXT /
# ESSAY / etc submitted by a student → AI Gateway returns a Resolution
# with confidence < 0.75 → routing.py inserts into evaluation_records
# with status PENDING_HUMAN_REVIEW. Calibration samples land via the
# 5% deterministic-hash sampler.
#
# This helper bypasses both flows for local E2E.
#
# Idempotent: ON CONFLICT (id) DO NOTHING.
#
set -euo pipefail

CONTAINER="${1:-alp-local-postgres-1}"

echo "Seeding 3 PENDING_HUMAN_REVIEW evaluations + 1 calibration sample…"

docker exec -i "$CONTAINER" psql -U postgres -d learning <<'SQL' | tail -3

-- Pending review: low-confidence AI evaluations of ESSAY-shaped responses.
INSERT INTO content_schema.evaluation_records
  (id, response_id, evaluator_kind, evaluator_id, resolution,
   confidence, prompt_version, rubric_version, evaluated_at)
VALUES
  (
    'aaaa1111-0000-4000-a000-000000000001',
    'cccc1111-0000-4000-a000-000000000001',
    'AI', 'claude-opus-4-7',
    jsonb_build_object(
      'question_id', '163bebce-e55b-585b-8165-d5ced9cbaf5a',
      'type_id', 'SHORT_TEXT',
      'status', 'PENDING_HUMAN_REVIEW',
      'matched_count', 1,
      'total_count', 2,
      'per_part', jsonb_build_array(
        jsonb_build_object('id','c1','matched',true,
          'details', jsonb_build_object('satisfied',1.0,'note','Mentions Article 14 explicitly')),
        jsonb_build_object('id','c2','matched',false,
          'details', jsonb_build_object('satisfied',0.5,
            'note','Touches on equality before law but does not name the doctrine'))
      ),
      'evaluation_mode', 'HYBRID',
      'evaluator_metadata', jsonb_build_object(
        'model','claude-opus-4-7',
        'rubric_version',1,
        'prompt_version','essay_grade_v1.0.0',
        'human_review_required', true
      )
    ),
    0.62, 'essay_grade_v1.0.0', 1, NOW() - INTERVAL '5 minutes'
  ),
  (
    'aaaa1111-0000-4000-a000-000000000002',
    'cccc1111-0000-4000-a000-000000000002',
    'AI', 'claude-opus-4-7',
    jsonb_build_object(
      'question_id', '7eb16657-d880-571b-88d3-07cdc918f8be',
      'type_id', 'SHORT_TEXT',
      'status', 'PENDING_HUMAN_REVIEW',
      'matched_count', 0,
      'total_count', 2,
      'per_part', jsonb_build_array(
        jsonb_build_object('id','c1','matched',false,
          'details', jsonb_build_object('satisfied',0.5,
            'note','Argument is plausible but unclear whether it answers the prompt')),
        jsonb_build_object('id','c2','matched',false,
          'details', jsonb_build_object('satisfied',0.5,'note','Partial coverage of evidence'))
      ),
      'evaluation_mode', 'HYBRID',
      'evaluator_metadata', jsonb_build_object(
        'model','claude-opus-4-7',
        'rubric_version',1,
        'prompt_version','essay_grade_v1.0.0',
        'human_review_required', true
      )
    ),
    0.71, 'essay_grade_v1.0.0', 1, NOW() - INTERVAL '3 minutes'
  ),
  (
    'aaaa1111-0000-4000-a000-000000000003',
    'cccc1111-0000-4000-a000-000000000003',
    'AI', 'claude-opus-4-7',
    jsonb_build_object(
      'question_id', '7fdf98a9-ac66-5199-9c13-0a640cc3508b',
      'type_id', 'SHORT_TEXT',
      'status', 'PENDING_HUMAN_REVIEW',
      'matched_count', 1,
      'total_count', 2,
      'per_part', jsonb_build_array(
        jsonb_build_object('id','c1','matched',true,
          'details', jsonb_build_object('satisfied',1.0,'note','Strong opening')),
        jsonb_build_object('id','c2','matched',false,
          'details', jsonb_build_object('satisfied',0.0,
            'note','Conclusion missing — student appears to have run out of words'))
      ),
      'evaluation_mode', 'HYBRID',
      'evaluator_metadata', jsonb_build_object(
        'model','claude-opus-4-7',
        'rubric_version',1,
        'prompt_version','essay_grade_v1.0.0',
        'human_review_required', true
      )
    ),
    0.55, 'essay_grade_v1.0.0', 1, NOW() - INTERVAL '1 minute'
  )
ON CONFLICT (id) DO NOTHING;

-- One calibration sample (5% routine sample even on high-confidence AI).
INSERT INTO content_schema.calibration_samples
  (id, response_id, ai_resolution, criterion, ai_score, sampled_at)
VALUES (
  'bbbb2222-0000-4000-a000-000000000001',
  'cccc1111-0000-4000-a000-000000000004',
  jsonb_build_object(
    'question_id','163bebce-e55b-585b-8165-d5ced9cbaf5a',
    'type_id','SHORT_TEXT',
    'status','CORRECT',
    'matched_count',2,
    'total_count',2,
    'evaluation_mode','HYBRID'
  ),
  'factual_accuracy',
  1.0,
  NOW() - INTERVAL '2 minutes'
)
ON CONFLICT (id) DO NOTHING;

SELECT 'pending_review: ' || count(*)
  FROM content_schema.evaluation_records
 WHERE evaluator_kind='AI' AND resolution->>'status'='PENDING_HUMAN_REVIEW';
SELECT 'calibration_unlabelled: ' || count(*)
  FROM content_schema.calibration_samples WHERE human_score IS NULL;
SQL

echo "Seed complete."
