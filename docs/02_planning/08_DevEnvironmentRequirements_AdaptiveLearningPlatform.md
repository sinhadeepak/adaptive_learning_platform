# Developer Environment Requirements

**Project**: Adaptive Learning Platform
**Audience**: New engineers joining the team; also serves as the baseline for Sprint 0 Task T-03 (Local Dev Stack).
**Goal**: A developer can clone the repo and run `make dev` to bring all 11 services + infrastructure up locally in under 15 minutes.

Authoritative references: [HLD](../01_design/01_HLD_Adaptive_Learning_Platform.docx), [Infrastructure & DevOps Design](../01_design/06_Infrastructure_DevOps_Design_AdaptiveLearningPlatform.docx), [Security Design](../01_design/05_SecurityDesign_ThreatModel_AdaptiveLearningPlatform.docx).

---

## 1. Supported operating systems

| OS | Status | Notes |
|---|---|---|
| macOS 13+ (Apple Silicon or Intel) | **Primary supported** | Most engineers use macOS. Native Docker Desktop. |
| Ubuntu 22.04 / 24.04 LTS | **Primary supported** | Native Docker; best performance. |
| Windows 11 + WSL2 (Ubuntu 22.04) | **Supported** | Run everything inside WSL2; do not use Docker Desktop for Windows without WSL2 backend. |
| Windows native | **Not supported** | Docker Desktop Linux containers only; Go + Python tooling expects POSIX paths. |

Minimum hardware: 16 GB RAM, 8 CPU cores, 100 GB free disk. The local stack with all 11 services + databases + observability uses ~8 GB RAM steady-state.

---

## 2. Required system tools (install first)

