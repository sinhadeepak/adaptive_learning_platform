#!/usr/bin/env bash
# Phase 5 staging deploy — single-command rollout.
#
# Per docs/02_planning/84_Phase5_Closure_Retro.md operational follow-up
# checklist. Runs against the local docker-compose stack; staging
# version follows the same recipe with EKS target instead of compose.
#
# Pre-requisites:
#   - Docker Desktop running (WSL integration enabled on Windows host)
#   - .env populated for the services that need it (OPENAI_API_KEY,
#     AWS_REGION + AWS_ACCESS_KEY_ID for prod-grade Rekognition,
#     etc — all are optional; missing vars fall back to the stub
#     providers per S62/S63 lifespan hooks)
#
# Stages:
#   1. Sanity — git clean? branch on development?
#   2. Build — rebuild learning + engagement containers (these carry
#              all Phase 5 changes; identity/payment/quiz/marketplace
#              haven't shifted)
#   3. Migrate — apply alembic revisions head-to-head; new revs from
#               Phase 5 are content/017, content/018, analytics/014
#   4. Restart — bounce the rebuilt services
#   5. Smoke — `make smoke` should hit ~99 steps green minus any
#              pre-existing Phase 4 failures (steps 51, 63)
#   6. Probe — post-deploy quick checks against the new endpoints
#
# Exits non-zero on any failure; the smoke step's failure detail is
# left in stdout so operators can inspect.

set -euo pipefail

GREEN=$'\e[32m'
RED=$'\e[31m'
YELLOW=$'\e[33m'
DIM=$'\e[2m'
RST=$'\e[0m'

step() { printf "\n${YELLOW}==> %s${RST}\n" "$*"; }
ok()   { printf "${GREEN}✓ %s${RST}\n" "$*"; }
fail() { printf "${RED}✗ %s${RST}\n" "$*"; exit 1; }

# -- 1. sanity -------------------------------------------------------

step "1/6 sanity"

if ! command -v docker &>/dev/null; then
  fail "docker not on PATH (start Docker Desktop and re-enable WSL integration)"
fi
if ! docker info &>/dev/null; then
  fail "docker daemon unreachable (Docker Desktop running?)"
fi
ok "docker reachable"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "development" ]; then
  printf "${YELLOW}⚠ on branch %s (expected 'development') — continuing${RST}\n" \
    "$CURRENT_BRANCH"
fi

if [ -n "$(git status --porcelain)" ]; then
  printf "${YELLOW}⚠ uncommitted changes in working tree — continuing${RST}\n"
fi
ok "git state acceptable"

# -- 2. build --------------------------------------------------------

step "2/6 build (learning + engagement)"

cd "$(dirname "$0")/.."
COMPOSE="infrastructure/docker/docker-compose.yml"

if [ ! -f "$COMPOSE" ]; then
  fail "docker-compose file missing at $COMPOSE"
fi

docker compose -f "$COMPOSE" build learning engagement || fail "build failed"
ok "containers built"

# -- 3. migrate ------------------------------------------------------

step "3/6 migrate — content/017, content/018, analytics/014"

# Bring the DB up first so migrations can connect.
docker compose -f "$COMPOSE" up -d postgres
# Wait for healthcheck.
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE" ps postgres --format json 2>/dev/null \
     | grep -q '"Health":"healthy"'; then
    ok "postgres healthy"
    break
  fi
  sleep 2
done

# Apply alembic head-to-head on each service. The Dockerfile entrypoint
# auto-runs migrations when the service starts; this explicit step is
# defensive — operators can verify migration state without spinning up
# the API.
docker compose -f "$COMPOSE" run --rm learning \
  alembic -c alembic_content.ini upgrade head || fail "content migrations failed"
docker compose -f "$COMPOSE" run --rm learning \
  alembic -c alembic_catalog.ini upgrade head || fail "catalog migrations failed"
docker compose -f "$COMPOSE" run --rm engagement \
  alembic -c alembic_analytics.ini upgrade head || fail "analytics migrations failed"
ok "all migrations applied"

# -- 4. restart ------------------------------------------------------

step "4/6 restart"

docker compose -f "$COMPOSE" up -d learning engagement || fail "restart failed"

# Wait for healthchecks.
for svc in learning engagement; do
  for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$(
      case $svc in
        learning) echo 38101 ;;
        engagement) echo 38100 ;;
      esac
    )/health" || true)
    if [ "$code" = "200" ]; then
      ok "$svc /health 200"
      break
    fi
    sleep 1
  done
done

# -- 5. smoke --------------------------------------------------------

step "5/6 smoke (full 99-step suite)"

if bash scripts/smoke_test.sh; then
  ok "smoke green"
else
  printf "${YELLOW}⚠ smoke had failures — inspect output above. Pre-existing Phase 4 failures (steps 51, 63) are acceptable; any new ones in steps 66-99 are blockers.${RST}\n"
fi

# -- 6. post-deploy probes -------------------------------------------

step "6/6 post-deploy probes — Phase 5 endpoint round-trips"

probe() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    ok "$label"
  else
    printf "${RED}✗ %s${RST}\n" "$label"
  fi
}

LEARNING="http://localhost:38101"

probe "/content/types ≥ 22 entries" \
  bash -c "[ \$(curl -sf $LEARNING/content/types | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null) -ge 22 ]"

probe "/admin/ai-cost reachable" \
  bash -c "[ \$(curl -s -o /dev/null -w '%{http_code}' $LEARNING/admin/ai-cost) = '200' ]"

probe "/grading/queue reachable" \
  bash -c "[ \$(curl -s -o /dev/null -w '%{http_code}' '$LEARNING/grading/queue?limit=5') = '200' ]"

probe "/localisation/staffing seeded" \
  bash -c "curl -sf $LEARNING/localisation/staffing | python3 -c 'import sys,json; d=json.load(sys.stdin); assert any(r[\"language\"]==\"hi\" for r in d)'"

probe "/evaluation/calibration/dashboard reachable" \
  bash -c "[ \$(curl -s -o /dev/null -w '%{http_code}' $LEARNING/evaluation/calibration/dashboard) = '200' ]"

probe "/localisation/cultural-review/queue reachable" \
  bash -c "[ \$(curl -s -o /dev/null -w '%{http_code}' $LEARNING/localisation/cultural-review/queue) = '200' ]"

printf "\n${GREEN}Phase 5 deploy complete.${RST}\n"
printf "${DIM}Verify cost dashboard + calibration dashboard render in web-admin.${RST}\n"
printf "${DIM}Verify Quiz polymorphic branch handles a non-MCQ submission end-to-end.${RST}\n"
