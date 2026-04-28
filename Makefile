# Adaptive Learning Platform — top-level developer commands.
# All engineer workflows flow through this file. See docs/02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

PY_SERVICES := auth user-profile payment institution learning engagement
GO_SERVICES := quiz
# Sprint B closed: analytics + notification merged into engagement.
# Sprints C/D move catalog+content+doubts+search+adaptive→learning and
# auth+user-profile+institution→identity. PY_SERVICES shrinks each sprint.
NEW_PY_SERVICES := identity learning engagement
COMPOSE := docker compose -f infrastructure/docker/docker-compose.yml

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z0-9_.-]+:.*?##/ {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# -- host toolchain --

.PHONY: check-tools
check-tools: ## Verify host has Python 3.11, Go 1.22, Node 20, pnpm, uv, docker
	@echo "→ checking host toolchain..."
	@command -v python3.11 >/dev/null || { echo "✗ python3.11 missing"; exit 1; }
	@command -v go >/dev/null && go version | grep -q "go1.22" || { echo "✗ Go 1.22 missing"; exit 1; }
	@command -v node >/dev/null && node --version | grep -q "^v20" || { echo "✗ Node 20 missing"; exit 1; }
	@command -v pnpm >/dev/null || { echo "✗ pnpm missing (corepack enable + corepack prepare pnpm@9 --activate)"; exit 1; }
	@command -v uv >/dev/null || { echo "✗ uv missing (curl -LsSf https://astral.sh/uv/install.sh | sh)"; exit 1; }
	@command -v docker >/dev/null || { echo "✗ docker missing"; exit 1; }
	@echo "✓ all tools present"

.PHONY: dev-env
dev-env: ## Copy .env.example to .env if missing
	@[ -f .env ] || { cp .env.example .env && echo "→ .env created from .env.example"; }

# -- local stack --

.PHONY: dev
dev: dev-env ## Start local Docker stack (Postgres, Redis, OpenSearch, NATS, LocalStack, Mailpit)
	$(COMPOSE) up -d
	@echo "→ waiting for postgres + nats + opensearch to be healthy..."
	@$(COMPOSE) ps

.PHONY: dev-down
dev-down: ## Stop local Docker stack (preserves volumes)
	$(COMPOSE) down

.PHONY: dev-reset
dev-reset: ## Stop + delete volumes (destroys local data)
	$(COMPOSE) down -v

.PHONY: dev-logs
dev-logs: ## Tail logs for the local stack
	$(COMPOSE) logs -f

.PHONY: dev-seed
dev-seed: ## Run seed script against local Postgres + NATS (placeholder until Sprint 1)
	@echo "→ dev-seed: implemented in Sprint 1 (scripts/seed_staging.py, GAP-09)"

# -- consolidation rollout (ADR-0005) --

.PHONY: dev-new
dev-new: dev-env ## Boot the new consolidated stack (identity, learning, engagement) — runs alongside `make dev` during rollout.
	@for svc in $(NEW_PY_SERVICES); do \
	  echo "→ uv sync services/$$svc"; \
	  (cd services/$$svc && uv sync) || exit 1; \
	done
	@echo "→ infra (postgres, nats, redis, opensearch) must be up — run \`make dev\` first"
	@echo "→ launch the consolidated services manually until docker-compose entries land:"
	@echo "    cd services/engagement && uv run uvicorn engagement.main:app --port 38100"
	@echo "    cd services/learning   && uv run uvicorn learning.main:app   --port 38101"
	@echo "    cd services/identity   && uv run uvicorn identity.main:app   --port 38102"

.PHONY: contract-test
contract-test: ## Run consolidation contract tests (requires recordings/ + new services running). Usage: make contract-test bundle=engagement|learning|identity
	@if [ -z "$(bundle)" ]; then \
	  PYTHONPATH=. uv run --project services/engagement pytest tests/consolidation/ -v; \
	else \
	  PYTHONPATH=. uv run --project services/engagement pytest tests/consolidation/test_$(bundle).py -v; \
	fi

