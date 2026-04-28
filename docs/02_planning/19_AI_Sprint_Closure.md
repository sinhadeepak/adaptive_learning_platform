# AI Deepening Sprint — Closure

**Window**: 2026-04-26 → 2026-04-27 (single multi-day push session).
**Trigger**: User critique that the platform "looked too shallow and was not meeting its preamble" — the BRD promised AI-powered competitive-exam prep, but the pre-sprint state was IRT + EWA only, with zero LLM integration anywhere across 7,933 LoC of services.
**Outcome**: 9 AI verticals shipped end-to-end across web + mobile, every one heuristic-degrading so the stack runs without an OpenAI key and upgrades to real AI when the key is set.

---

## Verticals shipped

Numbered in build order — each vertical = backend + endpoint + UI + tests + live smoke.

| # | Vertical | Backend | Web | Mobile |
|---|---|---|---|---|
| 1 | Personalised Study Plan | `/adaptive/study-plan/{user}` | Home (via Guided Next Steps) | Home → bottom-sheet |
| 2 | Guided Next Steps | `/adaptive/guided-next-steps/{user}` | Home | Home |
| 3 | Question Explanations | `/adaptive/explain` (POST) | QuizResult per-item | (existing flow inherits) |
| 4 | AI Tutor Chat (streaming) | `/adaptive/tutor/chat` (SSE) | TopicDetail · Experts page · Markdown + KaTeX + followup chips | Doubts tab · Markdown + KaTeX + followup chips |
| 5 | Photo-OCR Doubt Resolution | `/adaptive/doubt/photo` (POST) | Home CTA · PhotoDoubtScreen | Doubts tab · `image_picker` (camera + gallery) |
| 6 | Predictive AIR / Rank Trajectory | `/adaptive/rank-projection/{user}` | Home top + Rank page | Home compact + Rank tab full |
| 7 | Cross-topic Weakness Diagnosis | `/adaptive/weakness-diagnosis/{user}` | Home | Home |
| 8 | AI-Assisted Authoring (educators) | `/adaptive/authoring/generate-questions` (POST) | web-portal · NewQuestion page | (web-portal only — educator surface) |
| 9 | AI-Generated Mock Tests | `/adaptive/mock/plan` + `/adaptive/mock/score` | Practice page → MockTest + MockResult routes | Practice tab → MockTestScreen + MockResultScreen |

**Eight of nine** are reachable on both web and mobile. The ninth (authoring) is intentionally web-only — educators don't author from phones.

---

## Backend layer (`services/adaptive-engine/`)

| Module | Lines | What it does |
|---|---|---|
| [llm.py](../../services/adaptive-engine/src/adaptive_engine/llm.py) | ~190 | Async OpenAI client: `call_structured` (strict JSON via response_format), `call_vision_structured` (image input), `stream_chat` (SSE). Graceful degrade when key absent. |
| [study_plan.py](../../services/adaptive-engine/src/adaptive_engine/study_plan.py) | ~370 | Mastery vector → ranked priorities + 7-day schedule. Heuristic + AI paths. |
| [explain.py](../../services/adaptive-engine/src/adaptive_engine/explain.py) | ~110 | Per-question teaching note generator. |
| [tutor.py](../../services/adaptive-engine/src/adaptive_engine/tutor.py) | ~200 | Multi-turn streaming chat with topic + mastery context. Emits `<<FOLLOWUPS>>` block parsed as generative-UI chips. Uses `$$LaTeX$$` for math. |
| [doubt.py](../../services/adaptive-engine/src/adaptive_engine/doubt.py) | ~150 | Vision OCR → solution → topic match → 3 similar problems from Quiz bank. |
| [rank.py](../../services/adaptive-engine/src/adaptive_engine/rank.py) | ~290 | Readiness → percentile → rank with confidence band. Per-exam calibration table. |
| [weakness.py](../../services/adaptive-engine/src/adaptive_engine/weakness.py) | ~210 | Recent items + EWA → cross-topic patterns via LLM. Hard evidence gate. |
| [authoring.py](../../services/adaptive-engine/src/adaptive_engine/authoring.py) | ~200 | Strict-JSON MCQ generator. Items land as DRAFT in existing FSM. |
| [mock.py](../../services/adaptive-engine/src/adaptive_engine/mock.py) | ~310 | Per-exam blueprint + mastery-calibrated paper composer. Server-side cache so correct answers never reach client. |

**Test scoreboard**: 67 adaptive-engine tests, all green. 6 mock tests, 4 weakness, 5 tutor, 3 explain, 6 authoring + the existing IRT + study-plan + rank suites. Plus all 4 quiz Go packages still green.

