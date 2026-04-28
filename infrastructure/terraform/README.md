# Terraform / Terragrunt — AWS staging and prod

> **Sprint 0 state**: skeleton only. No `terraform init` has been run, no state
> backend provisioned, no resources applied. Every module has a `TODO` marker
> at the resource level — DevOps Lead fills these in during Sprint 0 Week 2
> after AWS accounts + IAM + quota increases are in place.

## Layout

```
infrastructure/terraform/
├── modules/            # Reusable modules (org-owned)
│   ├── vpc/
│   ├── eks/
│   ├── aurora/
│   ├── redis/
│   ├── opensearch/
│   ├── nats/
│   ├── s3-cloudfront/
│   ├── secrets-manager/
│   └── waf/
└── live/               # Environment-specific stacks (Terragrunt)
    ├── terragrunt.hcl          # Root config (remote state, providers)
    ├── common.hcl              # Shared inputs
    ├── staging/
    │   ├── env.hcl
    │   ├── ap-south-1/
    │   │   ├── vpc/terragrunt.hcl
    │   │   ├── eks/terragrunt.hcl
    │   │   ├── aurora/terragrunt.hcl
    │   │   ├── redis/terragrunt.hcl
    │   │   ├── opensearch/terragrunt.hcl
    │   │   ├── nats/terragrunt.hcl
    │   │   ├── s3-cloudfront/terragrunt.hcl
    │   │   └── waf/terragrunt.hcl
    │   └── global/
    │       └── waf/terragrunt.hcl
    └── prod/           # placeholder — copied from staging after Phase 1 launch
```

## Prerequisites (one-time, DevOps Lead)

1. AWS organisation with `ap-south-1` as primary region.
2. Two accounts: `alp-staging` (~500 users) and `alp-prod` (10K→1M).
3. IAM Identity Center (SSO) configured; engineers use `aws-vault` with SSO sessions — **no long-lived access keys**.
4. S3 bucket + DynamoDB table for Terraform state (per env). Created manually or via bootstrap script.
5. Service quotas reviewed against [docs/01_design/06_Infrastructure_DevOps_Design](../../docs/01_design/06_Infrastructure_DevOps_Design_AdaptiveLearningPlatform.docx) — Aurora instance counts, EIPs, NLBs, Lambda concurrency.

## Toolchain pins

| Tool | Version | Why |
|---|---|---|
| Terraform | `~> 1.9` | aligns with `required_version` in `live/terragrunt.hcl` |
| Terragrunt | `~> 0.67` | DRY + dependency DAG across modules |
| tflint | `latest` | CI gate |
| tfsec / trivy-iac | `latest` | security scan in CI |

## Apply guardrails

- **Never** `apply` directly from a developer laptop against staging or prod. All applies go via CI/CD workflow `.github/workflows/terraform.yml` (to be added in Sprint 0 Week 2) that runs `terragrunt run-all plan` on PR, stores the plan, and applies only after PR merge + human approval.
- **Never** commit `*.tfvars` with secrets. Use AWS Secrets Manager via data sources.
- Backend config uses S3 with DynamoDB locks; lock contention is expected and must be handled gracefully (do not `--force-unlock` without DevOps Lead sign-off).

## Gap register linkage

- **GAP-17 v1.2** — ArgoCD `auto-sync OFF` in prod; see [infrastructure/argocd/](../argocd/).
- **GAP-24** — Sprint 1 start gate includes "Terraform plan on staging is green" as one of the 7 binary preconditions.
- **GAP-23** — dependency graph: VPC → EKS → (Aurora, Redis, OpenSearch, NATS, S3) → ArgoCD → application manifests.