| Tool | Min version | Install |
|---|---|---|
| `git` | 2.40 | OS package manager |
| `docker` + `docker compose` | Docker Engine 24.0, Compose v2.20 | [docs.docker.com](https://docs.docker.com) |
| `make` | 4.0 | OS package manager |
| `curl`, `jq`, `openssl`, `unzip` | any recent | OS package manager |
| `awscli` v2 | 2.15 | `brew install awscli` / official installer |
| `kubectl` | 1.29 (matches EKS) | `brew install kubectl` |
| `helm` | 3.14 | `brew install helm` |
| `terraform` | 1.7.x (pin exact version in `.terraform-version`) | `tfenv install 1.7.5` |
| `terragrunt` | 0.55 | `brew install terragrunt` |
| `argocd` CLI | 2.10 | `brew install argocd` |
| `kind` **or** `k3d` | kind 0.22 / k3d 5.6 | For local Kubernetes — team to pick one in Sprint 0 Day 1 |

### Verification
```bash
make check-tools    # fails loudly if any required tool is missing or version is below minimum
```

---

## 3. Language runtimes

### Python (10 of 11 services)

- **Version**: 3.11 exactly (pin in `.python-version`, enforced by `pyenv`).
- **Package manager**: **`uv`** (faster than Poetry, pip-compatible). Install: `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- **Virtualenv**: one `.venv/` per service directory (managed by `uv`).
- **Formatter / linter**: `ruff` (format + lint, replaces black + isort + flake8). Config in repo-root `pyproject.toml`.
- **Type checker**: `mypy` in strict mode on service packages (not on tests).
- **Test runner**: `pytest` + `pytest-asyncio` + `pytest-cov`.
- **Framework**: FastAPI 0.110+ with `asyncpg`, `redis-py`, `nats-py`, `structlog`.

### Go (Quiz Service)

- **Version**: 1.22 exactly (pin in `go.mod`).
- **Tooling**: `golangci-lint` 1.56, `gofumpt`, `buf` (for protobuf / gRPC).
- **Test runner**: standard `go test` + `testify` for assertions.
- **gRPC**: `google.golang.org/grpc` + `protoc-gen-go-grpc`.

### Node.js (Web FE + build tooling)

- **Version**: 20 LTS (pin in `.nvmrc`).
- **Package manager**: **`pnpm`** 9.x (faster, content-addressable).
- **Framework**: Next.js 14 (App Router) + TypeScript 5.x.
- **Formatter / linter**: `prettier` + `eslint` with `@next/eslint-config-next`.

### Mobile

| Platform | Toolchain |
|---|---|
| iOS | Xcode 15.3+, Swift 5.9, iOS deployment target 15.0, SwiftPM for deps |
| Android | Android Studio Hedgehog+, Kotlin 1.9, Gradle 8.5, Android SDK 34, `minSdk=24` |

Mobile dev is macOS-only for iOS; Android works on any OS.

---

## 4. Local infrastructure (Docker Compose)

The file `infrastructure/docker-compose.yml` brings up all external dependencies. Services themselves run on the host (faster iteration, native debugger support).

All host-bound ports are the canonical port + 30000 (e.g. `5432 → 35432`, `8001 → 38001`). In-container ports stay standard; only the host-side mapping is shifted. This keeps host ports out of the most-trodden 1024–9999 range so collisions with system Postgres / native Redis / dev servers are rare.

| Service | Image | Host port | In-container port | Purpose |
|---|---|---|---|---|
| PostgreSQL 15 | `postgres:15-alpine` | **35432** | 5432 | Simulates Aurora. One DB per service (auth, user_profile, …). User `postgres` / `postgres` locally. |
| Redis 7 | `redis:7-alpine` | **36379** | 6379 | Cache + session store. No auth locally. |
| OpenSearch 2.15 | `opensearchproject/opensearch:2.15.0` | **39200** | 9200 | Search + catalog index. Security plugin disabled locally. |
| NATS JetStream | `nats:2.10-alpine` with `-js -m 8222` | **34222** (client), **38222** (monitor) | 4222, 8222 | Event bus. Single node locally. |
| LocalStack | `localstack/localstack:3.8` | **34566** | 4566 | Simulates S3 + Secrets Manager + SQS + SNS. |
| Mailpit | `axllent/mailpit:v1.21` | **31025** (SMTP), **38025** (UI) | 1025, 8025 | Captures outbound email; used instead of SendGrid locally. |

### Bring-up

```bash
make dev            # brings up the local Compose stack (Postgres/Redis/OpenSearch/NATS/LocalStack/Mailpit)
make migrate svc=auth   # apply Alembic migrations for the named service
make dev-seed       # runs scripts/seed_staging.py --env=local --profile=minimal (Sprint 1, GAP-09)
```

Services themselves run on the host (faster iteration, native debugger support) — start each with `cd services/<name> && uv run uvicorn <pkg>.main:app --reload --port $<SVC>_PORT`.

### Port allocation (host-bound; shifted by +30000 from canonical)
- **38001** Auth · **38002** Profile · **38003** Content · **38004** Catalog · **38005** Search
- **38006** Analytics · **38007** Payment · **38008** Institution · **38009** Notification
- **38010** Adaptive Engine (also gRPC on **50051** — already > 30000, unchanged)
- **38011** Quiz (Go)
- **3001** Web (Vite dev server) — unchanged; not host-Compose, not subject to the shift

---

## 5. Local Kubernetes (optional — for drill practice)

For engineers who want to practice GAP-29 drills (ArgoCD rollback, cache flush) locally:

```bash
make dev-kind       # creates a kind cluster and installs ArgoCD + local app definitions
make dev-kind-seed  # deploys all 11 services as ArgoCD applications
```

This is **not** the default dev path — it's heavier and slower. Use raw `make dev` for day-to-day coding.

---

## 6. Environment variables and secrets

### Local (not secret)
- Repo-root `.env.example` is committed. Each service has `services/<name>/.env.example`.
- On first checkout: `make dev-env` copies `.env.example` → `.env` everywhere.
- Local values use safe dummies: `JWT_PRIVATE_KEY` is a pre-generated dev RSA key checked into `infrastructure/dev-keys/` (clearly marked **NOT FOR PRODUCTION**).

### Staging / production
- All real secrets in **AWS Secrets Manager** (per Security Design). No real credentials are checked into git — enforced by `gitleaks` pre-commit hook and GitHub secret scanning.
- Engineers do NOT have direct Secrets Manager access. Reads go through `aws-vault` + a break-glass IAM role that logs to CloudTrail.
- Rotation: 90-day cadence (per Security Design). Automated via AWS Secrets Manager rotation Lambda.

### AWS SSO setup
- Team uses AWS IAM Identity Center (SSO).
- `aws configure sso --profile adaptivelearn-dev` on first setup.
- Session 12h. Day-to-day:
  ```bash
  aws sso login --profile adaptivelearn-dev
  export AWS_PROFILE=adaptivelearn-dev
  ```

---

## 7. IDE recommendations

| IDE | Use for | Essential extensions |
|---|---|---|
| **VS Code** | General-purpose, Python, TS, Go | Python, Pylance, Ruff, Go, ESLint, Prettier, YAML, HashiCorp Terraform, GitLens, Docker |
| **GoLand** | Deep Go work (Quiz Service) | Bundled Go tooling, Database navigator |
| **PyCharm Professional** | Deep Python work | Bundled Python tooling, Database navigator |
| **Xcode** | iOS only | — |
| **Android Studio** | Android only | — |

### Repo-root `.vscode/settings.json` is committed — includes:
- Ruff as default Python formatter.
- `editor.formatOnSave=true`.
- Go language server options.
- File exclusions (`.venv/`, `node_modules/`, `.next/`).

---

## 8. First-time setup — step by step

```bash
# 1. Clone
git clone git@github.com:adaptivelearn/platform.git
cd platform

# 2. Install pyenv + uv + nvm + go (macOS example)
brew install pyenv nvm go@1.22 tfenv terragrunt kubectl helm argocd awscli jq gitleaks
pyenv install 3.11.8
curl -LsSf https://astral.sh/uv/install.sh | sh
nvm install 20 && nvm use 20
npm i -g pnpm@9

# 3. Pin project tool versions
pyenv local 3.11.8
tfenv install 1.7.5 && tfenv use 1.7.5

# 4. Install git hooks
make install-hooks     # installs pre-commit + gitleaks + commitlint

# 5. Bootstrap env files + dev keys
make dev-env

# 6. Install service dependencies
make install           # runs `uv sync` per Python service, `go mod download` for Go, `pnpm install` for web

# 7. Bring up local infra + seed data
make dev-infra
make dev-seed

# 8. Bring up all services
make dev

# 9. Smoke test
curl http://localhost:38001/health   # Auth
open http://localhost:3001          # Web
```

Target time to a running environment on a fresh laptop: **≤ 30 minutes** (first time), **≤ 2 minutes** (daily `make dev`).

---

## 9. Daily development commands

| Command | Purpose |
|---|---|
| `make dev` | Start all services |
| `make dev-infra` / `make stop-infra` | Compose up / down |
| `make test` | Run all tests (unit + integration) |
| `make test-unit` | Unit tests only (fast) |
| `make lint` | Ruff + golangci-lint + eslint |
| `make format` | Apply formatters (ruff format, gofumpt, prettier) |
| `make typecheck` | mypy + `tsc --noEmit` |
| `make migrate-up` / `make migrate-down` | Flyway migrations against local Postgres |
| `make openapi` | Regenerate OpenAPI specs from FastAPI annotations |
| `make contract-test` | Run contract tests against `openapi/phase1.yaml` ([OI-01](../06_gaps_resolution/Appendix_OpenItems_GapRegister_v1.2.md)) |
| `make seed-local` | Re-seed local DB + OpenSearch |
| `make logs <service>` | Tail compose logs for a service |

---

## 10. Sprint 0 readiness — what each engineer must have working before Day 1 of Sprint 1

- [ ] All tools in §2 installed; `make check-tools` passes
- [ ] Python 3.11, Go 1.22, Node 20 pinned and verified
- [ ] AWS SSO configured; can `aws s3 ls` against a staging bucket
- [ ] Can clone repo, run `make dev`, hit `http://localhost:38001/health` and see 200 OK
- [ ] Can run `make test` and all tests pass
- [ ] Can run `make lint` clean
- [ ] ArgoCD staging URL bookmarked on phone and laptop (GAP-17 Phase 1 precondition)
- [ ] PagerDuty account + mobile app set up
- [ ] GitHub SSH key authorised for the organization
- [ ] Signed the team working agreements ([docs/02_planning/06](06_TeamWorkingAgreements_EngineeringNorms_AdaptiveLearningPlatform.docx))

---

## 11. Common issues and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| OpenSearch container OOM-killed | Default JVM heap too small | Set `-e OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g` (already in compose file — check Docker Desktop has 8 GB+ allocated) |
| `asyncpg.InvalidPasswordError` locally | `.env` overrides missing | Run `make dev-env`; do not edit `.env.example` |
| Tests pass locally, fail in CI | Timezone or random seed | CI runs in UTC — use `freezegun` in tests, set `PYTHONHASHSEED=0` |
| NATS consumer not receiving messages | JetStream stream not created | Run `scripts/nats_bootstrap.sh` (part of `make dev-seed`) |
| Xcode build fails on pods | CocoaPods version mismatch | `pod repo update && pod install --repo-update` |
| `uv sync` extremely slow | First-time cache fill | Expected; subsequent runs are fast |

---

## 12. Security rules (non-negotiable)

These are enforced by pre-commit hooks and CI. Violations block merge.

1. **No real credentials in git.** `gitleaks` scans every commit.
2. **No `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` environment variables.** Use AWS SSO + `aws-vault`.
3. **No production data in local dev.** Seed scripts produce synthetic data only (per GAP-09).
4. **TLS for every external dependency.** Local Docker services run without TLS but any config pointing at a real hostname must use `https://`.
5. **No `git push --force` to `main`.** Branch protection rules enforce this.
6. **Signed commits.** GPG or Sigstore `cosign` — verified by CI.
7. **Container images scanned.** Trivy blocks any `HIGH` or `CRITICAL` CVE from merging.