**Endpoints added** (11 new):
- `GET /adaptive/ai-status`
- `GET /adaptive/study-plan/{user}`
- `GET /adaptive/guided-next-steps/{user}`
- `POST /adaptive/explain`
- `POST /adaptive/tutor/chat` (SSE)
- `POST /adaptive/doubt/photo`
- `GET /adaptive/rank-projection/{user}?exam=...`
- `GET /adaptive/weakness-diagnosis/{user}`
- `POST /adaptive/authoring/generate-questions`
- `POST /adaptive/mock/plan`
- `POST /adaptive/mock/score`

**Supporting Quiz Go endpoints** (so adaptive-engine could compose):
- `GET /quiz/questions?topicId=X&limit=N` — for similar-problem retrieval
- `GET /quiz/users/{user}/answered-items?limit=N` — for cross-topic weakness analysis

**Schema additions**:
- `content_schema.questions.explanation` (Alembic 004)
- `quiz_schema.questions.explanation` (migration 005)
- Bridge consumer carries `explanation` through the `content.question.published` event

---

## Frontend — web

| File | Purpose |
|---|---|
| [TutorMessage.tsx](../../apps/web-student/src/components/TutorMessage.tsx) | Markdown body with `remark-math` + `rehype-katex` + GFM. `parseTutorReply` for `<<FOLLOWUPS>>` blocks. |
| [GuidedNextSteps.tsx](../../apps/web-student/src/components/GuidedNextSteps.tsx) | 3-action AI panel. |
| [ExplainCard.tsx](../../apps/web-student/src/components/ExplainCard.tsx) | Per-item teaching note in QuizResult. |
| [AITutorChat.tsx](../../apps/web-student/src/components/AITutorChat.tsx) | Streaming chat with markdown + followup chips. |
| [PhotoDoubt.tsx](../../apps/web-student/src/components/PhotoDoubt.tsx) | Photo doubt CTA + result panel. |
| [RankTrajectoryCard.tsx](../../apps/web-student/src/components/RankTrajectoryCard.tsx) | Predicted AIR + AI commentary. |
| [WeaknessDiagnosis.tsx](../../apps/web-student/src/components/WeaknessDiagnosis.tsx) | Cross-topic patterns. |
| [pages/MockTest.tsx](../../apps/web-student/src/pages/MockTest.tsx) | Full-screen mock player (timer + sections + nav + flag). |
| [pages/MockResult.tsx](../../apps/web-student/src/pages/MockResult.tsx) | Trophy + percentile + projected AIR + section breakdown. |
| [web-portal/AIQuestionGenerator.tsx](../../apps/web-portal/src/components/AIQuestionGenerator.tsx) | Educator AI authoring panel. |

---

## Frontend — mobile (Flutter)

The mobile app went from a single-screen "login → quiz → result" stub to a **6-tab production-shape app**:

| File | Purpose |
|---|---|
| [api/api_client.dart](../../apps/mobile/lib/api/api_client.dart) | Typed wrapper around AuthClient covering analytics + catalog + adaptive (8 surfaces). |
| [widgets/alp_card.dart](../../apps/mobile/lib/widgets/alp_card.dart) | Shared dark-theme card / pill / heading. |
| [widgets/tutor_message.dart](../../apps/mobile/lib/widgets/tutor_message.dart) | Markdown + KaTeX (`flutter_math_fork`) + followup chips. |
| [widgets/home_cards.dart](../../apps/mobile/lib/widgets/home_cards.dart) | 4 AI cards composed onto Home: rank, photo doubt CTA, guided next steps, weakness, study plan sheet. |
| [screens/main_scaffold.dart](../../apps/mobile/lib/screens/main_scaffold.dart) | Bottom-tab nav (5 + centre Practice button). |
| [screens/home_tab.dart](../../apps/mobile/lib/screens/home_tab.dart) | Greeting + readiness ring + streak + 4 AI cards + quick actions + subjects. |
| [screens/practice_tab.dart](../../apps/mobile/lib/screens/practice_tab.dart) | Adaptive · Topic Quiz · AI Mock Test. |
| [screens/progress_tab.dart](../../apps/mobile/lib/screens/progress_tab.dart) | Stats grid + weekly chart + subject mastery. |
| [screens/rank_tab.dart](../../apps/mobile/lib/screens/rank_tab.dart) | Predicted AIR full view + exam picker. |
| [screens/doubts_tab.dart](../../apps/mobile/lib/screens/doubts_tab.dart) | Forum landing + Ask sheet → PhotoDoubtScreen + TutorChatScreen. `image_picker` integrated. |
| [screens/profile_tab.dart](../../apps/mobile/lib/screens/profile_tab.dart) | Avatar + identity + 3 pills + ACCOUNT / STUDY PREFERENCES / APP groups. |
| [screens/mock_test_screen.dart](../../apps/mobile/lib/screens/mock_test_screen.dart) | Full-screen mock player with timer + nav + flag. |
| [screens/mock_result_screen.dart](../../apps/mobile/lib/screens/mock_result_screen.dart) | Trophy + percentile + projected AIR + section breakdown. |
| [quiz/quiz_result_screen.dart](../../apps/mobile/lib/quiz/quiz_result_screen.dart) | Redesigned trophy + 4-stat grid + AI insight pills + gradient CTA stack. |

