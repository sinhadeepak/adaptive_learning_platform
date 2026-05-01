# Adaptive Learning Platform — top-level developer commands.
# All engineer workflows flow through this file. See docs/02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

PY_SERVICES := identity payment learning engagement marketplace
GO_SERVICES := quiz
# ADR-0005 consolidation complete: identity, payment, learning, quiz, engagement.
# Marketplace is the reserved 6th slot (Phase 3).
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

.PHONY: smoke
smoke: ## Run end-to-end golden-path smoke against the running stack (99 assertions through S63).
	@bash scripts/smoke_test.sh

.PHONY: static-verify
static-verify: ## Pre-deploy static checks (no Docker): migration linearity + route registration + tests.
	@bash scripts/static_verify.sh

.PHONY: deploy-phase5
deploy-phase5: ## Phase 5 staging deploy: rebuild learning+engagement, migrate, restart, smoke, probe.
	@bash scripts/deploy_phase5.sh

# -- consolidation (ADR-0005) — historical contract-test harness left in place
#    for any future module-level boundary changes.

.PHONY: contract-test
contract-test: ## Run consolidation contract tests (requires recordings/). Usage: make contract-test bundle=engagement|learning|identity
	@if [ -z "$(bundle)" ]; then \
	  PYTHONPATH=. uv run --project services/engagement pytest tests/consolidation/ -v; \
	else \
	  PYTHONPATH=. uv run --project services/engagement pytest tests/consolidation/test_$(bundle).py -v; \
	fi

.PHONY: seed-hindi
seed-hindi: ## Seed 15 Hindi MCQs through Content API → bridge → Quiz bank.
	@echo "→ seeding Hindi content via Learning service at $${LEARNING_BASE_URL:-http://localhost:38101}"
	@cd services/learning && uv run python -m learning.content.seed.seed_hindi

.PHONY: seed-restore
seed-restore: ## Restore the local seed bank (auth users + 480 real exam-prep questions in Learning + Quiz).
	@echo "→ restoring identity (auth) seed (4 test users)"
	@cd services/identity && AUTH_SEED_LOCAL=1 \
	  DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:35432/identity \
	  uv run python -m identity.auth.scripts.restore_seed
	@echo "→ restoring learning (content) seed (480 questions, real exam-prep content)"
	@cd services/learning && CONTENT_SEED_LOCAL=1 \
	  DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:35432/learning \
	  uv run python -m learning.content.scripts.restore_seed
	@echo "→ restoring quiz seed (mirrors learning question bank)"
	@cd services/learning && uv run python ../quiz/scripts/restore_seed.py

.PHONY: engagement-backfill
engagement-backfill: ## Replay Quiz SUBMITTED sessions Engagement missed (analytics + notification). SINCE=ISO-8601 (default 36h).
	@since="$${SINCE:-$$(date -u -d '36 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-36H +%Y-%m-%dT%H:%M:%SZ)}"; \
	echo "→ engagement.analytics backfill since $$since"; \
	cd services/engagement && uv run python -m engagement.analytics.backfill --since "$$since"; \
	echo "→ engagement.notification backfill since $$since"; \
	cd services/engagement && uv run python -m engagement.notification.backfill --since "$$since"

.PHONY: search-swap-alias
search-swap-alias: ## Swap topics alias to TARGET. Usage: TARGET=topics_v3 [REINDEX=1] [DROP_OLD=1] make search-swap-alias
	@if [ -z "$(TARGET)" ]; then echo "Usage: TARGET=topics_v3 [REINDEX=1] [DROP_OLD=1] make search-swap-alias"; exit 1; fi
	@cd services/learning && uv run python -m learning.search.swap_alias --target "$(TARGET)" \
		$(if $(REINDEX),--reindex,) \
		$(if $(DROP_OLD),--drop-old,)

# -- migrations --

# Per-consolidated-service Alembic. After ADR-0005 each service's DB holds
# multiple schemas (one per absorbed module), with `version_table_schema`
# pinned per module. Run as: make migrate svc=identity mod=auth.
#   identity:    auth profile institution
#   learning:    catalog content doubts
#   engagement:  analytics notification
#   payment:     (no module split — uses the standard alembic.ini)
#   quiz:        Go service, uses `go run ./cmd/migrate up`
.PHONY: migrate
migrate: ## Run migrations.  Usage: make migrate svc=identity mod=auth   (or: make migrate svc=quiz)
	@if [ -z "$(svc)" ]; then echo "Usage: make migrate svc=<service-name> [mod=<module>]"; exit 1; fi
	@if [ -d services/$(svc)/migrations ]; then \
		echo "→ go-migrate up — services/$(svc)"; \
		(cd services/$(svc) && go run ./cmd/migrate up); \
	elif [ -n "$(mod)" ] && [ -f services/$(svc)/alembic_$(mod).ini ]; then \
		svc_upper=$$(echo "$(svc)" | tr 'a-z-' 'A-Z_'); \
		url_var=$${svc_upper}_DATABASE_URL; \
		if [ -z "$${!url_var:-}" ]; then set -a; . ./.env 2>/dev/null || true; set +a; fi; \
		url=$${!url_var}; \
		if [ -z "$$url" ]; then echo "✗ $$url_var not set. Add it to .env (see .env.example)."; exit 1; fi; \
		echo "→ alembic -c alembic_$(mod).ini upgrade head — services/$(svc)"; \
		(cd services/$(svc) && DATABASE_URL=$$url uv run alembic -c alembic_$(mod).ini upgrade head); \
	elif [ -f services/$(svc)/alembic.ini ]; then \
		svc_upper=$$(echo "$(svc)" | tr 'a-z-' 'A-Z_'); \
		url_var=$${svc_upper}_DATABASE_URL; \
		if [ -z "$${!url_var:-}" ]; then set -a; . ./.env 2>/dev/null || true; set +a; fi; \
		url=$${!url_var}; \
		if [ -z "$$url" ]; then echo "✗ $$url_var not set."; exit 1; fi; \
		echo "→ alembic upgrade head — services/$(svc)"; \
		(cd services/$(svc) && DATABASE_URL=$$url uv run alembic upgrade head); \
	else \
		echo "✗ services/$(svc) has neither alembic_<mod>.ini nor alembic.ini nor migrations/ — nothing to run"; \
		exit 1; \
	fi

.PHONY: migrate-status
migrate-status: ## Show current Alembic revision.  Usage: make migrate-status svc=identity mod=auth
	@if [ -z "$(svc)" ]; then echo "Usage: make migrate-status svc=<service-name> [mod=<module>]"; exit 1; fi
	@svc_upper=$$(echo "$(svc)" | tr 'a-z-' 'A-Z_'); \
	url_var=$${svc_upper}_DATABASE_URL; \
	if [ -z "$${!url_var:-}" ]; then set -a; . ./.env 2>/dev/null || true; set +a; fi; \
	url=$${!url_var}; \
	if [ -n "$(mod)" ] && [ -f services/$(svc)/alembic_$(mod).ini ]; then \
		(cd services/$(svc) && DATABASE_URL=$$url uv run alembic -c alembic_$(mod).ini current); \
	else \
		(cd services/$(svc) && DATABASE_URL=$$url uv run alembic current); \
	fi

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
