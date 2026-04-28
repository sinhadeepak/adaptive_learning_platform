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
TEACHER_EMAIL="teacher@alp.dev"
TEACHER_PASSWORD="Password123!"
TEACHER_ID="00000000-0000-0000-0000-000000000002"
ADMIN_EMAIL="admin@alp.dev"
ADMIN_PASSWORD="Password123!"
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
# -- 5. marketplace tutor flow ---------------------------------------------

echo "==> marketplace (tutor application FSM)"

# Wipe any prior tutor state so re-runs are deterministic.
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d marketplace -c \
  "TRUNCATE marketplace_schema.tutor_topics, marketplace_schema.tutor_availability, \
            marketplace_schema.tutor_qualifications, marketplace_schema.tutor_profiles \
   RESTART IDENTITY CASCADE" >/dev/null 2>&1

# Login as teacher
TEACHER_LOGIN=$(curl -s -X POST "$IDENTITY_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEACHER_EMAIL\",\"password\":\"$TEACHER_PASSWORD\"}")
TEACHER_TOKEN=$(echo "$TEACHER_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])" 2>/dev/null || true)
assert "teacher login → JWT" test -n "$TEACHER_TOKEN"

# Apply
APPLY_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/tutors/apply" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"displayName\":\"Sample Teacher\",\"headline\":\"Smoke-test tutor\",\"bio\":\"\",\"hourlyRatePaise\":50000,\"qualifications\":[],\"availability\":[{\"dayOfWeek\":1,\"startMinute\":1080,\"endMinute\":1260}],\"topicIds\":[\"$MECHANICS_TOPIC\"]}")
assert "tutor application accepted (APPLIED)" \
  bash -c "echo '$APPLY_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['applicationStatus']=='APPLIED'\""

# KYC start
curl -s -X POST "$MARKETPLACE_URL/marketplace/tutors/me/kyc/start" \
  -H "Authorization: Bearer $TEACHER_TOKEN" >/dev/null
KYC_POLL=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/tutors/me/kyc/poll" \
  -H "Authorization: Bearer $TEACHER_TOKEN")
assert "stub KYC reaches KYC_VERIFIED" \
  bash -c "echo '$KYC_POLL' | python3 -c \"import sys,json; assert json.load(sys.stdin)['applicationStatus']=='KYC_VERIFIED'\""

# Admin approve
ADMIN_LOGIN=$(curl -s -X POST "$IDENTITY_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])" 2>/dev/null || true)

APPROVE_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/admin/tutors/$TEACHER_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
assert "admin approves → APPROVED" \
  bash -c "echo '$APPROVE_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['applicationStatus']=='APPROVED'\""

# Tutor activates
ACT_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/tutors/me/activate" \
  -H "Authorization: Bearer $TEACHER_TOKEN")
assert "tutor self-activates → ACTIVE" \
  bash -c "echo '$ACT_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['applicationStatus']=='ACTIVE'\""

# Public listing
LISTING=$(curl -s "$MARKETPLACE_URL/marketplace/tutors?topicId=$MECHANICS_TOPIC")
assert "active tutor visible in public listing" \
  bash -c "echo '$LISTING' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['total']>=1 and any(it['userId']=='$TEACHER_ID' for it in d['items'])\""

# -- 6. booking flow (Sprint 17) -------------------------------------------

echo "==> marketplace bookings (P3-S2)"

