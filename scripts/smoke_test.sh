#!/usr/bin/env bash
# Reproducible end-to-end smoke test of the consolidated 5-service stack.
# Per Sprint 14 / ADR-0005, this is the canonical "did the deploy work"
# check. Run after `make dev-reset && make dev` once migrations + seed
# are in place, or after every code-only redeploy.
#
# Exits 0 on full pass, non-zero on any assertion failure.

set -euo pipefail

# -- config -----------------------------------------------------------------

IDENTITY_URL="${IDENTITY_URL:-http://localhost:38001}"
LEARNING_URL="${LEARNING_URL:-http://localhost:38101}"
ENGAGEMENT_URL="${ENGAGEMENT_URL:-http://localhost:38100}"
QUIZ_URL="${QUIZ_URL:-http://localhost:38011}"
MARKETPLACE_URL="${MARKETPLACE_URL:-http://localhost:38110}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-35432}"
PG_USER="${PG_USER:-postgres}"
PG_CONTAINER="${PG_CONTAINER:-alp-local-postgres-1}"

STUDENT_EMAIL="student@alp.dev"
STUDENT_PASSWORD="Password123!"
STUDENT_ID="00000000-0000-0000-0000-000000000001"
JEE_MAIN_ID="11111111-0000-0000-0000-000000000001"
MECHANICS_TOPIC="33333333-0000-0000-0000-000000000001"

# -- helpers ----------------------------------------------------------------

GREEN=$'\e[32m'
RED=$'\e[31m'
DIM=$'\e[2m'
RST=$'\e[0m'

step=0
fail=0

assert() {
  step=$((step + 1))
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf "  ${GREEN}✓${RST} step %02d  %s\n" "$step" "$what"
  else
    printf "  ${RED}✗${RST} step %02d  %s\n" "$step" "$what"
    fail=$((fail + 1))
  fi
}

assert_msg() {
  step=$((step + 1))
  local what="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    printf "  ${GREEN}✓${RST} step %02d  %s ${DIM}%s${RST}\n" "$step" "$what" "$out"
  else
    printf "  ${RED}✗${RST} step %02d  %s ${DIM}%s${RST}\n" "$step" "$what" "$out"
    fail=$((fail + 1))
  fi
}

psql_q() {
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -t -A -c "$2"
}

# -- 0. health --------------------------------------------------------------

echo "==> service health"
for spec in "identity:$IDENTITY_URL" "learning:$LEARNING_URL" "engagement:$ENGAGEMENT_URL" "quiz:$QUIZ_URL" "marketplace:$MARKETPLACE_URL"; do
  name="${spec%%:*}"; url="${spec#*:}"
  assert_msg "$name /health 200" bash -c "code=\$(curl -s -o /dev/null -w '%{http_code}' '$url/health'); [ \"\$code\" = '200' ] && echo \$code"
done

# -- 1. login ---------------------------------------------------------------

echo "==> login"
LOGIN=$(curl -s -X POST "$IDENTITY_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])" 2>/dev/null || true)
assert "JWT issued" test -n "$TOKEN"
assert "user is STUDENT" bash -c "echo '$LOGIN' | python3 -c \"import sys,json; assert json.load(sys.stdin)['user']['role']=='STUDENT'\""

# -- 2. catalog -------------------------------------------------------------

echo "==> catalog"
EXAMS=$(curl -s -H "Authorization: Bearer $TOKEN" "$LEARNING_URL/catalog/exams")
assert "≥4 exams in catalog" bash -c "echo '$EXAMS' | python3 -c \"import sys,json; assert len(json.load(sys.stdin))>=4\""

