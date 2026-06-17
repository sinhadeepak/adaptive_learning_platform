# Phase 3a.2 — Vidya home header polish (avatar + bell)

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3a.1 (Home content shipped). Adds the slide-7 header chrome (avatar circle + notification bell with unread badge).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Round out the Phase 3a.1 home header by adding:

1. **Avatar circle** on the trailing edge of the header (initials only in 3a.2; URL avatars when profile upload settles).
2. **Notification bell** with unread-count badge (uses existing `/notifications/inbox/{userId}/unread-count`).

The new `VidyaBellButton` primitive is **stateless** — the home screen owns the count fetch. This avoids the `Timer.periodic` pattern that Aurora's `InboxBellButton` uses and that Phase 3a explicitly forbade (it breaks `pumpAndSettle`).

---

## Out of scope for Phase 3a.2 (still deferred to 3a.3+)

- 12-week readiness sparkline (needs weekly readiness snapshots endpoint)
- TODAY checklist with `3 / 5` interactive progress (needs daily plan endpoint)
- Skeleton loading placeholders (currently a centred spinner)
- Live unread-count refresh when the user returns from a notifications screen (3a.3+ — needs a `Navigator.push().then(refresh)` pattern wired in)

---

## File map

**New:**
- `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_bell_button.dart` — stateless bell with unread badge
- `packages/design-tokens-flutter/test/vidya/widgets/vidya_bell_button_test.dart` — unit tests

**Modified:**
- `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` — export
- `apps/mobile/lib/vidya/screens/vidya_home_screen.dart` — add header row (initials avatar + greeting + bell), add `unreadCount` to `_HomeData` + fetch
- `apps/mobile/test/vidya/phase_3a1_home_test.dart` — add header tests (avatar visible, bell badge shows when count > 0)

No new endpoints. No `vidya_root_app.dart` changes.

---

## VidyaBellButton API

```dart
class VidyaBellButton extends StatelessWidget {
  final int unreadCount;          // 0 hides the badge
  final VoidCallback onTap;
  const VidyaBellButton({
    super.key,
    required this.unreadCount,
    required this.onTap,
  });
}
```

Visual:
- 44px round button, `theme.paper2` background, `theme.ink3` border at alpha 0.2
- Bell icon `Icons.notifications_outlined`, 20px, `theme.ink2`
- Badge: top-right offset, `theme.bad` (red) background, white text. Hidden when `unreadCount == 0`. Shows `99+` when > 99.

---

## Task 1: VidyaBellButton primitive

- [ ] **Step 1: Failing test** — `vidya_bell_button_test.dart`:

```dart
testWidgets('renders bell icon with no badge when unreadCount == 0', (tester) async {
  await tester.pumpWidget(_harness(VidyaBellButton(unreadCount: 0, onTap: () {})));
  expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
  expect(find.textContaining(RegExp(r'^[0-9]+\$')), findsNothing); // no number
});

testWidgets('renders badge with count when unreadCount > 0', (tester) async {
  await tester.pumpWidget(_harness(VidyaBellButton(unreadCount: 5, onTap: () {})));
  expect(find.text('5'), findsOneWidget);
});

testWidgets('renders 99+ when unreadCount > 99', (tester) async {
  await tester.pumpWidget(_harness(VidyaBellButton(unreadCount: 142, onTap: () {})));
  expect(find.text('99+'), findsOneWidget);
});

testWidgets('tap fires onTap', (tester) async {
  var taps = 0;
  await tester.pumpWidget(_harness(VidyaBellButton(unreadCount: 0, onTap: () => taps++)));
  await tester.tap(find.byIcon(Icons.notifications_outlined));
  expect(taps, 1);
});
```

- [ ] **Step 2: Implementation + barrel export** — see Implementation skeleton.
- [ ] **Step 3: Verify tests pass**.
- [ ] **Step 4: Commit**.

### Implementation skeleton

```dart
class VidyaBellButton extends StatelessWidget {
  final int unreadCount;
  final VoidCallback onTap;
  const VidyaBellButton({super.key, required this.unreadCount, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final hasUnread = unreadCount > 0;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: v.paper2,
            shape: BoxShape.circle,
            border: Border.all(color: v.ink3.withValues(alpha: 0.2)),
          ),
          child: IconButton(
            icon: Icon(Icons.notifications_outlined, size: 20, color: v.ink2),
            onPressed: onTap,
            splashRadius: 22,
            tooltip: hasUnread ? '$unreadCount unread' : 'Notifications',
          ),
        ),
        if (hasUnread)
          Positioned(
            right: -2,
            top: -2,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              decoration: BoxDecoration(
                color: v.bad,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: v.paper, width: 2),
              ),
              child: Center(
                child: Text(
                  unreadCount > 99 ? '99+' : '$unreadCount',
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
```

---

## Task 2: Wire header row into VidyaHomeScreen

**Files:**
- `apps/mobile/lib/vidya/screens/vidya_home_screen.dart`
- `apps/mobile/test/vidya/phase_3a1_home_test.dart`

Changes:

1. Add a 6th parallel fetch: `_safe<int>(() => api.inboxUnreadCount(user.id))` (default 0 on failure).
2. Add `unreadCount` to `_HomeData`.
3. Replace the existing simple `Text('Hi, ${firstName}.')` row with a `Row` containing:
   - Left: a `Column` with the date eyebrow + greeting (existing content)
   - Right: `VidyaBellButton` + `VidyaAvatar(initials: firstName[0])` side-by-side with 8px spacing
4. `VidyaBellButton.onTap`: for Phase 3a.2, route via `VidyaMainShellScope.switchTo(VidyaShellTab.more)` as a stand-in until a proper notifications screen lands. (Open question: leave a TODO or push a placeholder?)
5. Add 2 tests: avatar visible (assert `find.text('A')` for "Aarav"), bell + badge visible when `unreadCount > 0`.

- [ ] **Step 1: Test additions** to `phase_3a1_home_test.dart`:

```dart
testWidgets('header renders initials avatar (first letter of firstName)',
    (tester) async {
  final auth = await _loggedInAuth(_homeMocks(firstName: 'Aarav'));
  await tester.pumpWidget(_harness(VidyaHomeScreen(auth: auth)));
  await tester.pumpAndSettle();
  // The 'A' initial appears inside the avatar.
  expect(find.text('A'), findsOneWidget);
});

testWidgets('bell shows unread badge when count > 0', (tester) async {
  // Mock '/notifications/inbox/...' to return count = 3.
  final auth = await _loggedInAuth(_homeMocksWithUnread(3));
  await tester.pumpWidget(_harness(VidyaHomeScreen(auth: auth)));
  await tester.pumpAndSettle();
  expect(find.text('3'), findsOneWidget);
});
```

- [ ] **Step 2: Implementation** — see file map above.
- [ ] **Step 3: Verify tests** + flutter test (no regressions).
- [ ] **Step 4: Commit**.

---

## Task 3: Verification gate

- [ ] **Step 1: Analyze + tests**

```bash
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && \
  flutter analyze lib/vidya test/vidya && flutter test
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && \
  flutter test test/vidya/widgets/
```

- [ ] **Step 2: APK build**: `flutter build apk --debug`.

- [ ] **Step 3: Manual smoke (user-driven)** — confirm avatar + bell are top-right of home; confirm badge appears with mocked unread count.
