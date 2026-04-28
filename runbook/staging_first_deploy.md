# First Staging Deploy — Sprint 8 Cutover

**When to run**: once, on Sprint 8 Day 1+ once AWS account access lands.
**Owner**: DevOps Lead.
**Predecessor**: [Sprint 8 plan](../docs/02_planning/24_P1_Wrap_Staging_Cutover_Sprint_Plan.md) gate items G-1 through G-11.
**Reviewer**: Tech Lead — sign-off required before any traffic gets cut over.

This is the first time the platform meets real AWS. Treat every step as if production is watching.

---

## 0. Prerequisites — verify before any infra change

```bash
# 0.1 AWS account access confirmed
aws sts get-caller-identity
aws iam get-user --query 'User.UserName'

# 0.2 KMS key for Secrets Manager exists
aws kms list-aliases --query 'Aliases[?contains(AliasName,`alp`)]' --output table

# 0.3 Local repo at expected commit
git rev-parse --abbrev-ref HEAD  # expect: feat/educator-assignments or successor
git log --oneline -1

# 0.4 Local stack health (the source we're cutting from)
docker compose -f infrastructure/docker/docker-compose.yml ps --format json \
  | jq -r '.[] | "\(.Service) \(.Health)"' | column -t
# Expect every row: <service>  healthy
```

If any 0.x step fails: **stop**. Do not proceed without resolving.

## 1. Apply Terraform — staging plan

```bash
cd infrastructure/terraform/staging
terraform init
terraform plan -out=tfplan-$(date +%Y%m%d-%H%M)
# Review the plan — no surprises, no destroys.
terraform apply tfplan-$(date +%Y%m%d-%H%M)
```

Wait for: EKS cluster, ALB, Aurora, ElastiCache, OpenSearch, S3 buckets, CloudFront distribution, KMS keys, Route53 records.

```bash
# Sanity:
aws eks describe-cluster --name alp-staging --query 'cluster.status' --output text
# Expect: ACTIVE

aws rds describe-db-cluster --db-cluster-identifier alp-staging \
  --query 'DBCluster.Status' --output text
# Expect: available

aws elasticache describe-cache-clusters \
  --query 'CacheClusters[?contains(CacheClusterId,`alp`)].CacheClusterStatus' \
  --output text
# Expect: available
```

## 2. Migrate per-service schemas

```bash
# Connect kubectl to staging cluster
aws eks update-kubeconfig --name alp-staging --region ap-south-1

# Run each service's migration job. Order matters — auth first because
# user_id FKs cascade outward.
for svc in auth user-profile catalog content doubts notification analytics; do
  kubectl create job migrate-${svc}-$(date +%s) \
    --from=cronjob/migrate-${svc} -n alp-services
done

# Quiz uses a different migration runner (Go binary)
kubectl create job migrate-quiz-$(date +%s) \
  --from=cronjob/migrate-quiz -n alp-services

# Watch — every job should complete with status Succeeded
kubectl get jobs -n alp-services -w
```

Verify migration heads match expectation:
- user-profile → 009 (achievements is the latest)
- notification → 003 (read_at)
- analytics → 003 (daily_activity)
- content → 004 (explanation column)
- catalog → 008
- doubts → 001
- quiz Go → 005 (explanation columns)

## 3. Helm install — services come up

```bash
cd infrastructure/k8s
# install in dependency-aware order: shared infra → core services → dependent
helm upgrade --install alp-shared charts/alp-shared -n alp-shared --create-namespace
helm upgrade --install alp-services charts/alp-services -n alp-services \
  --set image.tag=$(git rev-parse HEAD) \
  --values values.staging.yaml
```

Wait for every Deployment to roll out:

```bash
kubectl rollout status deploy -n alp-services --timeout=10m
# All 12 services + ingress should report "successfully rolled out".
```

## 4. Secrets — wire real credentials

These are the bits that have been gating Phase 1 launch. Each one closes one or more gate items.