# Compute a slot 48h from now during the teacher's availability window
# (Mon 18:00–21:00 UTC, set in the apply step above). We just pick 48h
# ahead and assume it's in some window — the smoke just needs the
# tutor's availability to be permissive. Tighten later.
SLOT_START=$(python3 -c "
from datetime import datetime, timedelta, timezone
# 48 hours from now, snapped to the hour
t = datetime.now(timezone.utc) + timedelta(hours=48)
t = t.replace(minute=0, second=0, microsecond=0)
print(t.isoformat())
")
SLOT_END=$(python3 -c "
from datetime import datetime, timedelta, timezone
t = datetime.now(timezone.utc) + timedelta(hours=49)
t = t.replace(minute=0, second=0, microsecond=0)
print(t.isoformat())
")

# Patch teacher availability to cover all hours every day so the smoke
# slot is guaranteed to fit a window. Quick + dirty.
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d marketplace -c \
  "DELETE FROM marketplace_schema.tutor_availability WHERE tutor_user_id='$TEACHER_ID'; \
   INSERT INTO marketplace_schema.tutor_availability (id, tutor_user_id, day_of_week, start_minute, end_minute) \
   SELECT gen_random_uuid(), '$TEACHER_ID', d, 0, 1440 FROM generate_series(0,6) d" >/dev/null 2>&1

# Student creates booking
BOOKING_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/bookings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tutorUserId\":\"$TEACHER_ID\",\"slotStart\":\"$SLOT_START\",\"slotEnd\":\"$SLOT_END\"}")
BOOKING_ID=$(echo "$BOOKING_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)
assert "student created booking → PENDING_PAYMENT" \
  bash -c "echo '$BOOKING_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='PENDING_PAYMENT'\""

# Confirm payment (stub)
CONFIRM_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/bookings/$BOOKING_ID/confirm-payment" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}')
assert "stub payment confirms → CONFIRMED + Daily room URL" \
  bash -c "echo '$CONFIRM_RESP' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['status']=='CONFIRMED' and d['dailyRoomUrl'].startswith('https://example.daily.co/')\""

# Tutor starts session
START_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/bookings/$BOOKING_ID/start" \
  -H "Authorization: Bearer $TEACHER_TOKEN")
assert "tutor starts session → IN_PROGRESS" \
  bash -c "echo '$START_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='IN_PROGRESS'\""

# Tutor completes session
COMPLETE_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/bookings/$BOOKING_ID/complete" \
  -H "Authorization: Bearer $TEACHER_TOKEN")
assert "tutor completes session → COMPLETED" \
  bash -c "echo '$COMPLETE_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='COMPLETED'\""

# Booking shows in student my-bookings
MY_BOOKINGS=$(curl -s "$MARKETPLACE_URL/marketplace/bookings/me" \
  -H "Authorization: Bearer $TOKEN")
assert "booking appears in student my-bookings" \
  bash -c "echo '$MY_BOOKINGS' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert any(b['id']=='$BOOKING_ID' and b['status']=='COMPLETED' for b in d['items'])\""

# Sprint 18 — student rates the completed booking.
RATE_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/bookings/$BOOKING_ID/rating" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stars":5,"comment":"Great session"}')
assert "student rates completed booking → 5 stars" \
  bash -c "echo '$RATE_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['stars']==5\""

# -- 7. creator content marketplace (Sprint 18) ----------------------------

echo "==> creator marketplace (P3-S3)"

CREATOR_EMAIL="moderator@alp.dev"
CREATOR_ID="00000000-0000-0000-0000-000000000003"
CREATOR_LOGIN=$(curl -s -X POST "$IDENTITY_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$CREATOR_EMAIL\",\"password\":\"Password123!\"}")
CREATOR_TOKEN=$(echo "$CREATOR_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])" 2>/dev/null || true)
assert "creator login → JWT" test -n "$CREATOR_TOKEN"

docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d marketplace -c \
  "TRUNCATE marketplace_schema.course_ratings, marketplace_schema.course_purchases, \
            marketplace_schema.courses, marketplace_schema.creator_profiles \
   RESTART IDENTITY CASCADE" >/dev/null 2>&1

curl -s -X POST "$MARKETPLACE_URL/marketplace/creators/apply" \
  -H "Authorization: Bearer $CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Sample Creator","headline":"Smoke","bio":""}' >/dev/null

curl -s -X POST "$MARKETPLACE_URL/marketplace/creators/me/kyc/start" \
  -H "Authorization: Bearer $CREATOR_TOKEN" >/dev/null
KYC_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/creators/me/kyc/poll" \
  -H "Authorization: Bearer $CREATOR_TOKEN")
assert "creator KYC reaches KYC_VERIFIED" \
  bash -c "echo '$KYC_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['applicationStatus']=='KYC_VERIFIED'\""

curl -s -X POST "$MARKETPLACE_URL/marketplace/admin/creators/$CREATOR_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" >/dev/null

ACT_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/creators/me/activate" \
  -H "Authorization: Bearer $CREATOR_TOKEN")
assert "creator activates → ACTIVE" \
  bash -c "echo '$ACT_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['applicationStatus']=='ACTIVE'\""

COURSE_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/courses" \
  -H "Authorization: Bearer $CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Course","description":"Test","contentMd":"# Hello\nReal content.","pricePaise":9900,"tier":"STANDARD","topicIds":[]}')
COURSE_ID=$(echo "$COURSE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)
assert "creator creates DRAFT course" \
  bash -c "echo '$COURSE_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='DRAFT'\""

curl -s -X POST "$MARKETPLACE_URL/marketplace/courses/$COURSE_ID/submit-for-review" \
  -H "Authorization: Bearer $CREATOR_TOKEN" >/dev/null
APPROVE_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/admin/courses/$COURSE_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
assert "admin approves course → PUBLISHED" \
  bash -c "echo '$APPROVE_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='PUBLISHED'\""

PURCHASE_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/courses/$COURSE_ID/purchase" \
  -H "Authorization: Bearer $TOKEN")
PURCHASE_ID=$(echo "$PURCHASE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)

CONFIRM_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/courses/$COURSE_ID/purchase/$PURCHASE_ID/confirm-payment" \
  -H "Authorization: Bearer $TOKEN")
assert "course payment confirms → PAID" \
  bash -c "echo '$CONFIRM_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='PAID'\""

COURSE_RATE_RESP=$(curl -s -X POST "$MARKETPLACE_URL/marketplace/courses/$COURSE_ID/rating" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"purchaseId\":\"$PURCHASE_ID\",\"stars\":4,\"comment\":\"Solid\"}")
assert "student rates course → 4 stars" \
  bash -c "echo '$COURSE_RATE_RESP' | python3 -c \"import sys,json; assert json.load(sys.stdin)['stars']==4\""

# -- summary ---------------------------------------------------------------

if [ "$fail" -eq 0 ]; then
  printf "${GREEN}%d/%d steps passed — stack is green${RST}\n" "$step" "$step"
  exit 0
else
  printf "${RED}%d/%d steps failed — see above${RST}\n" "$fail" "$step"
  exit 1
fi
