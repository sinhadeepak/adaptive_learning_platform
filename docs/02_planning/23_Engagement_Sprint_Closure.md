# Sprint 7 — Engagement — Closure

**Sprint number**: 7 of the post-MVP arc. Follows directly on **Sprint 6 — Platform Completion** ([22_Platform_Completion_Sprint_Closure.md](./22_Platform_Completion_Sprint_Closure.md)).
**Status**: ✅ **CLOSED** — exit criteria met. The post-close addendum (below) records the further nine thrusts that landed in the same session before the user moved on to a Sprint 8 backlog.
**Window**: 2026-04-27 (continuation of the Platform Completion arc — see [22_Platform_Completion_Sprint_Closure.md](./22_Platform_Completion_Sprint_Closure.md)).
**Trigger**: User asked to "keep going" past the Platform Completion close, focused on engagement, persistence, and removing the last visible stubs.
**Outcome**: Inbox bell + 7 notification types (`quiz.completed`, `mock.completed`, `streak.milestone`, `streak.broken`, `goal.reached`, `doubt.answered`, `achievement.unlocked`) + per-type mute prefs + persistent doubts + persistent mock attempts + achievements (21-kind catalog) + daily-goal/heatmap dashboards. The platform now has a real engagement loop (study → score → notification → badge → revisit).

---

## What this sprint shipped

### 1. Bookmarks (cross-surface, with snapshot)

Migrations `003_add_bookmarks.py` + `004_bookmark_snapshots.py` add `profile_schema.bookmarks` with snapshot `topic_title` + `stem` columns so the saved-questions screen renders without cross-service fan-out and survives later edits/unpublishes.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/profile/bookmarks` | Save question (idempotent `ON CONFLICT DO UPDATE`) |
| `GET`  | `/profile/bookmarks` | List, newest first |
| `DELETE` | `/profile/bookmarks/{questionId}` | Remove |

UI:
- Web: ☆/★ icon on each Quiz review row; new `/bookmarks` page in sidebar; "Saved questions on this topic" section on TopicDetail
- Mobile: bookmark icon on review rows; new BookmarksScreen accessible from Profile → Saved Questions

### 2. Quiz session history

Go service: `Store.ListSessionsForUser` + `GET /quiz/sessions?userId=&limit=` returns slim {topicId, mode, status, counts, started_at, submitted_at}.

UI:
- Web: new `/history` page with all/submitted/in-progress filter chips; tap → revisit result OR resume IN_PROGRESS
- Mobile: HistoryScreen accessed from Profile → Practice History
- Resume-in-progress card on Home (web + mobile) — surfaces the freshest IN_PROGRESS session for one-tap continue

### 3. Notification inbox (with read state)

Migration `003_add_read_at.py` on notification + partial unread index. New endpoints:
- `GET /notifications/inbox/{userId}` — items + `unreadCount`
- `GET /notifications/inbox/{userId}/unread-count` — short-poll friendly
- `POST /notifications/{id}/read` — mark single
- `POST /notifications/inbox/{userId}/mark-all-read`
- `POST /notifications/inbox` — service-to-service direct persist

UI:
- Web: new `/inbox` page + `InboxBell` baked into AppShell topbar (60s short-poll, badge with count)
- Mobile: new InboxScreen + bell on Home greeting row (60s poll)

### 4. Notification triggers (six types live)

| Type | Producer | When | Deep-link |
|---|---|---|---|
| `quiz.completed` | notification (existing NATS subscriber) | Quiz scored | `/quiz/{id}/result` |
| `mock.completed` | adaptive-engine | Mock scored + persisted | `/mock/result?attemptId=` |
| `streak.milestone` | analytics processing | Streak crosses 3/7/14/30/60/100/365 | (none — celebratory) |
| `goal.reached` | analytics processing | Day's minutes first cross dailyGoalMinutes | (none) |
| `doubt.answered` | doubts service | Answer posted by non-owner | `/doubts/{id}` |
| `achievement.unlocked` | user-profile | First-time badge grant only | `/profile` |

Each type is per-user mute-able (`PATCH /profile/notification-prefs`) — producers consult `notificationPrefs` via `/internal/profile/{userId}` before persisting, so muted types stay out of the bell entirely (not just hidden client-side).

### 5. Achievements / badges

Migration `009_achievements.py` — `profile_schema.achievements` with `UNIQUE(user_id, kind)` so re-emit is naïvely idempotent. `AchievementsRepo.grant` returns `(row, created)` so the route can fire `achievement.unlocked` notifications **only on first grant** (verified end-to-end: second grant of the same kind returns the same row id and unread count holds).

Triggers wired:
- analytics → `streak_<n>` for each milestone crossing
- analytics → `first_session` when `prev_n == 0` for a topic
- analytics → `daily_goal_first` alongside `goal.reached`
- adaptive-engine → `mock_first` after a successful mock score persist

UI: Profile pages on web + mobile gained an "Achievements · N" section above the heatmap, rendered as pill chips with kind-specific icon + tone (🔥 streak / 🎯 first session / ✓ goal hit / 🎓 first mock / 🏆 default).

### 6. Mock test persistence + history

Migrations `007_mock_attempts.py` + `008_mock_id_text.py` (UUID→TEXT after the smoke surfaced `mock_<hex>` ID format mismatch). New table `profile_schema.mock_attempts` with full result + sections JSONB.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/internal/profile/mock-attempts` | service-to-service persist (adaptive-engine after `/mock/score`) |
| `GET`  | `/profile/mock-attempts` | JWT-gated list |

