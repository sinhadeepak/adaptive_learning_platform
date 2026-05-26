# Phase 3a.1 — Vidya Home content (slide 7)

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3a (foundation shell, shipped). Replaces the minimal Home stub with the slide-7 content.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Replace the Phase 3a `VidyaHomeScreen` stub (which renders only a greeting + "Coming in Phase 3a.1" hint card) with the slide-7 content composition:

1. **Header** — greeting (`Hi, ${firstName}.`) + date eyebrow + (deferred) avatar circle + notification bell.
2. **READINESS card** — big score, delta pill vs prior period, ("12-week sparkline" deferred to 3a.2).
3. **NEXT SESSION card** — placeholder copy until a recommendation endpoint lands ("Take a quick practice session" CTA → routes to Practice tab via `VidyaMainShellScope`).
4. **Stats tile row** — STREAK / TODAY / MOCKS as 3 horizontal compact cards.
5. **TODAY checklist** — deferred to Phase 3a.2 (needs a daily plan endpoint).

This phase intentionally ships **4 of 5** content blocks with the 5th (checklist) and the **sparkline** explicitly deferred — both gated on backend data that doesn't exist yet.

---

## Out of scope for Phase 3a.1 (deferred to 3a.2)

- 12-week readiness sparkline (needs weekly readiness history endpoint)
- TODAY checklist (needs daily plan endpoint)
- Avatar circle + notification bell in header (additive — once `VidyaAvatar` + `VidyaIconButton` patterns are settled)
- Loading skeleton design (3a.1 uses a centred spinner; 3a.2 polishes to skeleton placeholders)
- Unified `/home` endpoint (4 parallel fetches today; aggregation when cold-start latency is measured on device)

---

## Data sources (existing endpoints)

| Card | Endpoint | Returns |
|---|---|---|
| Greeting | `api.getProfile()` | `UserProfile.firstName` |
| READINESS | `api.readiness(userId)` | `Readiness(score 0..1, nTopics)` |
| READINESS delta | `api.dailyActivity(userId, days: 7)` | per-day session counts (proxy until weekly readiness snapshots ship) |
| Stats: STREAK | `api.streak(userId)` | `Streak(current, longest)` |
| Stats: TODAY | `api.dailyActivity(userId, days: 1)` | today's questions answered |
| Stats: MOCKS | `api.mockAttempts()` | count of mock attempts |
| NEXT SESSION | (no endpoint yet) | static "Take a quick practice session" copy |

All endpoints are already used by Aurora's `HomeTab` (`apps/mobile/lib/screens/home_tab.dart` lines 82-86) — no new wiring required client-side.

---

## File map

**Modified:**
- `apps/mobile/lib/vidya/screens/vidya_home_screen.dart` — replace stub with stateful screen that fetches + renders content
- `apps/mobile/test/vidya/phase_3a1_home_test.dart` — new widget tests

