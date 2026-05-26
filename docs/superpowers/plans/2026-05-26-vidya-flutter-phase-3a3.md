# Phase 3a.3 — Home loading skeleton

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3a.2 (avatar + bell shipped).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Replace the centred `CircularProgressIndicator` in `VidyaHomeScreen`'s loading state with a structured skeleton that mirrors the eventual layout (date eyebrow + greeting + READINESS card + NEXT SESSION card + stats row). Static gray blocks — **no shimmer animation** — to avoid the `pumpAndSettle()` deadlock animated skeletons typically introduce.

This is the **last fully client-only** Phase 3a.X polish item. After this, the remaining items (12-week sparkline, TODAY checklist, bell → real notifications screen) all need backend work that hasn't shipped yet.

---

## Out of scope for Phase 3a.3 (still deferred)

- Shimmer animation on skeletons (acceptable trade — static skeleton is clearer than a spinner; animation is a Phase 3a.4 polish if measured to matter)
- Skeletons on the placeholder tabs (Study/Practice/Insights/More) — they don't fetch anything, so spinning placeholders aren't useful
- Per-card skeleton (only-some-loaded state) — Phase 3a.X is all-or-nothing; partial loaded states can come once we have streaming fetches

---

## File map

**New:**
- `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_skeleton.dart` — `VidyaSkeletonBlock` primitive (a rounded muted-fill rectangle)
- `packages/design-tokens-flutter/test/vidya/widgets/vidya_skeleton_test.dart` — primitive unit tests

**Modified:**
- `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` — barrel export
- `apps/mobile/lib/vidya/screens/vidya_home_screen.dart` — replace `Center(CircularProgressIndicator)` with `_HomeSkeleton`
- `apps/mobile/test/vidya/phase_3a1_home_test.dart` — add a test that asserts skeleton blocks appear in the loading state (and disappear once data lands)

---

## `VidyaSkeletonBlock` API

```dart
class VidyaSkeletonBlock extends StatelessWidget {
  final double? width;     // null → expand horizontally
  final double height;     // required — explicit so caller designs the shape
  final BorderRadius? borderRadius;
  const VidyaSkeletonBlock({
    super.key,
    this.width,
    required this.height,
    this.borderRadius,
  });
}
```

Visual: `theme.ink3.withValues(alpha: 0.10)` filled rectangle, rounded corners (default 8px). No animation. No text content.

---

## Task 1: `VidyaSkeletonBlock` primitive

- [ ] **Step 1: Failing test** — `vidya_skeleton_test.dart`:

```dart
testWidgets('renders with default 8px border radius', (tester) async { … });
testWidgets('uses muted fill from theme', (tester) async { … });
testWidgets('respects explicit width + height', (tester) async { … });
```

- [ ] **Step 2: Implementation + barrel export**.
- [ ] **Step 3: Verify tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 2: Replace home loading spinner with structured skeleton

**Files:**
- `apps/mobile/lib/vidya/screens/vidya_home_screen.dart`
- `apps/mobile/test/vidya/phase_3a1_home_test.dart`

Compose `_HomeSkeleton` matching the loaded-state layout:

```
[skeleton 80x12   ]                            [skeleton 44x44] [skeleton 40x40]   ← header (eyebrow + bell + avatar)
[skeleton 240x32  ]                                                                ← greeting

┌─────────────────────────────────────────────┐
│ [skeleton 60x10]                            │  ← READINESS eyebrow
│ [skeleton 140x32]                           │  ← score
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ [skeleton 80x10]                            │  ← NEXT SESSION eyebrow
│ [skeleton 200x20]                           │  ← title
│ [skeleton 100x36]                           │  ← button
└─────────────────────────────────────────────┘

┌STAT┐ ┌STAT┐ ┌STAT┐    ← stats row (3 cards w/ 2 skeleton lines each)
```

Test: in the loading state, several `VidyaSkeletonBlock` widgets should be present; once `_data` lands, they disappear.

- [ ] **Step 1: Test additions** — add one widget test that pumps a screen where the futures complete after a delay, verifies skeleton blocks present before settle, absent after.

(For simplicity, the existing tests just `pumpAndSettle` straight through to the loaded state. The new test uses `tester.pump()` once and asserts skeletons; then `pumpAndSettle` to flush and re-assert they're gone.)

- [ ] **Step 2: Implementation**: a `_HomeSkeleton` private widget composing the 4 sections.
- [ ] **Step 3: Verify** all home + design-tokens tests pass.
- [ ] **Step 4: Commit**.

---

## Task 3: Verification gate

- [ ] **Step 1: Analyze + tests** (mobile + design-tokens).
- [ ] **Step 2: APK build**.
- [ ] **Step 3: Manual smoke (user-driven)** — confirm the skeleton appears for the brief moment before data lands, instead of a spinner.