Adaptive-engine `post_mock_score` now: scores → persists attempt → returns `attemptId` → fires `mock.completed` notification → grants `mock_first` achievement. All three side effects wrapped in try/except — none can roll back the inline score response.

UI:
- Web: "Mock tests · N" section on `/history` with score pill, percentile, projected AIR. Tap → `/mock/result?attemptId=` (which I extended to fetch by `attemptId` query param and synthesise `rankLow/rankHigh` from confidence band).
- Mobile: same section in HistoryScreen with `_MockRow`. Tap → `MockResultScreen` populated from the persisted attempt.

### 7. Daily goal card + 30-day activity heatmap

- `_DailyGoalCard` (mobile) / Home goal section (web): real today-minutes from `analytics_schema.daily_activity` (via `GET /analytics/daily-activity?days=1`) instead of session-count heuristic. Tone shifts green when goal crossed, with "✓ Goal reached" copy.
- Web home weekday-bars chart: `weekDayBars(activity, goal)` replaces `weekDayMockBars(streak)` — heights track real session counts from `?days=7`, colors track goal hit (green hit / amber-blue partial / red-dim missed past day / faint future).
- New `ActivityHeatmap` component (web + mobile): 6×5 GitHub-style cell grid for last 30 days, intensity calibrated against the visible window. Wired into Profile page on both surfaces.

### 8. Question feedback (flag bad/unclear)

Migration `005_question_feedback.py` — `profile_schema.question_feedback` with `UNIQUE(user_id, question_id, kind)`. Kind enum `WRONG_ANSWER` / `AMBIGUOUS` / `TYPO` / `OTHER`.

`POST /profile/feedback` JWT-gated, idempotent upsert with note merge.

UI:
- Web QuizResult: ⚑ icon on review rows → centered modal (radio + 500-char note) → POST → flag flips to ✓ green check
- Mobile: same flow as bottom sheet via `_FeedbackSheet`

### 9. Web Doubts persistent surface

Mobile already had a full DoubtsTab + DoubtDetailScreen (from Sprint 22). Web previously had only `/experts` (localStorage chat). Added:
- `/doubts` — list backed by `GET /doubts`, filter chips, slide-down composer
- `/doubts/:doubtId` — question card + chronological answers (AI/Expert/Peer color-coded) + reply textarea + per-answer Accept (owner-only, gated by `useAuth().user.id === data.userId`)
- Sidebar split: 💬 "AI Tutor" → `/experts` (kept the localStorage chat), ❓ "Doubts" → `/doubts`
- Inbox `doubt.answered` deep-link points to `/doubts/{doubtId}`

`/experts` localStorage chat retained for backwards-compat — not migrated this sprint.

### 10. Quiz review → AI Tutor doubt flow