.PHONY: contract-record
contract-record: ## Capture old-service responses for the contract tests. Usage: make contract-record svcs="analytics notification"
	@if [ -z "$(svcs)" ]; then echo "Usage: make contract-record svcs=\"analytics notification\""; exit 1; fi
	PYTHONPATH=. uv run --project services/engagement python -m tests.consolidation.record $(svcs)

.PHONY: seed-hindi
seed-hindi: ## Seed 15 Hindi MCQs through Content API → bridge → Quiz bank.
	@echo "→ seeding Hindi content via Content service at $${CONTENT_BASE_URL:-http://localhost:38003}"
	@cd services/content && uv run python seed/seed_hindi.py

.PHONY: seed-restore
seed-restore: ## Restore the local seed bank (auth users + 480 real exam-prep questions in Content + Quiz).
	@echo "→ restoring auth seed (4 test users)"
	@cd services/auth && AUTH_SEED_LOCAL=1 \
	  DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:35432/auth \
	  uv run python scripts/restore_seed.py
	@echo "→ restoring content seed (480 questions, real exam-prep content)"
	@cd services/content && CONTENT_SEED_LOCAL=1 \
	  DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:35432/content \
	  uv run python scripts/restore_seed.py
	@echo "→ restoring quiz seed (mirrors content question bank)"
	@cd services/content && uv run python ../quiz/scripts/restore_seed.py

.PHONY: analytics-backfill
analytics-backfill: ## Replay any Quiz SUBMITTED sessions Analytics missed. SINCE=ISO-8601 (default 36h).
	@since="$${SINCE:-$$(date -u -d '36 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-36H +%Y-%m-%dT%H:%M:%SZ)}"; \
	echo "→ analytics backfill since $$since"; \
	cd services/analytics && uv run python -m analytics.backfill --since "$$since"

.PHONY: notification-backfill
notification-backfill: ## Replay any Quiz SUBMITTED sessions Notification missed. SINCE=ISO-8601 (default 36h).
	@since="$${SINCE:-$$(date -u -d '36 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-36H +%Y-%m-%dT%H:%M:%SZ)}"; \
	echo "→ notification backfill since $$since"; \
	cd services/notification && uv run python -m notification.backfill --since "$$since"

.PHONY: search-swap-alias
search-swap-alias: ## Swap topics alias to TARGET. Usage: TARGET=topics_v3 [REINDEX=1] [DROP_OLD=1] make search-swap-alias
	@if [ -z "$(TARGET)" ]; then echo "Usage: TARGET=topics_v3 [REINDEX=1] [DROP_OLD=1] make search-swap-alias"; exit 1; fi
	@cd services/search && uv run python -m search.swap_alias --target "$(TARGET)" \
		$(if $(REINDEX),--reindex,) \
		$(if $(DROP_OLD),--drop-old,)

# -- migrations --

# Per-service Alembic. The service name maps to its own database (one DB per service
# in local Compose; one schema per service in Aurora staging/prod). Auth is the
# template implementation — other services will mirror this pattern in Sprint 1.
.PHONY: migrate
migrate: ## Run migrations for one service.  Usage: make migrate svc=auth   (also: make migrate svc=quiz)
	@if [ -z "$(svc)" ]; then echo "Usage: make migrate svc=<service-name>"; exit 1; fi
	@if [ -d services/$(svc)/migrations ]; then \
		echo "→ go-migrate up — services/$(svc)"; \
		(cd services/$(svc) && go run ./cmd/migrate up); \
	elif [ -f services/$(svc)/alembic.ini ]; then \
		svc_upper=$$(echo "$(svc)" | tr 'a-z-' 'A-Z_'); \
		url_var=$${svc_upper}_DATABASE_URL; \
		if [ -z "$${!url_var:-}" ]; then set -a; . ./.env 2>/dev/null || true; set +a; fi; \
		url=$${!url_var}; \
		if [ -z "$$url" ]; then echo "✗ $$url_var not set. Add it to .env (see .env.example)."; exit 1; fi; \
		echo "→ alembic upgrade head — services/$(svc)"; \
		(cd services/$(svc) && DATABASE_URL=$$url uv run alembic upgrade head); \
	else \
		echo "✗ services/$(svc) has neither alembic.ini nor migrations/ — nothing to run"; \
		exit 1; \
	fi

