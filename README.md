# Adaptive Learning Platform

Cloud-native microservices SaaS for Indian exam prep (NEET, JEE, UPSC, CBSE).

**Phase**: Sprint 0 (Foundation) — no feature code yet. See [docs/02_planning/07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md](docs/02_planning/07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md).

## Quick start

```bash
make check-tools   # verify host has Python 3.11, Go 1.22, Node 20, Docker, uv, pnpm
make dev           # start local stack (Postgres, Redis, OpenSearch, NATS, LocalStack, Mailpit)
make test          # run all service tests
make lint          # ruff + go vet + eslint
```

Engineer readiness checklist: [docs/02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md](docs/02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md#L232).

## Layout

```
services/          11 backend services (1 Go, 10 Python/FastAPI)
apps/              web (React+Vite) + mobile (Flutter)
infrastructure/    terraform/, argocd/, k8s/, observability/
scripts/           seed + bootstrap scripts
docs/              specs, ADRs, gap register, sprint plans
```

## Architecture

AWS EKS (ap-south-1) · Aurora PostgreSQL 15 · Redis 7 · OpenSearch 2.x · NATS JetStream · CloudFront+S3.
REST (OpenAPI 3.1) + gRPC (Adaptive Engine) + NATS events. IaC: Terraform + Terragrunt. GitOps: ArgoCD (auto-sync OFF in prod per [GAP-17 v1.2](docs/06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx)).

## Contributing

- Branch naming: `<type>/<story-id>-<slug>` (e.g. `feat/STU-REQ-01-register`).
- PR template enforces DoD + backward-compat checkbox.
- ADR required for cross-service changes — see [docs/adr/](docs/adr/).