Web QuizResult and mobile QuizResultScreen each gained a third icon (◈ web / ✨ mobile) on review rows. Tap creates a doubt via `POST /doubts` with the question stem + topicId/topicTitle, then navigates to the doubt detail with `?askAi=1` (or `autoAskAi: true` on mobile).

Doubt detail (both surfaces) now:
- Auto-streams from `/adaptive/tutor/chat` on `?askAi=1` + first-load
- Renders a live "AI Tutor · streaming…" card with blinking caret while streaming
- Persists the streamed text as a `source=ai` answer on completion
- Allows multi-turn follow-ups: every Ask AI tap rebuilds messages from the full thread (peer→user, ai/expert→assistant) so the model sees prior context. Button label flips between "Ask AI Tutor for help" / "Ask AI follow-up".

### 11. Avatar upload (real, no longer a stub)

`PUT /profile/me/avatar` accepts a base64 `data:image/...` URL (cap 400KB, validated to start with `data:image/`). `DELETE /profile/me/avatar` actually nulls the column now. Rendered:
- Web: avatar in Profile hero (with upload + remove) AND web sidebar (via tiny `useAvatar()` cache + pub/sub publisher in `lib/avatar.ts`)
- Mobile: avatar in Profile tab hero (gallery picker, downscaled to 256px @ q85) AND bottom-nav Profile slot

Real S3+CDN deferred — the contract takes a data URL today; producer can swap impl without API change.

### 12. Notification preferences UI

Migration `006_notification_prefs.py` — `notification_prefs JSONB` on profiles. `PATCH /profile/notification-prefs` merge-updates per-type mute map.

UI:
- Web Settings: new Notifications section with iOS-style toggles for all 6 types
- Mobile: new NotificationPreferencesScreen accessible from Profile → Notifications

Server-side filtering via `notification`'s `_is_type_muted` consulting `/internal/profile/{userId}.notificationPrefs` before persisting — muted types never reach the inbox.

### 13. TopicDetail saved-questions surface (web)

When viewing a topic, the page now shows up to 5 of the user's saved questions on that topic with optimistic remove buttons + "View all → /bookmarks" link. Pulls `/profile/bookmarks` and filters client-side.

### 14. Analysis page de-stubbed

The four "Coming soon" disabled tabs (Score History / Topics / Sessions / Predictions) replaced with `<Link>` quick-jumps to `/history`, `/catalog`, `/rank`, `/bookmarks`. Removes a visible lie.

### 15. LAN IP flip

User asked mid-sprint to switch from `10.11.5.166` to `192.168.29.85`. APK rebuilt with `--dart-define=ALP_API_BASE_URL=http://192.168.29.85:35173/api/v1`; WSL portproxy script binds `0.0.0.0` so no script change needed; verified login through new IP.

---

## Migrations applied

| Service | Migration | Purpose |
|---|---|---|
| user-profile | 003 | bookmarks table |
| user-profile | 004 | bookmark snapshot columns (topic_title, stem) |
| user-profile | 005 | question_feedback |
| user-profile | 006 | notification_prefs JSONB |
| user-profile | 007 | mock_attempts |
| user-profile | 008 | mock_id UUID → TEXT (mock_<hex> format) |
| user-profile | 009 | achievements |
| notification | 003 | read_at + partial unread index |

---

## New cross-service contracts

| Caller | Callee | Endpoint | Use |
|---|---|---|---|
| analytics | notification | `POST /notifications/inbox` | streak.milestone, goal.reached |
| analytics | user-profile | `GET /internal/profile/{id}` | dailyGoal lookup, mute prefs |
| analytics | user-profile | `POST /internal/profile/achievements` | streak/first/goal badges |
| doubts | notification | `POST /notifications/inbox` | doubt.answered |
| adaptive-engine | user-profile | `POST /internal/profile/mock-attempts` | mock persistence |
| adaptive-engine | user-profile | `POST /internal/profile/achievements` | mock_first badge |
| adaptive-engine | notification | `POST /notifications/inbox` | mock.completed |
| user-profile | notification | `POST /notifications/inbox` | achievement.unlocked (only on first grant) |

Every cross-service call is wrapped in try/except in the producer — a notification or achievement failure can never roll back the primary write (analytics processing, mock score, doubt answer post, etc.).