.PHONY: migrate-status
migrate-status: ## Show current Alembic revision for one service.  Usage: make migrate-status svc=auth
	@if [ -z "$(svc)" ]; then echo "Usage: make migrate-status svc=<service-name>"; exit 1; fi
	@svc_upper=$$(echo "$(svc)" | tr 'a-z-' 'A-Z_'); \
	url_var=$${svc_upper}_DATABASE_URL; \
	if [ -z "$${!url_var:-}" ]; then set -a; . ./.env 2>/dev/null || true; set +a; fi; \
	url=$${!url_var}; \
	(cd services/$(svc) && DATABASE_URL=$$url uv run alembic current)

# -- per-stack commands --

.PHONY: install
install: install-py install-web install-go ## Install deps for all stacks

.PHONY: install-py
install-py:
	@for svc in $(PY_SERVICES); do \
	  echo "→ uv sync services/$$svc"; \
	  (cd services/$$svc && uv sync) || exit 1; \
	done

.PHONY: install-web
install-web:
	pnpm install --frozen-lockfile || pnpm install

.PHONY: install-go
install-go:
	@for svc in $(GO_SERVICES); do (cd services/$$svc && go mod tidy); done

# -- test --

.PHONY: test
test: test-py test-go test-web ## Run all tests

.PHONY: test-py
test-py:
	@for svc in $(PY_SERVICES); do \
	  echo "→ pytest services/$$svc"; \
	  (cd services/$$svc && uv run pytest) || exit 1; \
	done

.PHONY: test-go
test-go:
	@for svc in $(GO_SERVICES); do (cd services/$$svc && go test ./...); done

.PHONY: test-web
test-web:
	pnpm -r --filter=@alp/* test

# -- lint --

.PHONY: lint
lint: lint-py lint-go lint-web ## Run all linters

.PHONY: lint-py
lint-py:
	@for svc in $(PY_SERVICES); do \
	  echo "→ ruff services/$$svc"; \
	  (cd services/$$svc && uv run ruff check . && uv run ruff format --check .) || exit 1; \
	done

.PHONY: lint-go
lint-go:
	@for svc in $(GO_SERVICES); do \
	  (cd services/$$svc && go vet ./... && test -z "$$(gofmt -l -s .)" || { echo "✗ gofmt needed in $$svc"; exit 1; }); \
	done

.PHONY: lint-web
lint-web:
	pnpm -r --filter=@alp/* lint
	pnpm -r --filter=@alp/* format

# -- format --

.PHONY: format
format: ## Auto-format all stacks
	@for svc in $(PY_SERVICES); do (cd services/$$svc && uv run ruff format . && uv run ruff check --fix .); done
	@for svc in $(GO_SERVICES); do (cd services/$$svc && gofmt -w -s .); done
	pnpm -r --filter=@alp/* exec prettier --write .

# -- build --

WEB_APPS := web-student web-portal web-admin

.PHONY: build
build: ## Build all Docker images (local tag: alp/<svc>:dev)
	@for svc in $(PY_SERVICES) $(GO_SERVICES); do \
	  echo "→ docker build services/$$svc"; \
	  docker build -t alp/$$svc:dev services/$$svc || exit 1; \
	done
	@for app in $(WEB_APPS); do \
	  echo "→ docker build apps/$$app"; \
	  docker build -t alp/$$app:dev -f apps/$$app/Dockerfile . || exit 1; \
	done
