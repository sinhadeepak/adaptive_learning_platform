# Adaptive Learning Platform — top-level developer commands.
# All engineer workflows flow through this file. See docs/02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

PY_SERVICES := auth user-profile content catalog search analytics payment institution notification adaptive-engine
GO_SERVICES := quiz
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
	cd apps/web && pnpm install --frozen-lockfile || cd apps/web && pnpm install

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
	cd apps/web && pnpm test

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
	cd apps/web && pnpm lint && pnpm format

# -- format --

.PHONY: format
format: ## Auto-format all stacks
	@for svc in $(PY_SERVICES); do (cd services/$$svc && uv run ruff format . && uv run ruff check --fix .); done
	@for svc in $(GO_SERVICES); do (cd services/$$svc && gofmt -w -s .); done
	cd apps/web && pnpm exec prettier --write .

# -- build --

.PHONY: build
build: ## Build all Docker images (local tag: alp/<svc>:dev)
	@for svc in $(PY_SERVICES) $(GO_SERVICES); do \
	  echo "→ docker build services/$$svc"; \
	  docker build -t alp/$$svc:dev services/$$svc || exit 1; \
	done