---

## Final smoke

All student-facing endpoints green at close (192.168.29.85:35173):

```
/profile/me                         → 200
/profile/bookmarks                  → 200
/profile/mock-attempts              → 200
/profile/achievements               → 200
/notifications/inbox/{userId}       → 200
/quiz/sessions?userId=...           → 200
/doubts                             → 200
/analytics/daily-activity?days=7    → 200
```

Latest APK at `http://192.168.29.85:35173/app-debug.apk`.

---

## What was deferred

| Item | Why | Suggested next sprint |
|---|---|---|
| Web Experts → backend doubts | 1101-line refactor; localStorage chat works; coexists with new `/doubts` page | Next sprint |
| Real S3/CDN for avatars | Base64 inline matches photoDataUrl pattern in doubts; works at this scale | When tenant count > pilot |
| Search recents | Small feature, not on critical path | Next sprint |
| Question feedback moderator surface | Backend collects signal; teacher portal triage UI later | Sprint 6 (teacher portal) |
| Cumulative-questions achievements (`questions_100`, etc.) | Needs running counter we don't track yet | Add when daily_activity sum endpoint lands |
| Live (SSE/websocket) inbox push | 60s short-poll is fine at pilot scale | When concurrent users > 1k |

---

## Memory-of-record

Memory files updated for cross-conversation continuity:
- `local_test_users.md` — 4 seeded users + `Password123!` + nested `.tokens.accessToken` JWT shape

Sprint closes clean. The platform now has the engagement loop a real exam-prep product needs: study → score → bell ping → badge → revisit, with persistent state on every device, mute-able preferences, and consistent web/mobile parity throughout.

---

## Post-close additions (same session, after the formal close)

The user kept the session going past the closure ("keep going") and these landed:

1. **Cumulative-progress achievements** — analytics grants `sessions_<10/50/100/500>`, `questions_<50/250/1000/5000>` on each crossing; adaptive-engine grants `mocks_<5/10/25>` via a new `GET /internal/profile/{user}/mock-attempts/count` lookup. UNIQUE constraint keeps replays idempotent. Smoke confirmed `mocks_5` awarded the moment the seeded student hit a 5th persisted attempt.

2. **Inbox `all`/`unread` filter chips** — both surfaces, with empty-state copy that flips between 🔕 "No notifications yet" and 🎉 "All caught up".

3. **Web Search recents** — localStorage-backed (`alp.search.recents`, capped 10), move-to-front dedupe, per-row remove + clear-all. Shown only when input is empty.

4. **Streak-in-danger nudge** — Home banner on both surfaces that fires only when `lastActiveDate` is exactly yesterday and `currentStreak > 0`. Silent when already practiced today, when streak is 0, or when already broken.

5. **"Up next" locked-badge preview** — Profile (web + mobile) now lists 4 unearned badges below the earned set, dimmed with dashed border. Static catalog of 21 kinds ordered easiest-first (`first_session` → `streak_3` → `daily_goal_first` → … → `streak_365`).

6. **`streak.broken` notification** — analytics fires when a returning student's streak resets from `>=2` down to `1` (positive re-engagement framing: "Streak reset — you lost a 7-day run, but you're back. Fresh start today."). Per-type mute toggle on both surfaces; deep-link to `/home`.

7. **Mock result CTA polish** — primary action is "↺ Take another mock" deep-linked to `/mock?exam=<code>` (web) or pop-back-to-Practice (mobile); secondary "History" / tertiary "Home" alternatives.

8. **Mobile Profile pull-to-refresh** — `RefreshIndicator` over the Profile tab ListView; refresh runs `_loadAvatar` + `_loadAchievements` in parallel.

9. **Inbox deep-links for celebratory types** — `streak.milestone`, `goal.reached`, `streak.broken` now route to `/home` on tap instead of being no-op.

**Inbox notification types now**: `quiz.completed`, `mock.completed`, `streak.milestone`, `streak.broken`, `goal.reached`, `doubt.answered`, `achievement.unlocked` — all with copy, deep-link, mute toggle, and clear emit conditions.

Continuing past this point becomes diminishing-returns polish; the engagement story is complete.
