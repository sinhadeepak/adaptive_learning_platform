#!/usr/bin/env bash
# Pre-deploy static verification (no Docker required).
#
# Catches what the live smoke would catch about route registration,
# migration linearity, and import-time errors — without needing the
# full stack up. Useful when Docker is down or before pushing to
# staging.
#
# Exits 0 on full pass, 1 on any failure.

set -euo pipefail

GREEN=$'\e[32m'
RED=$'\e[31m'
RST=$'\e[0m'

ok()   { printf "${GREEN}✓ %s${RST}\n" "$*"; }
fail() { printf "${RED}✗ %s${RST}\n" "$*"; FAIL=1; }

FAIL=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# -- 1. migration chain linearity ------------------------------------

echo "==> migration linearity"

python3 - <<'EOF'
import re, sys
from pathlib import Path

failures = 0
def check(d, name, expected_count):
    global failures
    files = sorted(Path(d).glob("*.py"))
    files = [f for f in files if f.name != "__init__.py"]
    if len(files) != expected_count:
        print(f"  ✗ {name}: expected {expected_count} migrations, found {len(files)}")
        failures += 1
        return
    expected_down = "None"
    for f in files:
        text = f.read_text()
        rev_m = re.search(r'^revision:\s*str\s*=\s*"(\w+)"', text, re.M)
        down_m = re.search(r'^down_revision:\s*str\s*\|\s*None\s*=\s*"?(\w+|None)"?', text, re.M)
        if not rev_m:
            print(f"  ✗ {name}/{f.name}: no revision id")
            failures += 1
            return
        rev = rev_m.group(1)
        down = down_m.group(1) if down_m else "?"
        if down != expected_down:
            print(f"  ✗ {name}/{f.name}: down={down}, expected {expected_down}")
            failures += 1
            return
        expected_down = rev
    print(f"  ✓ {name}: {len(files)} linear migrations")

check("services/learning/alembic/content/versions",  "content_schema",  18)
check("services/learning/alembic/catalog/versions",  "catalog_schema",  16)
check("services/engagement/alembic/analytics/versions", "analytics_schema", 14)

if failures > 0:
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then fail "migration chain check"; else ok "migration chains linear"; fi

# -- 2. learning service imports + route registration ----------------

echo "==> learning service imports"

cd services/learning
ROUTE_COUNT=$(uv run --quiet python <<'EOF' 2>&1 || echo "ERROR"
import os
[os.environ.setdefault(k, v) for k, v in {
    'DATABASE_URL':'postgresql+asyncpg://x:y@localhost/test',
    'CATALOG_DATABASE_URL':'postgresql+asyncpg://x:y@localhost/test',
    'CATALOG_NATS_URL':'nats://localhost:4222',
    'CATALOG_INSTITUTION_BASE_URL':'http://x',
    'CATALOG_JWT_SECRET':'a'*40,
    'CONTENT_DATABASE_URL':'postgresql+asyncpg://x:y@localhost/test',
    'CONTENT_NATS_URL':'nats://localhost:4222',
    'CONTENT_JWT_SECRET':'a'*40,
    'CONTENT_CATALOG_BASE_URL':'http://x',
    'DOUBTS_DATABASE_URL':'postgresql+asyncpg://x:y@localhost/test',
    'DOUBTS_JWT_SECRET':'a'*40,
    'SEARCH_OPENSEARCH_URL':'http://localhost',
    'SEARCH_NATS_URL':'nats://localhost:4222',
    'SEARCH_CATALOG_BASE_URL':'http://x',
    'ADAPTIVE_ENGINE_NATS_URL':'nats://localhost:4222',
    'ADAPTIVE_ENGINE_INSTITUTION_BASE_URL':'http://x',
    'ADAPTIVE_ENGINE_CATALOG_BASE_URL':'http://x',
    'ADAPTIVE_ENGINE_ANALYTICS_BASE_URL':'http://x',
    'ADAPTIVE_ENGINE_QUIZ_BASE_URL':'http://x',
    'ADAPTIVE_ENGINE_REDIS_URL':'redis://localhost:6379/0',
    'OPENAI_API_KEY':'',
    'ADAPTIVE_ENGINE_OPENAI_MODEL':'gpt-4o-mini',
}.items()]
from learning.main import app
phase5_paths = ('/grading','/content/ai','/content/types','/localisation','/admin/ai',
                '/evaluation','/adaptive/diagnostic','/adaptive/select')
phase5 = sum(1 for r in app.routes if any(p in getattr(r,'path','') for p in phase5_paths))
print(phase5)
EOF
)

