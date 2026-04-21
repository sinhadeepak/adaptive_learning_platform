# infrastructure/

Top-level infrastructure-as-code. Four independent domains:

| Folder | Purpose | Applied by |
|---|---|---|
| [docker/](docker/) | Local Docker Compose stack (Postgres, Redis, OpenSearch, NATS, LocalStack, Mailpit) | engineer laptop, via `make dev` |
| [terraform/](terraform/) | AWS resources: VPC, EKS, Aurora, Redis, OpenSearch, S3+CloudFront, Secrets Manager, WAF | DevOps Lead via Terragrunt + CI |
| [argocd/](argocd/) | GitOps on EKS: platform addons (cert-manager, external-dns, LB controller, Karpenter, NATS, observability) + application ApplicationSet | ArgoCD itself, after bootstrap |
| [observability/](observability/) | Helm values for kube-prometheus-stack, Loki, Tempo, Promtail (consumed by the ArgoCD observability ApplicationSet) | ArgoCD |
| [k8s/](k8s/) | (Future) Helm charts for each service — added in Sprint 1 | ArgoCD |

## End-to-end deploy order (staging, greenfield)

1. **AWS account + SSO** — out-of-band (IAM Identity Center, Control Tower).
2. **Terraform state bootstrap** — S3 bucket `alp-tf-state-staging` + DynamoDB lock table, created manually or by a 1-file bootstrap TF run.
3. **Terragrunt apply** — from [terraform/live/staging/ap-south-1/](terraform/live/staging/ap-south-1/):
   ```
   terragrunt run-all plan
   terragrunt run-all apply   # only after plan review
   ```
   The dependency graph: `vpc → eks → (aurora, redis, opensearch, s3-cloudfront, secrets-manager, waf-regional)`.
4. **CloudFront + global WAF** — from [terraform/live/staging/global/us-east-1/waf-cloudfront/](terraform/live/staging/global/us-east-1/waf-cloudfront/). Must be `us-east-1`.
5. **Install ArgoCD** — apply [argocd/bootstrap/argocd-install.yaml](argocd/bootstrap/argocd-install.yaml) then [argocd/bootstrap/root-app.yaml](argocd/bootstrap/root-app.yaml).
6. **Wait for platform addons** — cert-manager, external-dns, ALB controller, Karpenter, NATS, observability stack sync automatically on staging.
7. **Services sync** — Sprint 1 PRs add Helm charts under `infrastructure/k8s/charts/<svc>/`; the services ApplicationSet picks them up.

## Blast-radius guardrails

- **State is protected**: ArgoCD never has write access to AWS (no cluster role assumes an AWS role beyond IRSA-scoped ones). Terraform is the only thing that touches AWS APIs.
- **Prod ArgoCD auto-sync is OFF** (GAP-17 v1.2). Every prod deploy = manual click by DevOps Lead.
- **Terraform apply gated by CI**: direct `terragrunt apply` from a laptop against prod is forbidden. Staging is allowed for DevOps Lead during Sprint 0 only.
- **Destructive actions**: `terragrunt destroy` requires two reviewers on the PR that deletes the module.

## Known TODOs before first real apply

- [ ] Fill `account_id` in `live/staging/env.hcl` (and `live/staging/global/us-east-1/env.hcl`).
- [ ] Create state bucket + lock table (bootstrap TF).
- [ ] Wire `access_entries` for EKS cluster in `modules/eks/main.tf` once SSO roles exist.
- [ ] Populate IRSA role ARNs in ArgoCD Application manifests (`external-dns`, `aws-load-balancer-controller`, `karpenter`).
- [ ] Add pgaudit parameter group to `modules/aurora/main.tf` (GAP-04).
- [ ] Service Helm charts under `k8s/charts/` (Sprint 1).
- [ ] ExternalSecrets operator + AWS provider config (used by Grafana admin password, Alertmanager routing keys).
