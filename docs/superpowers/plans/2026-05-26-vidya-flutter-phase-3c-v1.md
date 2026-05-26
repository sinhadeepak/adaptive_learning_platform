# Phase 3c v1 — Vidya Practice tab landing

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3b v1 (Study tab shipped).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Replace `VidyaPracticeTabPlaceholder` with a real `VidyaPracticeScreen` landing — a hub with three practice "mode" cards: **Quick Practice**, **Focused Practice**, **Mock Test**. Each card tap shows a snackbar (real session UI lands in Phase 3c.full once the existing `VidyaScreeningQuizScreen` is generalised into a reusable practice surface with the Phase 2f θ-live overlay).

This is the **4th of 5 Vidya tabs** to ship real content; only Insights remains as a placeholder afterwards.

---

## Out of scope for Phase 3c v1 (deferred to Phase 3c.full)

- `VidyaPracticeSessionScreen` — the actual quiz session (reuses `VidyaScreeningQuizScreen` with θ-live overlay from Phase 2f)
- Question fetching / answer submission (uses existing quiz endpoints — wiring lives in 3c.full)
- Adaptive difficulty selection
- Time-limited mode (the Mock Test card just snackbars in v1)
- Topic-specific practice ("practice your weak topics") — needs mastery rollup; comes with 3b.full's mastery work
- Resume-in-progress detection

---

## Design

Landing renders three cards in a vertical list:

```
PRACTICE                            ← eyebrow
Sharpen your edge.                  ← display, 32px

┌─────────────────────────────────┐
│ QUICK • 10 mins                 │  ← eyebrow + duration
│ Quick Practice                  │  ← display, 22px
│ Random questions from your      │  ← body, 13px
│ active syllabus.                │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ FOCUSED • 20 mins               │
│ Focused Practice                │
│ Drill the topics you've struggled│
│ with recently.                  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ MOCK • 3 hrs                    │
│ Mock Test                       │
│ Full-length test under timed    │
│ exam conditions.                │
└─────────────────────────────────┘
```

Cards are tappable; tap shows a snackbar `<Mode> session is coming in Phase 3c.full.`.

---

## File map

**New:**
- `apps/mobile/lib/vidya/screens/vidya_practice_screen.dart`
- `apps/mobile/test/vidya/phase_3c_practice_test.dart`

**Modified:**
- `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` — swap `VidyaPracticeTabPlaceholder` for `VidyaPracticeScreen`
- `apps/mobile/lib/vidya/screens/vidya_tab_placeholders.dart` — remove `VidyaPracticeTabPlaceholder`

No data fetches in v1 — the landing is purely static content. Phase 3c.full adds the session UI which will hit existing quiz endpoints.

---

## Task 1: `VidyaPracticeScreen` + tests

- [ ] **Step 1: Failing tests** — `phase_3c_practice_test.dart`:

```dart
testWidgets('renders PRACTICE eyebrow + tagline', (tester) async { … });
testWidgets('renders three mode cards', (tester) async {
  expect(find.text('Quick Practice'), findsOneWidget);
  expect(find.text('Focused Practice'), findsOneWidget);
  expect(find.text('Mock Test'), findsOneWidget);
});
testWidgets('tapping a card shows the deferred snackbar', (tester) async {
  await tester.tap(find.text('Quick Practice'));
  await tester.pump();
  expect(find.textContaining('coming in Phase 3c.full'), findsOneWidget);
});
```

- [ ] **Step 2: Implementation** — a stateless `VidyaPracticeScreen` rendering a `ListView` with header + three `_PracticeModeCard` widgets.
- [ ] **Step 3: Verify tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 2: Wire VidyaMainShell to use VidyaPracticeScreen

- [ ] **Step 1: Replace tab content** in vidya_main_shell.dart.
- [ ] **Step 2: Remove VidyaPracticeTabPlaceholder** from vidya_tab_placeholders.dart.
- [ ] **Step 3: Verify shell + practice tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 3: Verification gate

- [ ] Analyze + tests.
- [ ] APK build.
- [ ] Manual smoke: tap PRACTICE → 3 mode cards → tap one → snackbar.

---

## Post Phase 3c v1 — what's left for the Vidya migration

| Tab / phase | Status after 3c v1 | Next |
|---|---|---|
| HOME (Phase 3a → 3a.3) | ✅ shipped client-only; backend-blocked items waiting | 3a.4 needs sparkline + checklist endpoints |
| STUDY (Phase 3b v1) | ✅ subject list v1 | 3b.full = mastery rollup + subject detail |
| PRACTICE (this) | ✅ landing v1 | 3c.full = real session screen with θ-live |
| INSIGHTS | ⏸️ still a placeholder | 3d v1 next — last placeholder to retire |
| MORE (Phase 3e v1) | ✅ profile + Aurora toggle + sign out | 3e.full = editable profile, theme, language |
| Aurora deletion sweep | ⏸️ | 3g — runs after 3a.full + 3b.full + 3c.full + 3d.full + 3e.full all ship |