**Dependencies added**: `flutter_markdown`, `flutter_math_fork`, `image_picker`. Android manifest updated with `INTERNET` + `CAMERA` permissions.

---

## Tooling

| Script | Purpose |
|---|---|
| [scripts/smoke-ai.sh](../../scripts/smoke-ai.sh) | 11-surface end-to-end smoke. Pass-line shows `source=ai` vs `heuristic` per surface. |
| [scripts/wsl-lan-forward.ps1](../../scripts/wsl-lan-forward.ps1) | Windows PowerShell admin script — `netsh portproxy` + firewall rules so phone can reach WSL services. |
| [scripts/run-mobile.sh](../../scripts/run-mobile.sh) | Resolves `ALP_API_BASE_URL` (env > .env.local > auto-detected Windows IP > emulator loopback) and `flutter run`s. |

[docs/local-testing.md](../local-testing.md) — full testing runbook (web + mobile, both WSL networking modes, troubleshooting).

---

## What's NOT in this sprint (deliberately deferred)

- **WhatsApp daily-question bot** — needs WA Business API access. Highest growth-coefficient remaining wedge per the [competitor analysis](#) but separate sprint.
- **Doubts service backend** — the mobile Doubts forum landing renders mock items. Real persistent doubt threads + peer answers require a new microservice.
- **Full-length 180-Q NEET paper** — current mock blueprint is 20 Qs (matches what the 480-MCQ bank can supply without repetition). Bumping `totalQuestions` is one-line; content is the gating constraint.
- **Per-day study-time telemetry** — Progress tab's weekly chart is currently a heuristic synthesised from streak. Real per-day session minutes need new analytics.
- **Live mocks with cohort percentile** — current percentile maps from a calibration table, not a live cohort distribution. Once the platform has 1k+ active learners, percentile becomes empirical.

---

## Testing scoreboard at sprint close

| Surface | Tests | Status |
|---|---|---|
| adaptive-engine (Python) | 67 | ✅ all green |
| quiz Go | 4 packages | ✅ |
| content (env-independent) | 4 | ✅ |
| web-student | TS clean | ✅ |
| web-portal | TS clean | ✅ |
| mobile (Flutter) | analyze clean | ✅ |
| Live smoke (`scripts/smoke-ai.sh`) | 11/11 | ✅ AI mode active |
| Live smoke (mobile mock plan) | 20-Q NEET paper | ✅ |

---

## Strategic position now

Pre-sprint: "AI-powered" platform with 0 LLM integrations. Promised differentiators (Adaptive Intelligence, Readiness Score, Guided Next Steps) were either rudimentary (IRT + EWA) or didn't exist (guided steps, study plan, recommendation).

Post-sprint:
- **9 AI surfaces** wired end-to-end, all degrade to honest heuristics when no key
- **Mobile app** grew from 1 functional screen to 6 production tabs with feature parity
- **Mock test infrastructure** — closes the single biggest table-stakes gap PW/Allen own
- **Predictive AIR** — the highest-ARPU retention anchor, calibrated to public NEET/JEE candidate counts
- **Cross-topic weakness diagnosis** — most defensible AI feature in the category, sits on item-level history that competitors don't have
- **LaTeX/KaTeX math rendering** in tutor chat — Claude-Desktop-grade for STEM topics

The remaining gap to a complete product is **content depth, distribution, and ops** — not AI capability.

---

## Build artifacts

- Mobile APK: `http://10.11.5.166:35173/app-debug.apk` (deployed via web-student nginx)
- Web stack: `http://10.11.5.166:35173` (student) / `:35174` (educator) / `:35175` (admin)
- Backend smoke: `bash scripts/smoke-ai.sh http://10.11.5.166`