**No changes** to `vidya_root_app.dart`, `vidya_main_shell.dart`, design-tokens package — all the visual composition lives inside `VidyaHomeScreen` using existing Vidya primitives (`VidyaCard`, `VidyaButton`, `VidyaThemeData`). No new primitives needed if we compose stats row + readiness card from existing `VidyaCard` instances. (If the stats row turns out to be a worth-promoting primitive in 3a.2, that's a follow-up extraction.)

---

## Task 1: `VidyaHomeScreen` rebuild — fetch + render

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_home_screen.dart`

### State machine

```
init → loading → loaded(data) | error
```

`data` holds: `profile`, `readiness`, `streak`, `mockCount`, `questionsToday`. The screen owns a single `_load()` future that runs all fetches in parallel and stores results in a private `_HomeData` record.

Errors degrade gracefully — partial data is rendered (e.g., if `readiness` fails but `streak` succeeds, the stats row still appears and the READINESS card shows "—").

### Layout (top-to-bottom)

```
┌─────────────────────────────────────────────────┐
│ WED · MAY 26                              [eyebrow, mono, ink3]
│ Hi, Aarav.                                [display, 32px]
│                                                  │
│ ╔══════════════════════════════════════════╗   │
│ ║ NEET READINESS                            ║   │  ← VidyaCard, defaultTone
│ ║ 728 / 900   +18 vs last week              ║   │
│ ╚══════════════════════════════════════════╝   │
│                                                  │
│ ╔══════════════════════════════════════════╗   │
│ ║ NEXT SESSION                              ║   │
│ ║ Take a quick practice session             ║   │
│ ║ [Start practice]                          ║   │  ← VidyaButton md, accent
│ ╚══════════════════════════════════════════╝   │
│                                                  │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│ │ STREAK  │ │ TODAY   │ │ MOCKS   │           │  ← 3 compact stat cards
│ │   12 d  │ │  3 / 5  │ │   14    │           │
│ └─────────┘ └─────────┘ └─────────┘           │
└─────────────────────────────────────────────────┘
```

### Tests

- [ ] **Step 1: Failing tests** — `phase_3a1_home_test.dart`:

```dart
testWidgets('renders greeting + date eyebrow', (tester) async {
  final auth = _authWithUser(firstName: 'Aarav');
  await tester.pumpWidget(_harness(VidyaHomeScreen(auth: auth)));
  await tester.pumpAndSettle();
  expect(find.text('Hi, Aarav.'), findsOneWidget);
  // Eyebrow is dynamic date — assert it matches the day-month-day shape.
  // Test asserts on the regex pattern rather than the exact value.
});

testWidgets('readiness card renders score scaled to /900', (tester) async {
  // Mock api.readiness -> score=0.728
  // Expected display: "655 / 900" (= round(0.728 * 900))
  await tester.pumpWidget(_harness(VidyaHomeScreen(auth: _authWithReadiness(0.728))));
  await tester.pumpAndSettle();
  expect(find.textContaining('/ 900'), findsOneWidget);
});

testWidgets('stats row shows STREAK / TODAY / MOCKS labels', (tester) async {
  await tester.pumpWidget(_harness(VidyaHomeScreen(auth: _authWithStats(...))));
  await tester.pumpAndSettle();
  expect(find.text('STREAK'), findsOneWidget);
  expect(find.text('TODAY'), findsOneWidget);
  expect(find.text('MOCKS'), findsOneWidget);
});

testWidgets('next session Start practice routes via VidyaMainShellScope',
    (tester) async {
  // Wrap in a fake shell scope to capture switchTo calls.
  // Tap Start practice and assert switchTo(VidyaShellTab.practice) was called.
});

testWidgets('readiness fetch failure shows em-dash but keeps other cards',
    (tester) async {
  // Mock readiness throws; others succeed.
  // Expected: "—" in the readiness slot; stats row still rendered.
});
```

- [ ] **Step 2: Implement `_HomeData` record + fetch logic**

```dart
class _HomeData {
  final String firstName;
  final double? readinessScore; // 0..1 or null on failure
  final int? streakDays;
  final int? questionsToday;
  final int? mockCount;
  const _HomeData({
    required this.firstName,
    this.readinessScore,
    this.streakDays,
    this.questionsToday,
    this.mockCount,
  });
}
```

Fetch in `initState()`:
```dart
Future<void> _load() async {
  final user = widget.auth.user;
  if (user == null) {
    setState(() => _state = _HomeState.error);
    return;
  }
  final api = ApiClient(widget.auth);
  // Each fetch is independently best-effort.
  final fetched = await Future.wait([
    api.getProfile().catchError((_) => null),
    api.readiness(user.id).catchError((_) => null),
    api.streak(user.id).catchError((_) => null),
    api.dailyActivity(user.id, days: 1).catchError((_) => <DailyActivity>[]),
    api.mockAttempts().catchError((_) => <MockAttemptRow>[]),
  ]);
  if (!mounted) return;
  setState(() {
    _data = _HomeData(
      firstName: ((fetched[0] as UserProfile?)?.firstName) ?? widget.auth.user?.firstName ?? 'there',
      readinessScore: (fetched[1] as Readiness?)?.score,
      streakDays: (fetched[2] as Streak?)?.current,
      questionsToday: (fetched[3] as List<DailyActivity>).fold<int>(0, (sum, d) => sum + d.questions),
      mockCount: (fetched[4] as List<MockAttemptRow>).length,
    );
    _state = _HomeState.loaded;
  });
}
```

- [ ] **Step 3: Implement card composition**

Three private widgets: `_ReadinessCard`, `_NextSessionCard`, `_StatsRow`. Each takes a small props record and uses `VidyaCard` for the chrome. Stats row is `Row` of 3 `Expanded(Container(... VidyaCard))`.

- [ ] **Step 4: Wire "Start practice" tap to VidyaMainShellScope.switchTo(VidyaShellTab.practice)**

- [ ] **Step 5: Verify tests pass**

- [ ] **Step 6: Commit**

```
feat(vidya): VidyaHomeScreen — slide-7 content (greeting + readiness + stats)
```

---

## Task 2: Verification gate

- [ ] **Step 1: Analyze + tests**

```bash
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && \
  flutter analyze lib/vidya test/vidya && flutter test
```

- [ ] **Step 2: APK build**

```bash
flutter build apk --debug
```

- [ ] **Step 3: Manual device smoke (user-driven)** — sign in as a returning user, confirm home now shows greeting + readiness + stats row, tap Start practice → confirm Practice placeholder appears.

---

## Phase 3a.2 — deferred sparkline + checklist + polish (next phase)

- 12-week readiness sparkline (backend ask: weekly readiness snapshots endpoint OR daily readiness reconstruction client-side)
- TODAY checklist with progress (`3 / 5` indicator + struck-through items) — backend ask: daily plan endpoint
- Loading skeleton placeholders (replace spinner)
- Avatar circle + notification bell in header
