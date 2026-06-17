# Sprint 14 Closure — Consolidation closure + Phase 2 wrap-up

**Sprint window:** 2026-04-28 (single working session, post-ADR-0005 deploy)
**Plan:** [docs/02_planning/36_Sprint14_Plan.md](36_Sprint14_Plan.md)

## Scope delivered

### S14-A — `make smoke` reproducible golden-path test — DONE

- New `scripts/smoke_test.sh` (bash + Python helpers): 16 ordered assertions covering health → login → catalog → quiz session → answers → submit → engagement consumers → analytics readiness. End-to-end < 25s.
- New `make smoke` target wires it up.
- Reference added in [`runbook/smoke_test.md`](../../runbook/smoke_test.md).
- **Verified**: ran 16/16 green against the rebuilt consolidated stack.

### S14-B — Runbook updates for consolidated stack — DONE

- [`runbook/rollback.md`](../../runbook/rollback.md): added the 5-service inventory; updated "rollback ArgoCD apps" examples (`alp-identity`, `alp-quiz`, etc.); flagged the trade-off that `alp-engagement` rollback affects analytics + notification together (no per-module rollback granularity).
- [`runbook/nats_dlq.md`](../../runbook/nats_dlq.md): rewrote the consumer table to map durable-name → consumer-pod (e.g. `analytics-quiz-completed` runs in `alp-engagement`, not a standalone analytics pod). Updated backfill commands to `make engagement-backfill`. Fixed cross-DB SQL examples to specify the new database names.
- New [`runbook/smoke_test.md`](../../runbook/smoke_test.md): documents the `make smoke` 16-step contract, what it doesn't cover (Stripe webhook, SSE leaderboard, AI endpoints), and a troubleshooting matrix for common failure modes.
- [`runbook/README.md`](../../runbook/README.md): index updated with the smoke test entry.

### S14-C — Engagement integration test resurrection — DONE

- 6 deselected files (`test_backfill.py` × 2, `test_realtime.py`, `test_leaderboard_stream.py`, `test_dispatcher.py`, `test_quiz_completed.py`) marked with `pytestmark = pytest.mark.integration` instead of `--deselect`.
- `services/engagement/pyproject.toml` registers the marker and sets `addopts = "-m 'not integration'"` so default `pytest` skips them.
- Conftest DB URLs updated: `localhost:35432/notification` → `/engagement` (both notification + analytics conftests). `engagement.notification.config` and `engagement.analytics.config` defaults match.
- **Result**: `pytest tests/` runs **84 passed, 22 deselected** in ~3:30. Integration tests opt-in via `pytest -m integration` once the live stack is up.

### S14-D — Phase 2 retrospective — DONE

- [`docs/02_planning/22_Phase2_Retrospective.md`](22_Phase2_Retrospective.md). Captures what shipped (S5–S13 + 5 consolidation sprints + S14), what slipped (Phase 3 items), what surprised us (positive + negative), the delta numbers, the inputs needed for P3-S0, and the outputs already codified in ADR-0005.
- **Gates Phase 3 P3-S0** per the master phase index commitment.

### S14-E — Closure doc + master index — DONE

- This file (`37_Sprint14_Closure.md`).
- Master phase index updated: Sprint 14 row added, Phase 2 retrospective status flipped from `❌` to `✅`.

## Test totals

| Surface | Pass | Skipped (integration) | Status |
|---|---|---|---|
| alp-engagement (default `pytest`) | 84 | 22 | ✅ |
| alp-engagement (`pytest -m integration`) | 22 (live infra needed) | — | needs `make dev` running |
| `make smoke` (bash) | 16 / 16 assertions | — | ✅ |
| alp-identity | 119 | 0 | ✅ (unchanged) |
| alp-learning | 142+ | — | ✅ (unchanged) |
| alp-payment | 5 | 0 | ✅ (unchanged) |
| alp-quiz (Go) | 27 | 0 | ✅ (unchanged) |

## Carry-overs to next phase

| Item | Why deferred | Owner |
|---|---|---|
| Resurrect `alp-learning` integration tests | Larger blast radius — content + catalog + adaptive each have their own infra deps. Engagement was the simplest case; other bundles get the same treatment as time allows. | Sprint 15 if Phase 3 hasn't started, otherwise P3 hardening |
| Resurrect `alp-identity` integration tests | Same reasoning. Most of identity's tests are unit-level already; the integration deltas are small. | Same as above |
| AWS staging deploy | Still blocked on AWS access (since Phase 1 GAP-22). The smoke-test script is ready for staging env-var override; just need the URLs. | HoP |
| Larger `make smoke` extensions (Stripe webhook + SSE) | Out of S14 scope; the smoke is deliberately the floor. | When the corresponding feature has a regression that the smoke would have caught |

## What surprised us this sprint

- **Conftest DB URLs hadn't been updated during Sprint B/D.** The conftest in `tests/notification/` still hardcoded `postgresql://...localhost/notification` (the old per-service DB name). Sprint 14 caught it because we're now running tests against the consolidated stack rather than deselecting them. Fix is one-line per file, but worth noting that the consolidation work missed these in the original sweep.
- **`addopts` in `pyproject.toml` is sticky.** Once `addopts = "-m 'not integration'"` is set, you need `-m ""` to override, not `-m all` or omitted-by-default. The README's example commands reflect this.

## Phase 2 closure

Phase 2 is **closed** as of Sprint 14 completion. The Phase 2 retrospective ([`22_Phase2_Retrospective.md`](22_Phase2_Retrospective.md)) is published. Phase 3 P3-S0 is unblocked.