cd "$ROOT"
if [ "$ROUTE_COUNT" = "ERROR" ] || [ -z "$ROUTE_COUNT" ]; then
  fail "learning app imports"
elif [ "$ROUTE_COUNT" -ge 30 ]; then
  ok "learning app imports + $ROUTE_COUNT Phase 5 routes registered"
else
  fail "expected ≥ 30 Phase 5 routes, got $ROUTE_COUNT"
fi

# -- 3. backend test suite -------------------------------------------

echo "==> backend tests"

cd services/learning
TEST_COUNT=$(uv run --quiet python -m pytest tests/payload_contracts/ -q --tb=no 2>&1 | tail -3 | grep -E '[0-9]+ passed' | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+')
cd "$ROOT"

if [ -z "$TEST_COUNT" ] || [ "$TEST_COUNT" -lt 400 ]; then
  fail "expected ≥ 400 backend tests passing, got '${TEST_COUNT:-none}'"
else
  ok "$TEST_COUNT backend tests passing"
fi

# -- 4. type registry coverage ---------------------------------------

echo "==> type registry coverage"

cd services/learning
TYPE_COUNT=$(uv run --quiet python <<'EOF' 2>&1 || echo "ERROR"
from learning.types.bootstrap import register_all_v1_handlers
from learning.types import all_type_metas
from learning.types.registry import _reset_for_tests
_reset_for_tests()
register_all_v1_handlers()
print(len(all_type_metas()))
EOF
)
cd "$ROOT"

if [ "$TYPE_COUNT" = "ERROR" ] || [ -z "$TYPE_COUNT" ]; then
  fail "type registry boot"
elif [ "$TYPE_COUNT" -ge 28 ]; then
  ok "$TYPE_COUNT type handlers registered"
else
  fail "expected ≥ 28 handlers, got $TYPE_COUNT"
fi

# -- 5. prompt template registry -------------------------------------

echo "==> prompt template registry"

PROMPT_COUNT=$(find prompts -name "*.yaml" 2>/dev/null | wc -l)
if [ "$PROMPT_COUNT" -ge 14 ]; then
  ok "$PROMPT_COUNT prompt templates present"
else
  fail "expected ≥ 14 prompt templates, found $PROMPT_COUNT"
fi

# -- 6. routing config -----------------------------------------------

echo "==> AI routing config"

if [ -f config/ai_routing.yaml ]; then
  TOUCHPOINTS=$(grep -E "^\s+(authoring|quality_check|evaluation|translation|vision):" \
    config/ai_routing.yaml | wc -l)
  if [ "$TOUCHPOINTS" -ge 5 ]; then
    ok "config/ai_routing.yaml has all 5 touchpoints"
  else
    fail "ai_routing.yaml missing touchpoints (found $TOUCHPOINTS, need 5)"
  fi
else
  fail "config/ai_routing.yaml missing"
fi

# -- summary ---------------------------------------------------------

echo
if [ "$FAIL" -eq 0 ]; then
  printf "${GREEN}All static checks passed. Deploy can proceed when Docker is up.${RST}\n"
  exit 0
else
  printf "${RED}Static verification failed. Fix above before deploying.${RST}\n"
  exit 1
fi
