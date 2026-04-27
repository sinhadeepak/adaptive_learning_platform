#!/usr/bin/env bash
# End-to-end smoke for the eight AI surfaces.
#
# Usage:
#   ./smoke-ai.sh                       # uses http://localhost
#   ./smoke-ai.sh http://192.168.1.42   # test through your Windows host LAN IP
#
# Each call prints PASS/FAIL plus the source field (ai|heuristic|stub).
# Exits non-zero on the first hard failure (network/HTTP); a "stub" or
# "heuristic" response is considered PASS for routes that have a fallback.

set -u

HOST="${1:-http://localhost}"
ADAPTIVE="$HOST:38010"
QUIZ="$HOST:38011"

# Persistent test user — `student@alp.dev` is seeded by Auth migration 004.
USER_ID="00000000-0000-0000-0000-000000000001"
TOPIC_ID="33333333-0000-0000-0000-000000000001"  # Mechanics — seeded

GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
DIM=$'\033[0;90m'
RST=$'\033[0m'

pass() { echo "${GREEN}PASS${RST}  $1 ${DIM}$2${RST}"; }
fail() { echo "${RED}FAIL${RST}  $1 ${DIM}$2${RST}"; FAILED=1; }

FAILED=0

echo "ALP AI smoke — $HOST"
echo "─────────────────────────────────────────────"

# 1. ai-status — confirms adaptive-engine is reachable + tells us if LLM is on.
out=$(curl -fsS "$ADAPTIVE/adaptive/ai-status" 2>/dev/null) || { fail "ai-status" "service unreachable"; exit 1; }
enabled=$(echo "$out" | grep -o '"enabled":[^,}]*' | cut -d: -f2)
pass "ai-status" "enabled=$enabled"
[ "$enabled" = "true" ] && AI_ON=1 || AI_ON=0

# 2. study-plan
out=$(curl -fsS "$ADAPTIVE/adaptive/study-plan/$USER_ID?exam=NEET" 2>/dev/null) || { fail "study-plan" "request failed"; exit 1; }
src=$(echo "$out" | grep -o '"source":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "study-plan" "source=$src"

# 3. guided-next-steps
out=$(curl -fsS "$ADAPTIVE/adaptive/guided-next-steps/$USER_ID" 2>/dev/null) || { fail "guided-next-steps" "request failed"; exit 1; }
src=$(echo "$out" | grep -o '"source":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "guided-next-steps" "source=$src"

# 4. rank-projection
out=$(curl -fsS "$ADAPTIVE/adaptive/rank-projection/$USER_ID?exam=NEET" 2>/dev/null) || { fail "rank-projection" "request failed"; exit 1; }
src=$(echo "$out" | grep -o '"source":"[^"]*"' | head -1 | cut -d'"' -f4)
rank=$(echo "$out" | grep -o '"projectedRank":[0-9]*' | cut -d: -f2)
pass "rank-projection" "source=$src rank=$rank"

# 5. weakness-diagnosis
out=$(curl -fsS "$ADAPTIVE/adaptive/weakness-diagnosis/$USER_ID" 2>/dev/null) || { fail "weakness-diagnosis" "request failed"; exit 1; }
src=$(echo "$out" | grep -o '"source":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "weakness-diagnosis" "source=$src"

# 6. explain — POST with sample MCQ
out=$(curl -fsS -X POST "$ADAPTIVE/adaptive/explain" \
    -H "content-type: application/json" \
    -d '{"stem":"What is the SI unit of force?","choices":["Joule","Watt","Newton","Pascal"],"correctIdx":2,"pickedIdx":0}' 2>/dev/null) \
    || { fail "explain" "request failed"; exit 1; }
src=$(echo "$out" | grep -o '"source":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "explain" "source=$src"

# 7. doubt/photo — 1x1 transparent PNG, exercises route + stub when LLM off
TINY_PNG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
out=$(curl -fsS -X POST "$ADAPTIVE/adaptive/doubt/photo" \
    -H "content-type: application/json" \
    -d "{\"imageDataUrl\":\"$TINY_PNG\"}" 2>/dev/null) \
    || { fail "doubt/photo" "request failed"; exit 1; }
src=$(echo "$out" | grep -o '"source":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "doubt/photo" "source=$src"

# 8. tutor/chat — SSE; we just check the stream returns a [DONE] frame
out=$(curl -fsS -X POST "$ADAPTIVE/adaptive/tutor/chat" \
    -H "content-type: application/json" \
    -d "{\"topicId\":\"$TOPIC_ID\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}" 2>/dev/null) \
    || { fail "tutor/chat" "request failed"; exit 1; }
if echo "$out" | grep -q "\[DONE\]"; then
    pass "tutor/chat" "stream completed"
else
    fail "tutor/chat" "stream did not emit [DONE]"
fi

# 9. authoring — generate-questions
out=$(curl -fsS -X POST "$ADAPTIVE/adaptive/authoring/generate-questions" \
    -H "content-type: application/json" \
    -d "{\"topicId\":\"$TOPIC_ID\",\"count\":3,\"language\":\"en\",\"difficulty\":\"mixed\"}" 2>/dev/null) \
    || { fail "authoring" "request failed"; exit 1; }
src=$(echo "$out" | grep -o '"source":"[^"]*"' | head -1 | cut -d'"' -f4)
nq=$(echo "$out" | grep -o '"questions":\[' | wc -l)
pass "authoring" "source=$src"

# 10. quiz/questions — supporting endpoint photo-doubt depends on
out=$(curl -fsS "$QUIZ/quiz/questions?topicId=$TOPIC_ID&limit=3" 2>/dev/null) \
    || { fail "quiz/questions" "request failed"; exit 1; }
nq=$(echo "$out" | grep -o '"id"' | wc -l)
pass "quiz/questions" "items=$nq"

# 11. quiz/users/.../answered-items — supporting endpoint weakness depends on
out=$(curl -fsS "$QUIZ/quiz/users/$USER_ID/answered-items?limit=3" 2>/dev/null) \
    || { fail "quiz answered-items" "request failed"; exit 1; }
nq=$(echo "$out" | grep -o '"items":\[' | wc -l)
pass "quiz answered-items" "responded"

echo "─────────────────────────────────────────────"
if [ "$FAILED" = "0" ]; then
    if [ "$AI_ON" = "1" ]; then
        echo "${GREEN}All 11 surfaces green${RST} — AI mode active."
    else
        echo "${GREEN}All 11 surfaces green${RST} — heuristic mode (set OPENAI_API_KEY for AI)."
    fi
    exit 0
else
    echo "${RED}One or more surfaces failed${RST} — see details above."
    exit 1
fi
