# Sprint 14 — Consolidation closure + Phase 2 wrap-up

**Sprint window:** 2026-04-28 (single working session, follows ADR-0005 consolidation)
**Theme:** Lock in the operational artifacts the 12→5 service consolidation surfaced. The code part is done; what's missing is the *paperwork*: a smoke-test target you can run before every release, runbooks that reflect the new service names, integration tests that aren't deselected, and the Phase 2 retrospective that gates Phase 3.

## Why this sprint

After 13 product sprints (S1–S13) and the consolidation work (Sprints A–E + smoke fixes), four operational gaps remain:

1. **No reproducible smoke test**. The end-to-end golden path (login → topics → quiz → mastery → notification) only ran via ad-hoc curl during the consolidation deploy. There is no `make` target you can run before a release to confirm the stack still works.
2. **Runbooks reference dead service names**. `runbook/rollback.md` and `runbook/nats_dlq.md` still talk about `auth`, `analytics`, `notification` etc. as separate deployables. An on-call engineer following them today would `kubectl rollout restart deployment/notification` and find no such deployment.
3. **Integration tests deselected**. During Sprint B/C/D verification I deselected ~14 integration tests that need a live stack (`test_backfill.py`, `test_dispatcher.py`, `test_quiz_session_subscriber.py`, etc.). They were green in the pre-consolidation world; we should re-run them against the consolidated stack and either pass or document why they don't.
4. **Phase 2 retrospective missing**. The master phase index lists this as `❌ not yet written; gates P3-S0`. Without it, Phase 3 planning has no concrete inputs.

## Backlog

### S14-A — `make smoke` reproducible golden-path test

A bash script + Make target that exercises the full flow end-to-end against the running compose stack, with clear PASS/FAIL output.

- **A-1** `scripts/smoke_test.sh` (new). Steps:
  1. Login as `student@alp.dev` via identity (`POST /auth/login`)
  2. Fetch `/catalog/exams` from learning, assert ≥4 exams
  3. Fetch topics for JEE Main physics, assert ≥3 topics (Mechanics + Thermodynamics + Electrostatics)
  4. Start a quiz session on Mechanics (`POST /quiz/sessions/start`)
  5. Fetch first item, assert it is real content (no `option A for Q\d+` strings)
  6. Submit one correct + one incorrect answer
  7. Submit the session (`POST /quiz/sessions/{id}/submit`)
  8. Sleep 2s, assert `analytics_schema.mastery` row exists for the student
  9. Assert `notification_schema.notifications` row exists for the same session
  10. Hit `/analytics/readiness/{userId}` via engagement, assert `nTopics >= 1`
- **A-2** `make smoke` target — runs `scripts/smoke_test.sh`, fails the make process if any assertion fails.
- **A-3** Reference from `docs/CLAUDE.md` "Critical data flows" so future engineers know how to verify.

### S14-B — Runbook updates for consolidated stack

- **B-1** `runbook/rollback.md` — reference the 5 consolidated services (`alp-identity`, `alp-payment`, `alp-learning`, `alp-quiz`, `alp-engagement`). Update the per-service rollback playbooks. Note that some old per-service rollbacks (e.g. "rollback notification independent of analytics") are no longer possible — that's a deliberate trade-off codified in ADR-0005.
- **B-2** `runbook/nats_dlq.md` — durable consumer names are unchanged (`analytics-quiz-completed`, `notification-quiz-completed`, `content-assignment-progress`, etc.) but they now live inside `alp-engagement` and `alp-learning` pods, not standalone services. Update the `nats consumer info` invocations and pod selectors.
- **B-3** Add `runbook/smoke_test.md` documenting the `make smoke` golden path, what it covers, what gaps it doesn't catch (e.g. no Stripe webhook test, no SSE leaderboard, no Hindi search), and how to extend it.

### S14-C — Integration test resurrection

Bring at least one bundle's integration tests back to green against the live consolidated stack. Engagement is the lowest-risk: it has 14 deselected tests and a clear "needs Postgres + NATS" boundary.

- **C-1** Run `pytest services/engagement/tests/` against the running compose stack (no deselects). Catalog the failures.
- **C-2** Fix what's structurally broken (likely: hardcoded URLs to `analytics:8000` / `notification:8000`, hardcoded DB names like `analytics`/`notification`).
- **C-3** Tests that genuinely need infra — annotate with `@pytest.mark.integration` instead of deselect-by-filename. Default `pytest` skips integration; `pytest -m integration` runs them. CI can opt in.
- **C-4** Document the result in the closure doc (X/14 tests pass against the live stack).

### S14-D — Phase 2 retrospective doc

Per master phase index, this gates P3-S0. Cover S5–S13 + the consolidation work (which wasn't a planned sprint but ate ~5 sprints of capacity).

- **D-1** `docs/02_planning/22_Phase2_Retrospective.md`. Sections:
  - **What shipped** — feature inventory across S5–S13 (post-MVP, payment, institution, educator workflow, real-time leaderboard, drill-downs)
  - **What slipped** — tutoring (P3), B2B writes (P3), predictive analytics (P3), staging deploy (still AWS-blocked)
  - **What surprised us** — the consolidation: not planned at sprint start; absorbed ~5 sprints of capacity but eliminated 7 deployables and >50% of the chatty HTTP edges
  - **Numbers** — total tests added per sprint, services merged, lines of code moved, hours of smoke-debugging
  - **Inputs to P3-S0** — concrete list of decisions needed (KYC vendor, Stripe Connect rollout, marketplace pricing model)
  - **Outputs to P3-S0** — service ceiling = 6, alp-marketplace as the new slot, predictive analytics as an `engagement.analytics` extension

### S14-E — Sprint 14 closure doc + master index update

- **E-1** `docs/02_planning/37_Sprint14_Closure.md` — what shipped in S14
- **E-2** Update `docs/02_planning/00_MasterPhaseIndex.md`:
  - Sprint 13 row stays
  - Add Sprint 14 row
  - Phase 2 retrospective status flips from `❌` to `✅` with the new doc link
  - Update the "Pending today" tally

## Out of scope

- **Tutor service skeleton (alp-marketplace)** — that's P3-S0. Sprint 14 only writes the retrospective that gates P3-S0; it does not start P3.
- **Resurrecting the larger `learning` integration tests** — content+catalog cross-test wiring is more involved. S14 takes engagement only.
- **Force-push reconciliation between local and origin development** — already done manually by the user.
- **AWS staging deploy** — still blocked on access; not a Sprint 14 problem.

## Definition of done

- `make smoke` passes from a clean `make dev-reset && make dev` cycle.
- Runbooks `runbook/rollback.md` and `runbook/nats_dlq.md` reference only the 5 consolidated services.
- Engagement integration test suite runs without `--deselect`. Tests that need infra are marked `@pytest.mark.integration`; CI behaviour opt-in.
- `22_Phase2_Retrospective.md` exists and is linked from the master index.
- `37_Sprint14_Closure.md` exists with PR-style "what shipped" notes.
