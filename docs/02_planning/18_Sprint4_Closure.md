# Sprint 4 Closure & Review Pack

**Sprint window**: Weeks 9–10 of Phase 1 (10-week plan).
**Status at close**: ✅ headline exit criteria met. Three carry-overs (Auth SSO still credential-blocked, mobile platform plugin wiring, staging deploy) move to Sprint 5.
**Author**: Tech Lead.
**Inputs**: [Sprint 3 Closure §4 carry-overs](17_Sprint3_Closure.md#4-carry-overs-to-sprint-4) · [Sprint Plan §S4](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md) · [DoD/DoR](03_DoD_DoR_AdaptiveLearningPlatform.docx).

---

## 1. Acceptance — sprint exit criteria

The Sprint 4 plan committed five exit criteria. All five hold.

| # | Criterion | Verification | Status |
|---|---|---|---|
| 1 | Per-item IRT calibration end-to-end | PR #25 — `discrimination_a` + `guessing_c` columns on Quiz + Content; full triple flows author → bridge → Quiz → Adaptive. Smoke: `a=1.6, c=0.22, b=-0.1` round-trips byte-for-byte. | ✅ |
| 2 | Mobile reset-password deep-link parser | PR #26 — `lib/auth/deep_link.dart` accepts the three supported URL shapes; cold-start routing to `ResetPasswordScreen` with the extracted token. 12 parser + 3 widget tests. Platform plugin wiring intentionally deferred (needs device-side validation). | ✅ |
| 3 | W3C trace-context propagation across all services | PR #27 — `alp_telemetry` (Py) + `alptelemetry` (Go) shared libs; middleware wired into 10 Python services + Quiz Go; outbound Quiz→Adaptive carries the trace-id. Live smoke: inbound `traceparent` echoed; missing → fresh generated. | ✅ |
| 4 | Hindi content seeded through the real authoring pipeline | PR #28 — 15 hand-authored Devanagari MCQs (5 each MECH/THERMO/CALC) ran through `POST /content/questions → /submit → /review (approve)` and landed in Quiz bank in <1 s via the bridge. `make seed-hindi` target. | ✅ |
| 5 | Analytics recovery from JetStream dead-letters | PR #29 — `analytics/backfill.py` replays `quiz_schema.quiz_sessions` SUBMITTED rows missing from `processed_sessions`. Idempotent (re-run `applied=0 skipped=N`). `make analytics-backfill` + a 36h default. PR #30 — DLQ runbook closes GAP-06 operationally. | ✅ |

---

## 2. What shipped — by tier

### 2.1 Backend services (3 PRs)

| PR | Branch | Service(s) | Surface added |
|---|---|---|---|
| #25 | `feat/sprint-4-irt-calibration` | Quiz + Content + Adaptive | Migrations: Quiz #003, Content #002. New IRT triple `(a, b, c)` flows through every layer that previously hard-coded `a=1.0, c=0.0`. |
| #27 | `feat/sprint-4-otel-trace-id` | All 10 Python services + Quiz Go | New shared libs `alp_telemetry` (Py) + `alptelemetry` (Go). Middleware + structlog/slog injection + outbound header forwarding. |
| #29 | `feat/sprint-4-analytics-backfill` | Analytics | New `analytics/processing.py` (shared math) + `analytics/backfill.py` + `make analytics-backfill`. New `quiz_database_url` env var. |

### 2.2 Front-end + mobile (2 PRs)

| PR | Branch | App | Surface added |
|---|---|---|---|
| #25 | `feat/sprint-4-irt-calibration` | web-portal | NewQuestion form gains "Advanced — IRT calibration" `<details>` panel with discrimination + guessing inputs. |
| #26 | `feat/sprint-4-mobile-deeplink` | mobile | `lib/auth/deep_link.dart` parser + `_GuestScreen.resetPassword` route in `main.dart`. |

### 2.3 Content + ops (2 PRs)

| PR | Branch | Surface |
|---|---|---|
| #28 | `feat/sprint-4-hindi-content-seed` | 15 Hindi MCQs in `services/content/seed/`, `seed_hindi.py` driver, `make seed-hindi`. |
| #30 | `docs/sprint-4-nats-dlq-runbook` | `runbook/nats_dlq.md` (9-section ops doc), runbook README index updated. |

### 2.4 Shared libs introduced this sprint

| Lib | Surface |
|---|---|
| **`libs/python/alp_telemetry`** | `TraceContextMiddleware`, `inject_trace_id` structlog processor, `traced_request_kwargs` outbound helper, `parse_traceparent` / `generate_trace_id` / `current_trace_id` |
| **`libs/go/alptelemetry`** | `Middleware()` http handler wrap, `NewSlogHandler` decorator, `SetOutboundHeader`, `ParseTraceparent` / `GenerateTraceID` |

### 2.5 Service surface end-of-sprint

| Service | Sprint 4 additions | Tests |
|---|---|---|
| Auth | `TraceContextMiddleware` wired | 18 |
| Profile | `TraceContextMiddleware` | 14 |
| Catalog | `TraceContextMiddleware` | 10 |
| Search | `TraceContextMiddleware` | 15 |
| Institution | `TraceContextMiddleware` | 9 |
| Analytics | `TraceContextMiddleware`; backfill module + 4 new tests | **17** (+4) |
| Payment | `TraceContextMiddleware` | 5 |
| Notification | `TraceContextMiddleware` | 16 |
| Adaptive Engine | `TraceContextMiddleware` | 26 |
| Content | `TraceContextMiddleware`; IRT a/c columns + 3 new tests | **16** (+3) |
| Quiz (Go) | `alptelemetry.Middleware` + `NewSlogHandler` + outbound; IRT a/c columns + 2 new bridge tests | 22 + 5 events (+2) |

**Backend total: ~168 tests** (Sprint 3 ~161 → Sprint 4 ~168, +7 net).

### 2.6 Cross-cutting plumbing

- **Cross-language trace-context** — every request scope carries a `trace_id`. A single Loki/CloudWatch query stitches a request across Python ↔ Go hops. Real OTEL spans + Jaeger/Tempo export deferred to Sprint 5.
- **3PL IRT** — Adaptive Engine now sees real `a/c` per item instead of constant `1.0/0.0`. Closed-beta cohort still small, but the calibration shape is in place for when content authors start providing real data.
- **Bilingual question bank** — Quiz now serves 15 EN + 15 HI per topic across 3 main topics (MECH, THERMO, CALC).
- **Resilience close-out** — three-layer defence on `quiz.session.completed`:
  1. Live JetStream consumer with explicit ack/nak (PR #11)
  2. Nightly backfill from `quiz_sessions` (PR #29)
  3. Documented manual replay path (PR #30)

---

## 3. Closed gaps + spike work

| Item | Resolution | Artifact |
|---|---|---|
| **SPIKE-01 follow-up** — per-item IRT calibration | a/c columns + Content authoring UI + bridge forwards them | PR #25 |
| **GAP-06** — NATS DLQ runbook | Operational doc + drill plan | PR #30 |
| **Mobile reset-password deep-link** | Pure-Dart parser + cold-start routing | PR #26 |
| **OTEL trace-id propagation** | Cross-language trace-context middleware | PR #27 |
| **Hindi seed gap** | 15 MCQs through the live authoring API | PR #28 |
| **JetStream silent-drift recovery** | Nightly backfill + idempotency proof | PR #29 |

---

## 4. Carry-overs to Sprint 5

| Item | Reason | Sprint 5 placement |
|---|---|---|
| **Auth SSO Google/Apple** | Still credential-blocked. The OAuth code paths exist; real-vendor wiring lands the moment legal/CTO returns clientID/secret. | Sprint 5 Day 1 — BE Lead Python A once creds in place. |
| **Mobile `app_links` platform plugin** | The Dart parser + cold-start routing are in (PR #26). The plugin wiring (iOS associated domains + Android intent filters) needs real-device validation. One-line call site:<br/>`initialDeepLink: await AppLinks().getInitialAppLinkString()` | Sprint 5 Day 2 — Mobile Lead with device access. |
| **Real OTEL SDK with span-ids + Jaeger/Tempo export** | Today's contract is trace-id-only. Real spans layer cleanly on top. | Sprint 5 Day 3 — DevOps + BE Lead Python A. |
| **Notification nightly backfill** | Mirror of Analytics backfill (PR #29). Listed in `runbook/nats_dlq.md` §5.2 as the manual path; needs the same shape as Analytics. | Sprint 5 Day 2 — BE Lead Python B. |
| **Streak tracking in Analytics** | Sprint 2/3/4 nice-to-have; defers cleanly. | Sprint 5 Day 4 — BE Lead Python A. |
| **`topics_v1` → `topics_v2` alias swap automation** | Manual today; staging cutover needs the script. | Sprint 5 Day 4 — DevOps. |
| **Compose-up smoke for content service** | Docker BuildKit was flaky; CI image build covers most of the gap. Add a Make target that exercises the Content→Quiz bridge against a fully-composed stack. | Sprint 5 Day 1 — DevOps. |
| **Staging deploy** — first time | AWS access still being unblocked. Helm + ArgoCD already wired (Sprint 0), so this is a "turn the key" sprint. | Sprint 5 — entire sprint, DevOps + Tech Lead. |

---

## 5. Risks accepted at sprint review

| Risk | Status | Notes |
|---|---|---|
| Auth SSO still credential-blocked | **Realized** (carries from Sprint 1+2+3) | Decision tree unchanged: hit it the moment creds land. |
| Mobile deep-link plugin not yet wired | Accepted | Dart-side parser is ready; integration is mechanical. |
| Real OTEL spans absent | Accepted | Trace-id propagation alone covers ~80% of the cross-service correlation use cases. |
| AWS staging still unavailable | **Realized** | All Sprint 4 work continues to run against local Docker Compose. Sprint 5 owns the cutover. |

---

## 6. Test scoreboard at close

```
Backend (Python + Go)
─────────────────────
Auth                18 ✓     Profile             14 ✓
Catalog             10 ✓     Institution          9 ✓
Search              15 ✓     Quiz                22 ✓ + 5 events
Adaptive Engine     26 ✓     Notification        16 ✓
Payment              5 ✓     Analytics           17 ✓ (+4 backfill)
Content             16 ✓ (+3 IRT)
                                          ──────
                              Backend:  ~168 ✓

Shared libs
───────────
alp_telemetry (Py)  16 ✓
alptelemetry (Go)    8 ✓
alp_flags (Py)       (carry, unchanged)
alpflags (Go)        (carry, unchanged)

Front-end + mobile
──────────────────
web-student         (vitest)  – auth + quiz + readiness flows
web-portal           1 ✓      – login + IRT advanced panel render
web-admin            1 ✓      – login render + workspace build
mobile (Flutter)    39 ✓      – auth + onboarding + quiz + forgot/reset + deep-link
```

---

## 7. Demo script — Sprint 4 review

1. **Author with real IRT calibration** (web-portal, TEACHER login)
   - `/login` → `/questions/new` → fill stem + 4 choices → expand "Advanced — IRT calibration" → set `a=1.4, c=0.22` → Save DRAFT → Submit for review.
2. **Approve it** (web-portal, MODERATOR login)
   - `/review` → approve with rationale "Demo with real a/c".
3. **Observe end-to-end propagation** (Postgres + logs)
   - `psql quiz -c "SELECT discrimination_a, guessing_c, difficulty_b FROM quiz_schema.questions WHERE stem LIKE 'Demo%';"` shows `1.4 | 0.22 | …`.
   - Logs from auth + content + quiz all carry the same `trace_id` — one Loki query stitches the whole flow.
4. **Take a Hindi quiz** (web-student, STUDENT login with `language=hi`)
   - `/home` → start practice quiz on MECH → first question renders in Devanagari (one of the 15 from the seed) → answer, submit.
5. **Force a backfill recovery** (terminal)
   - Disable the Analytics consumer for ~2 minutes (`docker compose stop analytics`), submit a quiz from web-student during the outage.
   - Re-enable, run `make analytics-backfill`. Expect the missed session in the `applied` count + visible mastery update.
6. **Mobile reset-password deep-link** (manual)
   - With the app installed: open `alp://reset?token=demo-token` in a browser → app launches into ResetPasswordScreen with the token bound. (Plugin wiring deferred; demonstrate via test-driven `initialDeepLink:` arg.)

All 6 steps run against the local Docker Compose stack.

---

## 8. Sprint 5 readiness

The closed-beta loop now has full backend resilience (live + backfill + manual replay), real per-item adaptivity, and a bilingual question bank. Sprint 5 priorities:

1. **Staging deploy** — finally turn the AWS key.
2. **Auth SSO** — credentials permitting.
3. **Mobile platform-plugin wiring** for deep-link.
4. **Real OTEL** — promote trace-id-only to full span tracing.
5. **Notification backfill** — close the last open backfill shape.
