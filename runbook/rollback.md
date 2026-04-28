# Rollback — decision tree and execution

**Purpose**: decide whether to roll back after a post-deploy incident, then execute safely. Covers GAP-12 (decision tree) and GAP-17 (manual `kubectl` fallback when ArgoCD is unavailable).

**Pre-authorised actors**: see [delegation order](../docs/05_launch/03_DelegationOrder.md) §2. Anyone level-1 and above may execute `kubectl rollout undo`; **`alp-payment` / `alp-identity` / `alp-quiz`** full-service disables require level-4+.

**Service inventory** (post-[ADR-0005](../docs/adr/0005-service-consolidation.md), 5 deployables):

| Service | Stack | Hosts |
|---|---|---|
| `alp-identity` | Python | auth, profile, institution (incl. flags) |
| `alp-payment` | Python | Stripe checkout + webhooks (standalone) |
| `alp-learning` | Python | catalog, content, doubts, search, adaptive |
| `alp-quiz` | Go | quiz session FSM + IRT |
| `alp-engagement` | Python | analytics, notification (durable JetStream consumers) |

**Trade-off introduced by consolidation**: rolling back `alp-engagement` rolls back both analytics + notification together. The pre-consolidation per-service rollback granularity is gone. If you only need to disable one module, prefer **feature-flag kill-switch** over rollback (see [feature_flag_kill_switch.md](feature_flag_kill_switch.md)).

**Default bias**: roll back. A reversible mistake is cheaper than a live incident. If you are asking "should I roll back?", the answer is usually yes.

---

## 1. Decision tree

| Signal | Rollback? | Notes |
|---|---|---|
| SLO burn rate > 2× target over 5 min, started within 10 min of deploy | **Yes — rollback immediately** | No further investigation before rollback. Debug in staging. |
| 5xx rate > 0.5% sustained for 5 min, started within 30 min of deploy | **Yes — rollback** | |
| New 5xx class appearing in logs with deploy correlation | **Yes — rollback** | Even if rate is low — may be a canary for worse. |
| Slow query alerts on Aurora correlated with deploy | **Maybe — see §1.1** | Could be rollback, could be a query that needs an index. |
| Error rate unchanged, latency +10–20% p99 | **Investigate first** | Capacity issue ≠ bug. HPA may still absorb it. |
| Error rate unchanged, latency +50% p99 | **Rollback** | Whatever caused this, it's not going to be fun to debug under load. |
| `alp-payment` webhook failures > 5% for 5 min | **Rollback + page HoP** | Billing correctness is non-negotiable. Rollback `alp-payment` only — independent of `alp-identity`. |
| `alp-identity` `/auth/login` failure rate > 3% for 5 min | **Rollback + page Tech Lead** | Auth regressions are user-facing by the minute. Rolling back `alp-identity` also rolls back profile + flags + institution; flag a kill-switch for those modules before rollback if possible. |
| A single user reporting a bug | **No — do not rollback** | File a ticket; prioritise in the next sprint. |
| Partial feature working, full recovery expected via retries | **No — monitor** | But set a 15-min timer; if not recovered, re-evaluate. |

### 1.1 Slow-query branch

If Aurora CPU > 80% or slow-query alerts within 15 min of deploy:

1. Identify the offending query via `pg_stat_statements`.
2. If it is a new query from the deploy and it is read-only → **feature-flag off** the code path (see [feature_flag_kill_switch.md](feature_flag_kill_switch.md)) rather than rolling back. Cheaper and surgical.
3. If it is a new query and it is a write → **rollback**. Flag-off does not help writes in flight.
4. If it is an existing query suddenly slow → investigate table stats, `ANALYZE`, recent index changes. Rollback only if correlated with deploy.

---

## 2. Execute — ArgoCD path (preferred)

Use this path when ArgoCD is healthy. This is ~99% of incidents.

1. Open ArgoCD UI → target application (e.g. `alp-identity`, `alp-quiz`, `alp-learning`, `alp-engagement`, `alp-payment`).
2. Click **History and rollback**.
3. Select the previous **green** revision — usually the one just before the active row.
4. Click **Rollback**. Confirm.
5. Watch the sync status go to `Healthy` + `Synced`. Target: < 3 min for single-service rollback.
6. Validate:
   - Grafana dashboard `services/<service>-overview` returns to pre-incident baseline.
   - 5xx rate < 0.1%.
   - No new pod restarts in the last 2 min.
7. If rollback introduces stale cache behaviour → proceed to [cache_flush.md](cache_flush.md) step 2.5.
8. Announce in `#incident-response`: "Rollback complete for `<service>`. Monitoring for 15 min."
9. Update the incident ticket: time of rollback, revision rolled to, validation outcome.

**Do NOT** re-enable auto-sync. ArgoCD is configured with auto-sync **OFF** (per GAP-17). A rollback is a manual state; the next intended deploy comes from a new PR.

---

## 3. Execute — manual `kubectl` path (fallback)

Use this path only if ArgoCD is **unreachable or unable to sync** (e.g. ArgoCD control-plane outage, cluster DNS issue). GAP-17 requires this path be pre-exercised in Drill 1.

1. Confirm ArgoCD failure — try UI + `argocd app get <service>` from laptop. If both fail → proceed.
2. Authenticate to the cluster: `aws-vault exec alp-prod -- aws eks update-kubeconfig --name alp-prod --region ap-south-1`.
3. Verify context: `kubectl config current-context` should end in `alp-prod`.
4. Find the deployment: `kubectl -n alp get deployment <service>`.
5. Check rollout history: `kubectl -n alp rollout history deployment/<service>`. Note the revision numbers.
6. Rollback to previous revision: `kubectl -n alp rollout undo deployment/<service>`.
   - To target a specific revision: `kubectl -n alp rollout undo deployment/<service> --to-revision=<N>`.
7. Watch the rollout: `kubectl -n alp rollout status deployment/<service>` — expect `successfully rolled out` within 3 min.
8. Validate as in §2 step 6.
9. **Critical follow-up**: this rollback is out-of-band. ArgoCD will try to sync the original (bad) revision back once it recovers. Before it does:
   - Pause auto-sync in ArgoCD for this app (it should already be OFF; verify).
   - File a same-day PR that either (a) reverts the bad commit on `main`, or (b) makes ArgoCD's declared state match the rolled-back revision.
   - Do NOT leave the cluster in a state where ArgoCD's declared state disagrees with running state.

---

## 4. Flap guard — the rollback-deploy-rollback trap

Per GAP-17 v1.2 amendment. If a rollback is followed by another deploy within 10 minutes:

- The engineer doing the re-deploy **must** post a one-line "I understand the last deploy was rolled back 10 min ago and my change addresses <cause>" in `#incident-response` before triggering CI.
- If two rollbacks happen within 30 minutes on the same service → **freeze deploys on that service for 2 hours**. Tech Lead approval required to lift the freeze.

---

## 5. After rollback

- Filing a Post-Incident Review is mandatory for any rollback in production. Use [pir_template.md](pir_template.md).
- Do NOT rush to re-deploy. The urge to "try again with a tweak" is the biggest cause of extended incidents. Get the PIR draft started first.

---

## 6. Drill validation

This procedure is exercised as **Drill 1** at T-14 (per GAP-29). Pass criterion: full §2 flow complete in < 5 minutes from decision to validated. Manual §3 path exercised once per Drill 1 run.
