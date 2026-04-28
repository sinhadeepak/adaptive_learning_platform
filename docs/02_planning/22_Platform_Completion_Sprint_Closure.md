# Sprint 6 — Platform Completion — Closure

**Sprint number**: 6 of the post-MVP arc. Numbered after the original four-sprint Phase-1 plan (Sprints 0–4) plus the emergent **Sprint 5 — AI Deepening** ([19_AI_Sprint_Closure.md](./19_AI_Sprint_Closure.md)).
**Status**: ✅ **CLOSED** — exit criteria met. No carry-overs blocked Sprint 7.
**Window**: 2026-04-27 (multi-day session, capping the AI-deepening + UX-completion arc).
**Trigger**: User asked to close every visible mock-data / stub-button gap on the mobile app and the doubts forum.
**Outcome**: Three new microservice surfaces (doubts + per-day analytics + profile edit flows), Doubts forum + Profile tab no longer have stub buttons or mock data, mobile app is at full feature parity with web.

---

## What this sprint shipped

### 1. Doubts service (12th microservice)

New `services/doubts/` (FastAPI + Postgres + Alembic + JWT). Persistent doubt threads with per-source answers (AI, expert, peer). 5 endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/doubts` | Create new doubt; optional initial AI answer for one-shot persistence |
| `GET` | `/doubts` | List my doubts |
| `GET` | `/doubts/{id}` | Single doubt + chronological answers |
| `POST` | `/doubts/{id}/answers` | Append answer; source auto-promoted to `expert` for TEACHER+ roles |
| `POST` | `/doubts/{id}/answers/{aid}/accept` | Owner accepts → doubt RESOLVED |

Wired into web-student nginx at `/api/v1/doubts/*`. Mobile **DoubtsTab** now fetches real history; **DoubtDetailScreen** renders the full thread with KaTeX + artifact rendering on AI answers; new **reply composer** at the bottom posts peer answers via `POST /doubts/{id}/answers`.

Auto-persistence wired:
- **Photo Doubt screen** — successful AI OCR result silently saved as a thread
- **AI Tutor Chat** — first user turn creates a doubt with the AI reply as the first answer; subsequent turns append answers

Mock data on the Doubts forum — gone.

### 2. Per-day study-time telemetry

New `analytics_schema.daily_activity` table (one row per user per UTC day) with `sessions_count`, `questions_answered`, `study_minutes`. `process_session()` upserts after the dedup gate so live + backfill paths share the same counters. New endpoint `GET /analytics/daily-activity/{user_id}?days=N`.

Mobile **Progress tab**:
- **Weekly Study Time** chart now driven by real telemetry — bars are real hours, days with zero activity show `–` placeholders, today is highlighted with the gradient
- **NEW Activity heatmap** — GitHub-style 13-week × 7-day grid. 4 intensity tiers (faint → 30% → 65% → full cyan). Tooltip per cell shows date + session count. Less / More legend at bottom.

Heuristic chart — gone.

### 3. Generative-UI tutor protocol

[tutor.py](../../services/adaptive-engine/src/adaptive_engine/tutor.py) extended to emit structured artifacts inline:

```
<<ARTIFACT type="concept_card">>{...}<<END>>
<<ARTIFACT type="formula_card">>{...}<<END>>
<<ARTIFACT type="quick_quiz">>{...}<<END>>
```

Web ([TutorMessage.tsx](../../apps/web-student/src/components/TutorMessage.tsx)) and mobile ([tutor_message.dart](../../apps/mobile/lib/widgets/tutor_message.dart)) parsers split the body around marker placeholders and render each artifact as a native typed component (cyan ConceptCard, purple FormulaCard with KaTeX, amber stateful QuickQuizCard with feedback). Artifacts coexist with existing markdown body + LaTeX math + followup chips.

### 4. Profile page edit flows (mobile)

Three new screens replace the "coming soon" toasts:

| Row | Screen | Backend |
|---|---|---|
| Edit Profile | [edit_profile_screen.dart](../../apps/mobile/lib/screens/edit_profile_screen.dart) | `PATCH /profile/me` |
| Change Password | [change_password_screen.dart](../../apps/mobile/lib/screens/change_password_screen.dart) | Triggers existing forgot-password OTP flow |
| Language / Daily Goal | [preferences_screen.dart](../../apps/mobile/lib/screens/preferences_screen.dart) | `PATCH /profile/preferences` |

Edit Profile mirrors the response into the in-memory AuthClient `User` so the greeting + Profile tab stay in sync without needing a refresh.

Profile tab stub buttons — gone.

### 5. Web Mock Test player (parity with mobile)

Web parity for the AI-generated mock test feature. New routes:

| Route | Page | What it does |
|---|---|---|
| `/mock` | [MockTest.tsx](../../apps/web-student/src/pages/MockTest.tsx) | Full-screen player with timer, sectioned navigator, mark-for-review, gradient submit |
| `/mock/result` | [MockResult.tsx](../../apps/web-student/src/pages/MockResult.tsx) | Trophy hero + raw score + percentile + projected AIR + section breakdown |

Practice page's "Coming soon" Phase-2 placeholder replaced with a real "Start Mock →" link.

---

## Final stack

### Services (12 total)

| # | Service | Status |
|---|---|---|
| 1 | auth | ✅ |
| 2 | user-profile | ✅ |
| 3 | content | ✅ +`explanation` column |
| 4 | catalog | ✅ |
| 5 | search | ✅ |
| 6 | analytics | ✅ +`daily_activity` table + endpoint |
| 7 | payment | ✅ (stub) |
| 8 | institution | ✅ (stub) |
| 9 | notification | ✅ |
| 10 | adaptive-engine | ✅ 11 AI endpoints (mock plan/score, study-plan, guided-next-steps, rank-projection, weakness-diagnosis, explain, doubt/photo, tutor/chat SSE, authoring, ai-status, irt) |
| 11 | quiz (Go) | ✅ +`/quiz/questions` +`/quiz/users/{id}/answered-items` +`explanation` column |
| **12** | **doubts** | ✅ NEW — persistent threads + AI/expert/peer answers |

### AI surfaces (11 total)

All eleven render with the same `source: ai|heuristic|stub` field, all degrade gracefully without an OpenAI key, all reachable from web + mobile (except authoring which is web-portal-only by design):

1. Personalised Study Plan
2. Guided Next Steps
3. Predictive AIR / Rank Trajectory
4. Cross-topic Weakness Diagnosis
5. AI Tutor Chat (streaming + KaTeX + **generative-UI artifacts**)
6. Photo-OCR Doubt Resolution (camera + gallery)
7. Question Explanations
8. AI-Assisted Authoring (educator portal)
9. AI-Generated Mock Tests (plan + score)
10. AI Status (debug/health surface)
11. IRT / select-next (under the quiz session machinery)

### Mobile app (Flutter)

Six-tab bottom nav + supporting screens:

```
Home (greeting + readiness ring + streak + 4 AI cards + quick actions + subjects)
├── Compact Predicted AIR card → Rank tab
├── Photo Doubt CTA → PhotoDoubtScreen
├── Guided Next Steps card → topic quiz
├── 7-day Study Plan trigger → bottom sheet
└── Cross-topic Weakness Diagnosis card

Progress (4-stat grid + real weekly chart + 90-day heatmap + subject mastery)
Practice (Adaptive | Topic Quiz | AI Mock Test)
  └── MockTestScreen (timer + sections + nav) → MockResultScreen
Rank (full Predicted AIR + AI commentary + exam picker)
Doubts (forum landing + filter tabs + real history)
  ├── + Ask New Doubt → bottom sheet → PhotoDoubtScreen / TutorChatScreen
  └── DoubtDetailScreen (thread + reply composer)
Profile (avatar + 3 pills + 3 settings groups)
  ├── Edit Profile → EditProfileScreen
  ├── Change Password → ChangePasswordScreen
  └── Language / Daily Goal → PreferencesScreen
```

### Test scoreboard at sprint close

| Surface | Tests | Status |
|---|---|---|
| adaptive-engine | 67 | ✅ |
| quiz Go | 4 packages | ✅ |
| content (env-independent) | 4 | ✅ |
| analytics | env-dependent migration applied | ✅ |
| doubts | end-to-end smoke | ✅ |
| web-student | TS clean | ✅ |
| web-portal | TS clean | ✅ |
| mobile (Flutter) | analyze clean | ✅ |
| Live AI smoke (`scripts/smoke-ai.sh`) | 11/11 | ✅ AI mode active |

---

## What remains (deferred to a future sprint)

- **WhatsApp daily-question bot** — biggest growth-coefficient remaining wedge per the competitor analysis. Blocked on WA Business API access.
- **Voice-first tutor** — Whisper STT + GPT-4o realtime + Hindi/Hinglish TTS. Cool differentiator, not table-stakes.
- **Mobile AI authoring** — currently web-portal only. Educators don't typically author from phones, so deprioritized.
- **Real expert-side answer queue** — backend supports the `expert` source, but there's no surface yet for moderators to triage a queue of unanswered doubts. Mobile peer reply already works.
- **Content scaling** — biggest underlying gap, but mostly an authoring volume problem now that AI authoring exists.
- **Cohort percentile** — current rank projection maps from a calibration table; once cohort > 1k, percentile becomes empirical from live distribution.
- **Per-attempt timeline on Progress** — Activity heatmap shows session counts per day; the per-quiz trajectory line chart is still unimplemented.

---

## Build artifacts

- Mobile APK: `http://10.11.5.166:35173/app-debug.apk` (deployed via web-student nginx)
- Web stack: `http://10.11.5.166:35173` (student) · `:35174` (educator) · `:35175` (admin)
- Backend smoke: `bash scripts/smoke-ai.sh http://10.11.5.166`
- LAN testing runbook: [docs/local-testing.md](../local-testing.md)

---

## Strategic position

**The platform is now feature-complete on the AI/UX axis.** Every preamble promise from the BRD is delivered:

- "AI-powered" → 11 distinct AI integrations, not one
- Adaptive Intelligence → IRT engine + cross-topic mastery + cross-topic pattern detection
- Readiness Score → wired to projected AIR with confidence band
- Guided Next Steps → 3 ranked actions on Home, real
- Personalised Study Plan → 7-day schedule with topic priorities
- Per-question Explanations → wired into QuizResult
- Doubt Resolution → photo OCR + AI tutor + real persistent forum

Plus three category-defining wedges that competitors don't have:
- Predictive AIR with confidence band, updated every quiz
- Cross-topic weakness diagnosis (defensible because it requires both rich item-level history AND a strong reasoner)
- Generative-UI tutor with native artifact cards (Claude-Desktop-grade for STEM)

The remaining product gap is **content depth, distribution, and real-world ops** — not AI capability and not UI surface.

Sprint closed.
