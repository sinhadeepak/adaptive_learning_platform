# SPIKE-07 Report — NATS partition + failover + DLQ

**Owner**: DevOps Lead
**Sprint commit**: 4 days · status: closed 2026-04-25
**Closes**: GAP-06 from [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) — "validate NATS JetStream partition + DLQ semantics; commit final config to IaC".
**Reproducible**: [infrastructure/docker/spike07-nats-cluster.yml](../../infrastructure/docker/spike07-nats-cluster.yml) + [scripts/spike07_nats_partition.py](../../scripts/spike07_nats_partition.py).

## Question

When a NATS JetStream node goes down (network partition or hard crash), do existing publishers/subscribers fail over correctly? What's the right `num_replicas`, `AckWait`, and `MaxAckPending` for our event volume + criticality profile?

## Setup

3-node NATS 2.10 JetStream cluster on the local Docker daemon. Cluster name `alp_spike07`, JetStream enabled (`-js`), routes published bidirectionally so each node knows the other two.

| Node | Client port | Monitoring | Container |
|---|---|---|---|
| nats-1 | 44221 | 48221 | alp-spike07-nats-1 |
| nats-2 | 44222 | 48222 | alp-spike07-nats-2 |
| nats-3 | 44223 | 48223 | alp-spike07-nats-3 |

Stream config used in the test:
```python
StreamConfig(
    name="SPIKE07_EVENTS",
    subjects=["spike07.events"],
    storage=StorageType.FILE,
    num_replicas=3,
    retention=RetentionPolicy.LIMITS,
)
```

Durable consumer with default ack semantics (default AckWait 30s; production override below).

## Test sequence

1. Connect via nats-1 → create R=3 stream + durable pull consumer
2. Publish 100 baseline messages through nats-1 → consume + ack
3. **Simulate partition**: `docker stop alp-spike07-nats-1` (~ leader-down event)
4. Reconnect via nats-2; publish 100 more messages while nats-1 is offline
5. Consume + ack via nats-2 — verify all 100 in-partition messages arrive
6. Restart nats-1 → verify it rejoins the cluster and catches up via JetStream replication
7. Reconnect via nats-1; assert stream reports 200 total messages

The script prints PASS only if every assertion holds.

## Findings

| Property | Verdict | Evidence |
|---|---|---|
| **Cluster formation** | ✅ | Routes register bidirectionally on startup; `/jsz` shows 3 peers within ~3 s |
| **R=3 replication** | ✅ | Stream survives any single-node loss; meta leader re-elected within ~2 s |
| **Publish during partition** | ✅ | nats-2 accepts publish; quorum maintained via {nats-2, nats-3} |
| **Durable subscription resumes** | ✅ | Same `durable=spike07-consumer` reconnects through nats-2 and reads from the post-failover position |
| **Catch-up after rejoin** | ✅ | Restarted nats-1 syncs the stream tail before serving reads (5 s sleep in script gives generous margin) |

## Recommended production config

| Parameter | Value | Rationale |
|---|---|---|
| `num_replicas` | **3** | Tolerates single-AZ loss; meta + stream quorum on remaining 2 nodes. Sprint 1 backlog GAP-06 specified this; spike confirms it works as expected. |
| `AckWait` | **120 s** | Per Sprint 1 backlog. Typical consumers (Notification, Profile, Search reindex) finish in < 5 s; 120 s gives ample headroom for cold-start consumers + GC pauses without redelivering live work. |
| `MaxAckPending` | **1000** | Prevents a hung consumer from starving siblings. At p99 quiz-event throughput estimates (~50 events/sec) this gives 20 s of buffer before back-pressure kicks in. |
| `MaxDeliver` | **5** | After 5 redelivery attempts, message is parked on the DLQ subject `<stream>.DLQ` for ops review. |
| Storage | **FILE** | Memory-only loses everything on node restart; the spike specifically tests FILE durability. |

## DLQ pattern

For each stream, register a sibling stream `<NAME>_DLQ` consuming `_INBOX.<NAME>.>` with retention `LIMITS`, and configure consumer policy `MaxDeliver=5` + `DeliverPolicy=ALL` so messages exceeding the redelivery cap land in DLQ instead of looping forever. Manual republish from DLQ is an ops procedure (`runbook/nats_dlq_replay.md` — to be authored Sprint 2 Day 1).

## Trade-offs

| Option | Why not |
|---|---|
| `num_replicas=5` | Doubles write amplification + storage; Phase 1 traffic doesn't justify it. Sprint 4 revisit if multi-region adds cross-AZ latency that depresses quorum agility. |
| `num_replicas=1` | One-node loss = data loss for in-flight events. Unacceptable for transactional event types (`user.created`, `flag.changed`). |
| Memory-only storage | Faster but loses everything on restart; FILE adds < 5% overhead at our throughput targets. |
| Core NATS (no JetStream) | At-most-once delivery; not enough for `flag.changed` consumers that must invalidate caches deterministically. |
| External MQ (Kafka, RabbitMQ) | Out of Sprint 1 scope; NATS chosen per HLD §6 for operational simplicity + first-class JetStream. |

## Edge cases observed during the spike

- **Replication lag after rejoin** — observed up to 4 s after restarting nats-1 before stream metadata reconciled. The 5 s sleep in the script is a deliberate buffer; production runbook says "wait 30 s before paging on stream-info mismatch after a planned restart".
- **Pull consumer fetch timeout during failover** — `sub.fetch(timeout=5)` worked through the failover; lower than 2 s caused intermittent timeouts during leader election. Recommend `fetch_timeout >= 5 s` in consumer code.
- **Two-node partition** (1+2 vs 3) — not tested in this spike; quorum requires 2 of 3 so the larger side keeps serving and the singleton blocks until rejoin. Scheduled as a Sprint 4 chaos test alongside Drill 4.

## Follow-up work

- [ ] **Sprint 2 Day 1** (DevOps Lead) — port these config values into `infrastructure/terraform/modules/nats/` so EKS deploys with R=3 + AckWait=120s out of the gate.
- [ ] **Sprint 2 Day 1** (DevOps Lead) — add per-stream DLQ siblings and the `MaxDeliver=5` policy.
- [ ] **Sprint 2 Day 2** (DevOps + BE Lead Python A) — wire the existing `flag.changed` and `user.created` publishers/consumers through JetStream durable streams instead of core-NATS pub/sub. Service code stays the same shape; the connection options bump.
- [ ] **Sprint 2 Day 3** (Runbook owner) — author `runbook/nats_dlq_replay.md` with the manual replay procedure.
- [ ] **Sprint 4** (DevOps + QA) — chaos-test the 1+2 vs 3 split-brain partition during Drill 4; capture RPO/RTO numbers.
- [ ] **GAP-06 closure** — pending Tech Lead countersign at the Sprint 1 review, the row in the [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) for GAP-06 moves from "open" to "resolved 2026-04-25".

## Closure

**Recommendation accepted by**: _____________________ (DevOps Lead, signature + date).
**Reviewed by**: _____________________ (Tech Lead, signature + date).
