# Cache flush

**Purpose**: remove stale Redis cache entries so services re-read fresh state after a rollback or data correction. Step 2.5 of the rollback procedure per GAP-28.

**When to run**: after a rollback, when the rolled-back version's cached responses are visible to users as stale state. Also when a data-correction patch requires existing cached reads to expire.

**Authorisation**: Level 2+ per [delegation order](../docs/05_launch/03_DelegationOrder.md) §2.

**Prerequisite**: cache key versioning is in place per GAP-28 (all cache keys carry a version prefix like `profile:v1:{user_id}`). Without versioning, flushing is both heavier and riskier — abort and escalate to Tech Lead.

---

## 1. Decide: flush by key pattern or bump the version?

Cache versioning (GAP-28) exists specifically so you almost never need `FLUSHDB`. Prefer versioning.

| Situation | Action |
|---|---|
| Single service's cached responses are stale after its rollback | **Bump that service's cache version** (§2). Cheapest option, zero blast radius outside the service. |
| A cross-service data correction (e.g. tenant attribute flipped) means many services have stale reads | **Bump the affected entity's version** across services (§3) — do not `FLUSHDB`. |
| Redis memory is corrupt or unreachable and a forced flush is needed | `FLUSHDB` on the specific Redis logical DB (§4). Last resort. |
| Any thought of `FLUSHALL` | **Stop. Escalate to Tech Lead.** Never acceptable in prod. |

---

## 2. Bump a service's cache version

Each service owns its cache-key prefix and version. Version is held in the service's config (ConfigMap or env var).

1. Identify current version: `kubectl -n alp get configmap <service>-config -o yaml | grep CACHE_VERSION`.
2. Bump: patch the ConfigMap to increment the major version (e.g. `v1` → `v2`). Via ArgoCD: edit the Helm values file + PR + sync. Via manual path: `kubectl -n alp patch configmap <service>-config --type merge -p '{"data":{"CACHE_VERSION":"v2"}}'`.
3. Roll the pods so they pick up the new version: `kubectl -n alp rollout restart deployment/<service>`.
4. Wait for rollout: `kubectl -n alp rollout status deployment/<service>`. Target < 2 min.
5. Validate: cached reads now key off `<prefix>:v2:<id>` — old `v1` entries become inert (they still consume memory until TTL expires; that's fine).
6. If Redis memory pressure is a concern (cache size > 70% of maxmemory), optionally sweep old-version keys asynchronously — do NOT block the incident on this.

---

## 3. Bump an entity's cross-service version

Less common. Use only when a single entity (e.g. a tenant, a user, a flag) has gone stale across multiple services' caches.

1. Identify all services that cache the entity. Typical: UserProfile caches user attributes, Catalog caches tenant entitlements, Auth caches JWT claims.
2. For each service: bump the entity-type version in its config and restart (§2 steps 1–4).
3. Validate cross-service: spot-check via a fresh request that hits each service — each should log a cache miss + re-read + cache write at the new version.

---

## 4. Last-resort `FLUSHDB`

Only when §2 and §3 are not viable. Example: Redis cluster has had a dataset corruption event, or a rogue key was written with no TTL and no versioning.

1. Confirm the scope — which Redis logical DB is affected. Typical mapping: DB 0 = session, DB 1 = cache, DB 2 = rate limits, DB 3 = locks.
2. **Never flush DB 0 without level-4+ approval** — logging users out en masse is user-facing.
3. Connect: `kubectl -n alp exec -it deploy/redis-cli -- redis-cli -h redis-master.alp.svc`.
4. Select DB: `SELECT <N>`.
5. Confirm current size: `DBSIZE`. Snapshot the number.
6. Flush: `FLUSHDB`.
7. Expect a thundering-herd on the affected services as every cache read becomes a miss. Watch Aurora CPU + p99 for 5 min.
8. If Aurora CPU > 80% for > 60s → engage warm-standby mitigation (read replica split, rate-limit by tenant). If memory/CPU exhaustion imminent → escalate to level-4 for Aurora failover.
9. Log the flush to the incident ticket: DB number, size before, operator name, reason.

---

## 5. Drill validation

This procedure is exercised as **Drill 4** at T-7 (per GAP-29). Pass criterion: a §2 version bump completes in < 3 min, Aurora CPU stays below 80% during the warm-up window, zero 5xx during the bump.

---

## 6. What this is NOT for

- Cache invalidation in the normal course of work — that's what TTLs are for.
- Evicting a specific user's bad state — use a targeted delete (`DEL <key>`), not a flush.
- Clearing feature-flag local caches — that happens via [feature_flag_kill_switch.md](feature_flag_kill_switch.md) via NATS, not via Redis operations.
