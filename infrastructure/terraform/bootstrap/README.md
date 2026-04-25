# Bootstrap — one-time TF for state backend + GitHub OIDC role

Solves the chicken-and-egg: Terragrunt's S3 backend can't work without a
bucket + lock table that themselves must be Terraform-managed.

## What this creates

1. **S3 bucket** `alp-tf-state-<env>` — Terraform state. Versioning on, SSE-KMS, block public.
2. **DynamoDB table** `alp-tf-locks-<env>` — state lock.
3. **IAM OIDC provider** for GitHub Actions (once per account).
4. **IAM roles** for CI:
   - `alp-tf-plan-<env>` — assumable on PRs, read-only + dry-run writes (limited via session policy).
   - `alp-tf-apply-<env>` — assumable on main-branch pushes, full infra create/update.
   Both restricted to the `sinhadeepak/adaptive_learning_platform` repo via OIDC `sub` claim.

## How to run (first time, per account)

```bash
# 1. Authenticate locally (DevOps Lead only, via aws-vault + SSO).
aws-vault exec alp-staging -- bash

# 2. Run bootstrap with LOCAL state.
cd infrastructure/terraform/bootstrap/staging
terraform init           # no backend config yet
terraform apply          # creates bucket + table + OIDC provider + roles

# 3. Migrate state to the now-created bucket.
#    Copy local terraform.tfstate into s3://alp-tf-state-staging/bootstrap/terraform.tfstate
#    then run:
terraform init -migrate-state \
  -backend-config="bucket=alp-tf-state-staging" \
  -backend-config="key=bootstrap/terraform.tfstate" \
  -backend-config="region=ap-south-1" \
  -backend-config="dynamodb_table=alp-tf-locks-staging" \
  -backend-config="encrypt=true"

# 4. Commit the local state file is deleted; .gitignore already excludes *.tfstate
```

## After bootstrap

- Add the role ARNs (`apply-role` and `plan-role`) as GitHub Actions secrets:
  - `AWS_TF_PLAN_ROLE_STAGING`, `AWS_TF_APPLY_ROLE_STAGING`
  - `AWS_TF_PLAN_ROLE_PROD`,    `AWS_TF_APPLY_ROLE_PROD`
- Create the GitHub Environments `staging`, `staging-apply`, `prod-apply` with the
  appropriate approvers (DevOps Lead + Tech Lead).
- The main Terragrunt stack (`../live/staging/`) can now `terragrunt init` cleanly.

## Safety

- `prevent_destroy = true` on both the S3 bucket and DynamoDB table — Terraform will
  refuse to destroy them. Removal requires editing the module, which requires PR review.
- The CI roles have explicit `NotAction` on IAM + billing + state bucket deletion.