SUBJECT=$(curl -s -H "Authorization: Bearer $TOKEN" "$LEARNING_URL/catalog/exams/$JEE_MAIN_ID/subjects" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
assert "JEE Main has subjects" test -n "$SUBJECT"

TOPICS=$(curl -s -H "Authorization: Bearer $TOKEN" "$LEARNING_URL/catalog/subjects/$SUBJECT/topics")
assert "≥3 topics under first subject" bash -c "echo '$TOPICS' | python3 -c \"import sys,json; assert len(json.load(sys.stdin))>=3\""

# -- 3. quiz ----------------------------------------------------------------

echo "==> quiz"
SESSION_RESP=$(curl -s -X POST "$QUIZ_URL/quiz/sessions/start" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$STUDENT_ID\",\"topicId\":\"$MECHANICS_TOPIC\",\"mode\":\"PRACTICE\",\"targetCount\":3}")
SESSION_ID=$(echo "$SESSION_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['sessionId'])" 2>/dev/null || true)
assert "quiz session started" test -n "$SESSION_ID"

# Pull first question. Dummy seed pattern: stem matches "{Topic} — Question N: ..."
# and choices match "{Topic} — option A for Q\d+". Real seed has neither.
ITEM=$(curl -s "$QUIZ_URL/quiz/sessions/$SESSION_ID/next" -H "Authorization: Bearer $TOKEN")
check_real_content() {
  ITEM="$1" python3 - <<'PY'
import json, os, re, sys
d = json.loads(os.environ["ITEM"])["item"]
combined = d["stem"] + " " + " ".join(d["choices"])
if re.search(r"option [A-D] for Q\d+", combined) or re.search(r"— Question \d+:", combined):
    sys.exit(1)
PY
}
assert "first question is real content (no dummy pattern)" check_real_content "$ITEM"

# Answer the first 3 with the actual correct answer
correct_count=0
for i in 0 1 2; do
  ITEM=$(curl -s "$QUIZ_URL/quiz/sessions/$SESSION_ID/next" -H "Authorization: Bearer $TOKEN")
  QID=$(echo "$ITEM" | python3 -c "import sys,json; print(json.load(sys.stdin)['item']['questionId'])" 2>/dev/null || true)
  IDX=$(echo "$ITEM" | python3 -c "import sys,json; print(json.load(sys.stdin)['item']['itemIdx'])" 2>/dev/null || true)
  [ -z "$QID" ] && break
  CORRECT=$(psql_q quiz "SELECT correct_idx FROM quiz_schema.questions WHERE id='$QID'")
  curl -s -X POST "$QUIZ_URL/quiz/sessions/$SESSION_ID/answers" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"itemIdx\":$IDX,\"questionId\":\"$QID\",\"choiceIdx\":$CORRECT}" >/dev/null
  correct_count=$((correct_count + 1))
done
assert "answered 3 questions correctly" test "$correct_count" -eq 3

# Submit
SUBMIT_RESP=$(curl -s -X POST "$QUIZ_URL/quiz/sessions/$SESSION_ID/submit" -H "Authorization: Bearer $TOKEN")
assert "session SUBMITTED" bash -c "echo '$SUBMIT_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='SUBMITTED'\""

# -- 4. engagement event flow -----------------------------------------------

echo "==> engagement (NATS consumers)"
sleep 3   # JetStream consumers run async; give them a moment.

MASTERY_COUNT=$(psql_q engagement "SELECT COUNT(*) FROM analytics_schema.mastery WHERE user_id='$STUDENT_ID' AND topic_id='$MECHANICS_TOPIC'")
assert "analytics_schema.mastery row exists for student/Mechanics" test "$MASTERY_COUNT" -ge 1

NOTIFICATION_COUNT=$(psql_q engagement "SELECT COUNT(*) FROM notification_schema.notifications WHERE user_id='$STUDENT_ID' AND payload->>'sessionId'='$SESSION_ID'")
assert "notification_schema.notifications row exists for this session" test "$NOTIFICATION_COUNT" -ge 1

# Engagement read endpoint
READINESS=$(curl -s -H "Authorization: Bearer $TOKEN" "$ENGAGEMENT_URL/analytics/readiness/$STUDENT_ID")
assert "readiness endpoint returns nTopics≥1" \
  bash -c "echo '$READINESS' | python3 -c \"import sys,json; assert json.load(sys.stdin)['nTopics']>=1\""

# -- summary ----------------------------------------------------------------

echo
if [ "$fail" -eq 0 ]; then
  printf "${GREEN}%d/%d steps passed — stack is green${RST}\n" "$step" "$step"
  exit 0
else
  printf "${RED}%d/%d steps failed — see above${RST}\n" "$fail" "$step"
  exit 1
fi
