#!/usr/bin/env bash
# Smoke-test every analytics + gamification endpoint after a deploy.
# Companion to docs/MANUAL_TESTING_PLAYBOOK.md.
#
# Exit codes:
#   0  all critical endpoints HTTP 200/201
#   1  one or more critical endpoints failed

set -uo pipefail

U=${TEST_USER_ID:-00000000-0000-0000-0000-000000000001}
TID=${TEST_TOPIC_ID:-33333333-0000-0000-0000-000000000002}
CID=${TEST_COHORT_ID:-66666666-0000-0000-0000-000000000001}
TENANT=${TEST_TENANT_ID:-55555555-0000-0000-0000-000000000001}

ENGAGEMENT=${ENGAGEMENT_URL:-http://localhost:38100}
LEARNING=${LEARNING_URL:-http://localhost:38101}
QUIZ=${QUIZ_URL:-http://localhost:38011}

failures=0

test_endpoint() {
    local name="$1"
    local expected_code="$2"
    shift 2
    local resp code
    resp=$(curl -sw "\n__HTTP %{http_code}" "$@" 2>/dev/null)
    code=$(echo "$resp" | tail -1 | cut -d' ' -f2)
    if [[ "$code" == "$expected_code" ]]; then
        printf "  ✓ %-45s HTTP %s\n" "$name" "$code"
    else
        printf "  ✗ %-45s HTTP %s (expected %s)\n" "$name" "$code" "$expected_code"
        failures=$((failures + 1))
    fi
}

echo "═══ STUDENT endpoints ═══"
test_endpoint "mastery"            200 "$ENGAGEMENT/analytics/mastery/$U"
test_endpoint "readiness"          200 "$ENGAGEMENT/analytics/readiness/$U"
test_endpoint "daily-activity 30d" 200 "$ENGAGEMENT/analytics/daily-activity/$U?days=30"
test_endpoint "streak"             200 "$ENGAGEMENT/analytics/streak/$U"
test_endpoint "time-to-mastery"    200 "$ENGAGEMENT/analytics/time-to-mastery/$U/$TID"
test_endpoint "confidence-gap"     200 "$ENGAGEMENT/analytics/confidence-gap/$U"
test_endpoint "career-outcomes"    200 "$ENGAGEMENT/analytics/career-outcomes?examCode=NEET&readiness=0.6"
test_endpoint "rank-trajectory"    200 "$ENGAGEMENT/analytics/mock/NEET/trajectory/$U"
test_endpoint "national-rank"      200 "$ENGAGEMENT/analytics/mock/NEET/national-rank/$U"
test_endpoint "real-exam-outcomes" 200 "$ENGAGEMENT/analytics/real-exam-outcomes/$U"
test_endpoint "user xp"            200 "$ENGAGEMENT/gamification/users/$U/xp"

echo "═══ TEACHER endpoints ═══"
test_endpoint "topic-heatmap"      200 "$ENGAGEMENT/analytics/cohorts/$CID/topic-heatmap"
test_endpoint "trend 30d"          200 "$ENGAGEMENT/analytics/cohorts/$CID/trend?days=30"
test_endpoint "summary"            200 "$ENGAGEMENT/analytics/cohorts/$CID/summary"
test_endpoint "leaderboard"        200 "$ENGAGEMENT/analytics/cohorts/$CID/leaderboard"
test_endpoint "common-mistakes"    200 "$ENGAGEMENT/analytics/cohorts/$CID/common-mistakes"
test_endpoint "at-risk"            200 "$ENGAGEMENT/analytics/predictive/cohorts/$CID/at-risk"
test_endpoint "lesson-recommender" 200 "$LEARNING/adaptive/lesson-recommender?cohortId=$CID"

echo "═══ ADMIN endpoints ═══"
test_endpoint "intervention-efficacy" 200 "$ENGAGEMENT/analytics/institution/$TENANT/intervention-efficacy"
test_endpoint "outcomes-report html"  200 "$ENGAGEMENT/analytics/institution/$TENANT/outcomes-report?format=html"
test_endpoint "national leaderboard"  200 "$ENGAGEMENT/analytics/mock/NEET/national-leaderboard"
test_endpoint "SILVER league"         200 "$ENGAGEMENT/gamification/leagues/SILVER"
test_endpoint "compare students"      200 "$ENGAGEMENT/analytics/compare/students?a=$U&b=80a6b1b7-4add-5cc3-afd5-c41a48b41aa8"

echo "═══ Phase 1D-1 quiz endpoint ═══"
SID=$(docker exec alp-local-postgres-1 psql -U postgres -d quiz -t -c \
    "SELECT id::text FROM quiz_schema.quiz_sessions WHERE status='SUBMITTED' AND user_id::text='$U' LIMIT 1" 2>/dev/null | tr -d ' \n')
if [[ -n "$SID" ]]; then
    test_endpoint "per-question-time" 200 "$QUIZ/quiz/sessions/$SID/per-question-time"
fi
test_endpoint "batch mock-summaries"  200 -X POST "$QUIZ/quiz/internal/users/mock-summaries" \
    -H "Content-Type: application/json" -d "{\"userIds\":[\"$U\"]}"

echo
if [[ $failures -gt 0 ]]; then
    echo "❌ $failures endpoint(s) failed"
    exit 1
fi
echo "✅ All endpoints passed"
exit 0