```bash
# G-9 — RS256 signing key for JWT (replaces HS256 shared secret)
KEY_ID=$(aws kms create-key --description "ALP JWT signing 2026" \
  --key-spec RSA_2048 --key-usage SIGN_VERIFY \
  --query 'KeyMetadata.KeyId' --output text)
aws kms create-alias --alias-name alias/alp-jwt-2026 --target-key-id $KEY_ID
aws secretsmanager create-secret --name alp/staging/auth/jwt-key-id \
  --secret-string "$KEY_ID"

# G-10 — Google OAuth client (must come from Google Cloud Console first)
aws secretsmanager create-secret --name alp/staging/auth/google-oauth \
  --secret-string '{"client_id":"...","client_secret":"..."}'

# G-10 — Apple Sign In (needs Apple Developer team key)
aws secretsmanager create-secret --name alp/staging/auth/apple-oauth \
  --secret-string '{"team_id":"...","key_id":"...","private_key":"..."}'

# G-7 — SendGrid (replaces Mailpit)
aws secretsmanager create-secret --name alp/staging/notification/sendgrid \
  --secret-string '{"api_key":"SG.xxx","from":"noreply@adaptivelearn.in"}'

# G-11 — FCM server key for mobile push
aws secretsmanager create-secret --name alp/staging/notification/fcm \
  --secret-string '{"server_key":"...","sender_id":"..."}'

# OpenAI for AI verticals (optional — heuristic fallback works without it)
aws secretsmanager create-secret --name alp/staging/adaptive-engine/openai \
  --secret-string '{"api_key":"sk-..."}'

# Restart pods to pick up new secrets
kubectl rollout restart deploy -n alp-services
```

## 5. Smoke — same student-facing endpoints we verified locally

```bash
# Login the seeded test student (assumes seed migration ran)
TOK=$(curl -sS -X POST "https://api.staging.adaptivelearn.in/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"student@alp.dev","password":"Password123!"}' \
  | jq -r '.tokens.accessToken')

# Run the same 12-endpoint check from Sprint 7 close
for path in profile/me profile/bookmarks profile/mock-attempts \
            profile/achievements notifications/inbox/00000000-0000-0000-0000-000000000001 \
            quiz/sessions doubts \
            analytics/daily-activity/00000000-0000-0000-0000-000000000001 \
            analytics/streak/00000000-0000-0000-0000-000000000001 \
            analytics/readiness/00000000-0000-0000-0000-000000000001 \
            analytics/mastery/00000000-0000-0000-0000-000000000001 \
            catalog/exams; do
  status=$(curl -sS -o /dev/null -w "%{http_code}" \
    "https://api.staging.adaptivelearn.in/api/v1/$path" \
    -H "authorization: Bearer $TOK")
  echo "  /$path → $status"
done
# Expect 12/12 → 200.
```

## 6. Drills

Once smoke is green, run the drill suite per [Sprint 8 plan §4.2](../docs/02_planning/24_P1_Wrap_Staging_Cutover_Sprint_Plan.md#42-drill-items-must-run--pass--defines-sprint-exit):

- **D-1** Aurora failover — see [aurora_failover.md](aurora_failover.md)
- **D-2** EKS node loss — `kubectl drain <node>` then watch reschedule
- **D-3** NATS MaxDeliver drop — see [nats_dlq.md](nats_dlq.md) §5.2
- **D-4** Rollback drill — see [rollback.md](rollback.md)

Each drill must pass before sign-off.

## 7. Sign-off

When 0–6 are green:

1. DevOps Lead: gate items G-1 through G-11 ticked
2. Tech Lead: drill log signed
3. QA: regression suite green against staging
4. CTO: production-readiness review

Move Sprint 8 to Closed. Phase 2 Sprint 0 (Foundation, renamed) starts next.

## When this goes wrong

| Symptom | Likely cause | First action |
|---|---|---|
| Pod CrashLoopBackOff with auth secret errors | Secret not yet wired (§4) | Check `kubectl get secret -n alp-services` |
| 503 on every endpoint | Aurora not reachable | Verify security group rules; check `kubectl exec ... -- nc -zv aurora-host 5432` |
| 5xx spike on `/quiz/sessions/start` | Adaptive Engine circuit breaker tripped (GAP-01) | Tail Adaptive Engine logs; wait 30s for breaker to reset |
| Empty inbox for known-active user | Notification consumer lag | `make notification-backfill` |
| Empty heatmap for known-active user | Analytics consumer lag | `make analytics-backfill` |
| ALB 504 on `/api/v1/quiz/...` | Service mesh URL not registered | Restart nginx; check upstream resolution per nginx PR #32 fix |

If unsure → [contacts.md](contacts.md) → page DevOps on-call.

## Related

- [Sprint 8 plan](../docs/02_planning/24_P1_Wrap_Staging_Cutover_Sprint_Plan.md) — gate items + drills
- [aurora_failover.md](aurora_failover.md) — D-1 detail
- [rollback.md](rollback.md) — what to do if §3 deploy goes south
- [nats_dlq.md](nats_dlq.md) — JetStream recovery
- [Phase 1 Retrospective §6](../docs/02_planning/20_Phase1_Retrospective.md#6-carry-overs-to-phase-2-sprint-0) — full carry-over list
