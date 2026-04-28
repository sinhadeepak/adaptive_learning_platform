# Aurora Failover Drill (D-1)

**When to run**: drill before staging cutover (Sprint 8 Day 8); after any Aurora version bump; quarterly verification.
**Owner**: DevOps Lead.
**Closes**: GAP-22 (Aurora failover test) — outstanding since Phase 1.
**SLO target**: failover < 60s; Quiz session resumes after Quiz reconnects; no row loss.

---

## Why this drill exists

Aurora promises auto-failover when the primary fails. We need to know:
1. **How long** the apps are unable to write — RTO measurement.
2. **Whether the apps actually reconnect** without a pod restart (asyncpg + sqlalchemy hold pool connections that go stale on failover).
3. **Whether quiz session state survives** — a session in `IN_PROGRESS` mid-failover must be resumable.
4. **Whether NATS JetStream's durable consumers re-process queued events correctly** when analytics/notification reconnect to the new primary.

Phase 1 ran on local Postgres so this was untestable. Phase 1c launch is gated on this drill.

---

## Pre-drill checklist

- [ ] Drill notice in `#engineering` 24h ahead. Drill window 09:00 IST, expected 30 min.
- [ ] Latest staging snapshot backup confirmed (`aws rds describe-db-cluster-snapshots`).
- [ ] PagerDuty silence window scheduled covering the drill (avoid spurious pages).
- [ ] Roll-back plan: re-promote the other replica if both AZs go bad.
- [ ] Synthetic load running: 5 concurrent quiz sessions submitting at 10 req/s.

## During drill — runbook

```bash
# 0. Capture baseline
aws rds describe-db-cluster --db-cluster-identifier alp-staging \
  --query 'DBCluster.[Status,DBClusterMembers]' --output table

# 1. Trigger failover (chooses the lowest-priority replica)
T0=$(date +%s)
aws rds failover-db-cluster --db-cluster-identifier alp-staging
echo "Failover started at $T0"

# 2. Watch cluster status — wait for "available"
while true; do
  status=$(aws rds describe-db-cluster --db-cluster-identifier alp-staging \
    --query 'DBCluster.Status' --output text)
  T=$(date +%s)
  echo "[$((T-T0))s] $status"
  [ "$status" = "available" ] && break
  sleep 2
done

# 3. App reconnect verification — hit each service's /health
for svc in auth user-profile catalog quiz adaptive-engine analytics \
           notification content doubts; do
  curl -sS -o /dev/null -w "$svc → %{http_code}\n" \
    "https://$svc.staging.adaptivelearn.in/health"
done

# 4. Quiz session resume verification
# A session was IN_PROGRESS at T0. It should still be answerable.
curl -sS "https://quiz.staging.adaptivelearn.in/quiz/sessions/$DRILL_SESSION_ID/next" \
  -H "authorization: Bearer $DRILL_TOKEN" | jq .

# 5. Synthetic load error rate during the failover window
# Should show a brief spike during failover (< 60s) then return to baseline
grep -c '"5xx"' /var/log/synthetic-load-$(date +%Y%m%d).jsonl
```

## Pass criteria

- Step 2 completes in **< 60s** (RTO).
- All 9 services in step 3 return 200 within **30s** of the cluster going `available` (no manual restart needed).
- Step 4 resumes the session: returns the next item, not a 5xx or session-expired.
- Step 5 5xx count during the window < 0.5% of total requests.

If any criterion fails: **abort the cutover**. The default Aurora pool config in our services needs tuning (likely `pool_pre_ping=True` + `pool_recycle=300`) before we can run on Aurora in production.

## Post-drill

1. Record findings in `pir_template.md` even if everything passed.
2. Update `docs/02_planning/24_P1_Wrap_Staging_Cutover_Sprint_Plan.md` D-1 row with the actual numbers.
3. If RTO > 60s: open issue + propose Aurora multi-master before Phase 2 (or accept higher RTO with Head of Product sign-off).

## Related

- [rollback.md](rollback.md) — what to do if a deploy lands during a known-bad failover
- [nats_dlq.md](nats_dlq.md) — JetStream consumer recovery if Aurora drops a connection mid-message
- [contacts.md](contacts.md) — PagerDuty escalation if the drill goes sideways
