# Vidya Flutter Phase 2f — θ-live quiz overlay

**Date:** 2026-05-26
**Branch:** `feature/vidya-foundation`
**Predecessor:** Phase 2e (guest screening funnel) — merged commits `e1cb863` and `9d5f2d5`.
**Roadmap section:** `docs/superpowers/specs/2026-05-25-vidya-mobile-design-roadmap.md` lines 161–197.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## Goal

Add a **LIVE θ readout** card to `VidyaScreeningQuizScreen` plus richer chrome (timer, close icon, question-metadata row, b-value tag). The θ readout is the product differentiator that surfaces the adaptive engine's signal to the user.

## Reality check — what's actually adaptive today

The 12-item screening is **not** truly IRT-driven. Items are pre-selected by `blueprint.select_questions()` (`services/learning/src/learning/screening/blueprint.py:86`) from `content_schema.questions WHERE difficulty_b BETWEEN -0.5 AND +0.5` and served in a fixed sequence. Per-question Bayesian θ updates do **not** happen on the server today.

Phase 2f therefore exposes a **heuristic** θ that mirrors what `/persist` already does at the end of the test:

```
theta_estimate = clamp(-1.5, +1.5, (running_score - 0.5) * 3.0)
theta_se       = max(0.6, 1.0 / sqrt(answered_count + 1))     # shrinks as items accumulate
next_q_b       = item.difficulty_b                            # already on the item payload
```

This is honest enough to ship — the running score → θ map is the same formula the persisted prior uses (`routes.py:207`), so a student's pre-signup readout is consistent with what gets written to `user_theta_prior` if they convert. We do **not** claim per-question Bayesian inference.

A future phase (likely Phase 5 multi-parameter engine work) can wire the real EAP estimator behind `theta_estimate` — at that point the contract stays identical and the mobile UI doesn't change.

---

## Backend contract (new — additive only)

### `GET /screening/{token}/next` response

```python
class NextResponse(BaseModel):
    item_idx: int
    total: int
    stem: str
    choices: list[str]
    # New in Phase 2f — all optional for forward/backward compat.
    theta_estimate: float | None = None
    theta_se: float | None = None
    next_q_b: float | None = None
```

**Computation in `next_question` handler:**

- `answered_count = len(payload["responses"])`
- `score_so_far = sum(r["is_correct"] for r in responses) / answered_count if answered_count else 0.5`
- `theta_estimate = max(-1.5, min(1.5, (score_so_far - 0.5) * 3.0))`
- `theta_se = max(0.6, 1.0 / sqrt(answered_count + 1))` — uses `math.sqrt`
- `next_q_b = item["difficulty_b"]` (already on payload)

**Item 1 special case:** with `answered_count == 0`, `theta_estimate = 0.0` and `theta_se = 1.0` (full prior uncertainty).

**No breaking change.** Clients that don't read these fields are unaffected. Mobile clients that read them must tolerate missing fields (the `next_q_b` for the very last item is moot since there's no next-q after completion, but each `/next` call still describes a current item the user is about to answer).

---

## Mobile contract (additive)

### `ScreeningQuestion` model — new optional fields

```dart
class ScreeningQuestion implements ScreeningNextResult {
  final int itemIdx;
  final int total;
  final String stem;
  final List<String> choices;
  // Phase 2f additions — all nullable for forward-compat.
  final double? thetaEstimate;
  final double? thetaSe;
  final double? nextQB;
  // ...
}
```

Parsing in `ScreeningClient.next()` reads each as a nullable num and converts to double if present:

```dart
thetaEstimate: (json['theta_estimate'] as num?)?.toDouble(),
thetaSe:       (json['theta_se']       as num?)?.toDouble(),
nextQB:        (json['next_q_b']       as num?)?.toDouble(),
```

### `VidyaThetaReadout` primitive

A new widget rendered below the answer choices on `VidyaScreeningQuizScreen`. Inputs:

- `theta: double?` — current θ estimate
- `previousTheta: double?` — last frame's θ, used to render the trend arrow
- `nextQB: double?` — predicted next-question b-value
- `narrative: String` — positive-framed copy chosen by the consumer based on `(theta, previousTheta)`

**Renders nothing** when `theta == null` (forward-compat with backend that hasn't deployed the new fields).

Visual structure (matches existing Vidya card conventions):

```
┌──────────────────────────────────────────────┐
│ LIVE θ READOUT                               │  ← eyebrow (mono, muted, letter-spaced)
│ θ −0.42  ↑  ·  Next Q diff ↑ to 0.84         │  ← value row
│ "You're answering above your zone."          │  ← narrative (italic, accent)
└──────────────────────────────────────────────┘
```

### Quiz screen chrome additions

| Element | Source |
|---|---|
| `14:32` countdown timer | Client-side `_started = DateTime.now()` set in `_start()`; UI ticks once a second |
| `X` close icon (right of timer) | New top-bar action; routes to `onBack` |
| `7 / 12` counter | Already present (line 140); keep as-is |
| Question-metadata row | New row above stem: `4 marks · b +0.71 · Physics · Thermo` — relies on extended `/next` fields only for `b`; marks/subject/topic are static for now (TODO: backend exposure in Phase 3c) |

For Phase 2f, **only `b +0.71` is dynamic from the backend response.** Marks ("4 marks") and subject·topic ("Physics · Thermo") are placeholder copy until Phase 3c surfaces them; the row is forward-compatible.

---

## Copy strategy — positive-framed narratives

Open question 2 in the roadmap. v1 default (Phase 2f) — narratives keyed by Δθ direction:

| Condition | Narrative |
|---|---|
| `previousTheta == null` (item 1) | "Let's see where you stand." |
| `theta >= previousTheta + 0.05` | "You're answering above your zone." |
| `theta <= previousTheta - 0.05` | "You're being challenged — that's how growth happens." |
| `\|theta - previousTheta\| < 0.05` | "Steady answers — you're in your zone." |

Never display `θ = -1.2` as a negative number framing. The `θ −1.2` value is shown but the narrative is decoupled from sign. UX writer can re-tune in a follow-up; the structure stays.

---

## State machine

No changes to `VidyaRootApp`'s 18-state machine. Phase 2f is purely additive within the existing `screeningQuiz` state.

## File map

**New:**
- `apps/mobile/lib/vidya/widgets/vidya_theta_readout.dart` — the new primitive
- `apps/mobile/test/vidya/phase_2f_theta_readout_test.dart` — widget + integration tests

**Modified:**
- `services/learning/src/learning/screening/routes.py` — `NextResponse` + `next_question` handler
- `services/learning/tests/test_screening_routes.py` — assert new fields, item-1 special case
- `apps/mobile/lib/vidya/screening_client.dart` — `ScreeningQuestion` fields + parsing
- `apps/mobile/lib/vidya/screens/vidya_screening_quiz_screen.dart` — wire timer, X close, metadata row, θ readout, store `_previousTheta`
- `apps/mobile/test/vidya/phase_2c_screening_test.dart` — non-regression: existing tests must still pass with `null` θ fields

---

## Out of scope for Phase 2f

- Backend: real EAP estimator wiring (Phase 5).
- Question metadata (`marks`, `subject`, `topic_name`) on `/next` — Phase 3c.
- Localising the narrative copy to Hindi — Phase 3+ (the english string is in code today).
- Timer-driven session expiry — the visible countdown is decorative for now; server expiry is unchanged.
- Storing θ-trail per session — only the previous θ is kept in widget state.

---

## Confirmed APIs

`POST /screening/start`, `POST /screening/{token}/answer`, `GET /screening/{token}/reveal`, `POST /screening/{token}/persist`, `POST /screening/{token}/diagnostic-complete` — all locked from Phase 2c. **Only `/next` response shape extends.**

---

## Task 1: Backend — extend `/next` response

**Files:**
- Modify: `services/learning/src/learning/screening/routes.py`
- Modify: `services/learning/tests/test_screening_routes.py`

- [ ] **Step 1: Add failing test** to `tests/test_screening_routes.py`. Append a new test inside the existing screening test module:

```python
import math


async def test_next_exposes_theta_fields(client, seed_screening_questions):
    # Start a screening
    r = await client.post("/screening/start", json={"exam_code": "JEE-MAIN"})
    assert r.status_code == 200
    token = r.json()["token"]

    # Item 1 — answered_count == 0
    r = await client.get(f"/screening/{token}/next")
    assert r.status_code == 200
    body = r.json()
    assert body["theta_estimate"] == 0.0
    assert body["theta_se"] == 1.0
    assert isinstance(body["next_q_b"], float)

    # Answer item 1 correctly to bump score_so_far to 1.0
    await client.post(
        f"/screening/{token}/answer",
        json={"item_idx": 0, "answer_idx": body.get("_correct_idx_for_test", 0)},
    )

    # Item 2 — answered_count == 1, score_so_far ∈ {0.0, 1.0}
    r = await client.get(f"/screening/{token}/next")
    body = r.json()
    # theta_estimate = (score_so_far - 0.5) * 3 clamped to [-1.5, 1.5]
    assert body["theta_estimate"] in (-1.5, 1.5)
    # theta_se = max(0.6, 1/sqrt(2)) ≈ 0.707
    assert math.isclose(body["theta_se"], 1.0 / math.sqrt(2), rel_tol=1e-4) or body["theta_se"] == 0.6
```

*Note:* The existing test fixture must expose the correct answer to drive the score deterministically. If it doesn't, an alternative is to fetch the item from the store directly via a test-only helper, or to relax the assertion to "θ moved away from 0.0 after one answer." Choose whichever fits the fixture style of the repo's existing screening tests.

- [ ] **Step 2: Verify test fails**

```bash
cd /home/deepak/projects/adaptive_learning_platform/services/learning && uv run pytest tests/test_screening_routes.py -k theta -x
```
Expected: FAIL — the `theta_estimate` key isn't in the response yet.

- [ ] **Step 3: Implement in `routes.py`**

1. Add `import math` at the top with the other stdlib imports.

2. Extend `NextResponse`:
```python
class NextResponse(BaseModel):
    item_idx: int
    total: int
    stem: str
    choices: list[str]
    theta_estimate: float | None = None
    theta_se: float | None = None
    next_q_b: float | None = None
```

3. Replace the body of `next_question` so it computes the three fields. Replace:
```python
    item = payload["items"][item_idx]
    return NextResponse(
        item_idx=item_idx,
        total=len(payload["items"]),
        stem=item["stem"],
        choices=item["choices"],
    )
```
with:
```python
    item = payload["items"][item_idx]
    responses = payload["responses"]
    answered = len(responses)
    if answered == 0:
        theta_estimate = 0.0
        theta_se = 1.0
    else:
        score = sum(1 for r in responses if r["is_correct"]) / answered
        theta_estimate = max(-1.5, min(1.5, (score - 0.5) * 3.0))
        theta_se = max(0.6, 1.0 / math.sqrt(answered + 1))
    next_q_b = item.get("difficulty_b")
    return NextResponse(
        item_idx=item_idx,
        total=len(payload["items"]),
        stem=item["stem"],
        choices=item["choices"],
        theta_estimate=theta_estimate,
        theta_se=theta_se,
        next_q_b=float(next_q_b) if next_q_b is not None else None,
    )
```

- [ ] **Step 4: Verify tests pass**

```bash
cd /home/deepak/projects/adaptive_learning_platform/services/learning && uv run pytest tests/test_screening_routes.py -x
```
Expected: all screening route tests pass, including the new θ test.

- [ ] **Step 5: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add services/learning/src/learning/screening/routes.py services/learning/tests/test_screening_routes.py && git commit -m "$(cat <<'EOF'
feat(learning): expose theta_estimate, theta_se, next_q_b on /screening/next

Phase 2f. /screening/{token}/next now returns three optional fields:
theta_estimate (clamped (score - 0.5) * 3 with item-1 = 0.0 special
case), theta_se (max(0.6, 1/sqrt(n+1)) — shrinks as items accumulate),
and next_q_b (the b-value of the item being served, taken from the
blueprint payload). All three are optional so existing clients keep
working unchanged. Same seed -> theta formula that /persist uses to
write user_theta_prior, so the live readout is consistent with the
prior eventually persisted on conversion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Mobile — extend `ScreeningClient.next` parsing

**Files:**
- Modify: `apps/mobile/lib/vidya/screening_client.dart`
- Modify: `apps/mobile/test/vidya/phase_2c_screening_test.dart` (or new `phase_2f_*` if cleaner)

- [ ] **Step 1: Add failing test** asserting that when the server includes θ fields, the parsed `ScreeningQuestion` carries them; and when they're absent, the fields are null.

```dart
testWidgets('ScreeningClient.next parses theta_estimate / theta_se / next_q_b when present',
    (tester) async {
  final client = ScreeningClient(
    baseUrl: 'http://test',
    httpClient: MockClient((req) async {
      if (req.url.path.endsWith('/next')) {
        return http.Response(
          jsonEncode({
            'item_idx': 0,
            'total': 12,
            'stem': 'Q',
            'choices': ['a', 'b', 'c', 'd'],
            'theta_estimate': -0.42,
            'theta_se': 0.71,
            'next_q_b': 0.84,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    }),
    auth: AuthClient(baseUrl: 'http://test'),
  );
  final r = await client.next('tkn');
  expect(r, isA<ScreeningQuestion>());
  final q = r as ScreeningQuestion;
  expect(q.thetaEstimate, -0.42);
  expect(q.thetaSe, 0.71);
  expect(q.nextQB, 0.84);
});

testWidgets('ScreeningClient.next tolerates absent theta fields (forward-compat)',
    (tester) async {
  // Same as above but omit the three fields; expect all-null.
  // ...
  expect(q.thetaEstimate, isNull);
  expect(q.thetaSe, isNull);
  expect(q.nextQB, isNull);
});
```

- [ ] **Step 2: Verify tests fail** (the fields don't exist on `ScreeningQuestion` yet).

- [ ] **Step 3: Extend `ScreeningQuestion` + parsing**

In `screening_client.dart`, locate `ScreeningQuestion` and add the three nullable double fields plus parser handling:

```dart
class ScreeningQuestion implements ScreeningNextResult {
  final int itemIdx;
  final int total;
  final String stem;
  final List<String> choices;
  final double? thetaEstimate;
  final double? thetaSe;
  final double? nextQB;
  ScreeningQuestion({
    required this.itemIdx,
    required this.total,
    required this.stem,
    required this.choices,
    this.thetaEstimate,
    this.thetaSe,
    this.nextQB,
  });
}
```

In `next()`, change the existing return to:
```dart
return ScreeningQuestion(
  itemIdx: json['item_idx'] as int,
  total: json['total'] as int,
  stem: json['stem'] as String,
  choices: (json['choices'] as List<dynamic>).cast<String>(),
  thetaEstimate: (json['theta_estimate'] as num?)?.toDouble(),
  thetaSe: (json['theta_se'] as num?)?.toDouble(),
  nextQB: (json['next_q_b'] as num?)?.toDouble(),
);
```

- [ ] **Step 4: Verify tests pass**

```bash
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2c_screening_test.dart
```
Expected: all Phase 2c tests still pass (they use the no-θ fixtures) AND the new θ assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/vidya/screening_client.dart apps/mobile/test/vidya/phase_2c_screening_test.dart && git commit -m "feat(vidya): ScreeningClient parses theta_estimate / theta_se / next_q_b"
```

---

## Task 3: Mobile — `VidyaThetaReadout` primitive

**Files:**
- Create: `apps/mobile/lib/vidya/widgets/vidya_theta_readout.dart`
- Create: `apps/mobile/test/vidya/phase_2f_theta_readout_test.dart`
- Modify: `apps/mobile/lib/vidya/widgets.dart` (the barrel) — add export

- [ ] **Step 1: Write failing test** — `phase_2f_theta_readout_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/widgets/vidya_theta_readout.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
    );

void main() {
  group('VidyaThetaReadout', () {
    testWidgets('renders nothing when theta is null', (tester) async {
      await tester.pumpWidget(_harness(VidyaThetaReadout(
        theta: null,
        previousTheta: null,
        nextQB: null,
        narrative: 'ignored',
      )));
      expect(find.text('LIVE θ READOUT'), findsNothing);
    });

    testWidgets('renders eyebrow, value, next-Q line, narrative when theta present',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaThetaReadout(
        theta: -0.42,
        previousTheta: -0.50,
        nextQB: 0.84,
        narrative: "You're answering above your zone.",
      )));
      expect(find.text('LIVE θ READOUT'), findsOneWidget);
      expect(find.textContaining('−0.42'), findsOneWidget);
      expect(find.textContaining('0.84'), findsOneWidget);
      expect(find.textContaining("answering above"), findsOneWidget);
    });

    testWidgets('renders ↑ arrow when theta increased', (tester) async {
      await tester.pumpWidget(_harness(VidyaThetaReadout(
        theta: 0.10,
        previousTheta: -0.10,
        nextQB: 0.50,
        narrative: 'up',
      )));
      // Up arrow icon is present.
      expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
    });

    testWidgets('renders ↓ arrow when theta decreased', (tester) async {
      await tester.pumpWidget(_harness(VidyaThetaReadout(
        theta: -0.20,
        previousTheta: 0.10,
        nextQB: 0.30,
        narrative: 'down',
      )));
      expect(find.byIcon(Icons.arrow_downward), findsOneWidget);
    });

    testWidgets('no arrow when previousTheta is null (item 1)', (tester) async {
      await tester.pumpWidget(_harness(VidyaThetaReadout(
        theta: 0.0,
        previousTheta: null,
        nextQB: 0.50,
        narrative: "Let's see where you stand.",
      )));
      expect(find.byIcon(Icons.arrow_upward), findsNothing);
      expect(find.byIcon(Icons.arrow_downward), findsNothing);
    });

    testWidgets('renders nothing when nextQB null but theta present (graceful)',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaThetaReadout(
        theta: -0.42,
        previousTheta: null,
        nextQB: null,
        narrative: "n",
      )));
      // θ still shown, but the "Next Q diff" line is hidden.
      expect(find.text('LIVE θ READOUT'), findsOneWidget);
      expect(find.textContaining('Next Q diff'), findsNothing);
    });
  });
}
```

- [ ] **Step 2: Verify tests fail** (widget doesn't exist).

- [ ] **Step 3: Implement `VidyaThetaReadout`**

```dart
// VidyaThetaReadout — live diagnostic readout card shown below the
// answer choices on VidyaScreeningQuizScreen. Renders nothing when
// theta is null (forward-compat with backends that haven't deployed
// the Phase 2f response fields yet).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaThetaReadout extends StatelessWidget {
  final double? theta;
  final double? previousTheta;
  final double? nextQB;
  final String narrative;

  const VidyaThetaReadout({
    super.key,
    required this.theta,
    required this.previousTheta,
    required this.nextQB,
    required this.narrative,
  });

  String _formatTheta(double v) {
    final sign = v < 0 ? '−' : ''; // − (proper minus sign)
    return '$sign${v.abs().toStringAsFixed(2)}';
  }

  Widget? _trendIcon(Color color) {
    if (previousTheta == null || theta == null) return null;
    final delta = theta! - previousTheta!;
    if (delta.abs() < 0.05) return null;
    return Icon(
      delta > 0 ? Icons.arrow_upward : Icons.arrow_downward,
      size: 16,
      color: color,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (theta == null) return const SizedBox.shrink();
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;
    final trend = _trendIcon(accent);
    return VidyaCard(
      tone: VidyaCardTone.defaultTone,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'LIVE θ READOUT',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                color: muted,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Text(
                  'θ ${_formatTheta(theta!)}',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: ink,
                  ),
                ),
                if (trend != null) ...[
                  const SizedBox(width: 6),
                  trend,
                ],
                if (nextQB != null) ...[
                  const SizedBox(width: 10),
                  Text(
                    '·  Next Q diff ${nextQB!.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 12,
                      color: muted,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 6),
            Text(
              narrative,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontStyle: FontStyle.italic,
                fontSize: 13,
                color: accent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Add barrel export**

In `apps/mobile/lib/vidya/widgets.dart` (or equivalent index), add:
```dart
export 'widgets/vidya_theta_readout.dart';
```

- [ ] **Step 5: Verify tests pass**

```bash
flutter test test/vidya/phase_2f_theta_readout_test.dart
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/vidya/widgets/vidya_theta_readout.dart apps/mobile/test/vidya/phase_2f_theta_readout_test.dart apps/mobile/lib/vidya/widgets.dart && git commit -m "feat(vidya): VidyaThetaReadout — live diagnostic readout card primitive"
```

---

## Task 4: Wire θ readout + chrome into `VidyaScreeningQuizScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_screening_quiz_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2c_screening_test.dart` (non-regression) and/or append to `phase_2f_theta_readout_test.dart`

- [ ] **Step 1: Append integration tests** confirming the quiz screen renders the θ readout when the backend response includes the fields, and renders **nothing** when they're absent.

- [ ] **Step 2: Add timer + close + metadata row + θ readout**

Inside `_VidyaScreeningQuizScreenState`:

1. Add field `DateTime? _started;` and set it in `_start()` after `widget.client.start(...)` succeeds. Add a `Timer.periodic(const Duration(seconds: 1), (_) => setState((){}))` that ticks `_now = DateTime.now()` so the countdown re-renders. Cancel in `dispose()`.

2. Add field `double? _previousTheta;` — set in `_fetchNext()` before the `setState` that overwrites `_question`, using the **previous** question's `thetaEstimate` (not the new one). Carefully: the previous read is the value of `_question?.thetaEstimate` *before* we overwrite `_question`.

3. Replace `appBar: VidyaAppBar(title: '')` with a custom row carrying the countdown + close icon:
```dart
appBar: VidyaAppBar(
  title: _formatCountdown(_started, _now, const Duration(minutes: 15)),
  trailing: IconButton(
    icon: Icon(Icons.close, color: ink),
    onPressed: widget.onBack,
  ),
),
```
(`_formatCountdown` is a small helper returning `'14:32'` or empty string while `_started == null`.)

4. Above the stem, add a metadata row:
```dart
Row(
  children: [
    _Tag(text: '4 marks'),
    const SizedBox(width: 8),
    if (q.nextQB != null) _Tag(text: 'b ${q.nextQB! >= 0 ? '+' : ''}${q.nextQB!.toStringAsFixed(2)}'),
    const SizedBox(width: 8),
    _Tag(text: 'Physics · Thermo'),
  ],
),
```
where `_Tag` is a small private widget rendering a pill in `theme.muted`. Marks + subject are static placeholder copy in Phase 2f.

5. Replace the `Spacer`/bottom Submit area: insert the `VidyaThetaReadout` between the choices list and the Submit button:

```dart
const SizedBox(height: 12),
VidyaThetaReadout(
  theta: q.thetaEstimate,
  previousTheta: _previousTheta,
  nextQB: q.nextQB,
  narrative: _narrativeFor(q.thetaEstimate, _previousTheta),
),
const SizedBox(height: 12),
VidyaButton( ... existing Submit ... ),
```

where `_narrativeFor()` implements the copy table:

```dart
String _narrativeFor(double? theta, double? previous) {
  if (theta == null) return '';
  if (previous == null) return "Let's see where you stand.";
  final delta = theta - previous;
  if (delta >= 0.05) return "You're answering above your zone.";
  if (delta <= -0.05) return "You're being challenged — that's how growth happens.";
  return "Steady answers — you're in your zone.";
}
```

- [ ] **Step 3: Verify all Vidya tests pass**

```bash
flutter test test/vidya/
```

Expected: 372 prior + N new Phase 2f tests = all green. Phase 2c integration tests must NOT regress — the assertion is that the quiz screen renders correctly with `null` θ fields (the existing 2c test fixtures don't supply them).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/vidya/screens/vidya_screening_quiz_screen.dart apps/mobile/test/vidya/phase_2c_screening_test.dart apps/mobile/test/vidya/phase_2f_theta_readout_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): wire VidyaThetaReadout + chrome into VidyaScreeningQuizScreen

Phase 2f. The quiz screen now shows a 14:32 countdown + X close in the
top bar, a metadata pill row (marks · b±0.71 · subject·topic) above
the stem, and the LIVE θ readout card between choices and Submit.
The θ card is forward-compatible: when the backend omits theta fields
(any environment not yet on /next response v2), the card collapses
gracefully and the rest of the screen is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verification gate

- [ ] **Step 1: Run analyze + tests**

```bash
cd /home/deepak/projects/adaptive_learning_platform/services/learning && uv run pytest tests/test_screening_routes.py
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter analyze lib/vidya test/vidya && flutter test
```

Expected: 0 errors / 0 warnings; all backend screening + all mobile tests pass.

- [ ] **Step 2: Build APK**

```bash
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter build apk --debug
```

Expected: `✓ Built build/app/outputs/flutter-apk/app-debug.apk`.

- [ ] **Step 3: Manual device smoke**

Install the APK and walk the guest funnel through to the screening quiz:

1. Welcome → Get started → 3 onboarding cards → Begin → guest exam select → NEET → Continue → guest screening intro → Start.
2. Verify the countdown appears in the top bar and ticks down by 1s.
3. Answer 3+ questions; verify the θ readout updates each frame, the trend arrow appears after item 1, and the narrative changes when the student misses an item.
4. Tap X — verify it routes back to register (since `_pendingGuestExamCode` is set).

- [ ] **Step 4: Optional commit** (only if any cleanup/docs landed during smoke).

---

## Self-Review Notes

Cross-checked against roadmap Phase 2f section:

- LIVE θ readout below choices → Task 3 + Task 4 ✓
- Trend arrow (`↑`/`↓`) → Task 3 ✓
- Predicted next-Q difficulty preview ("Next Q diff ↑ to 0.84") → Task 3 + Task 4 ✓
- Positive-framed narrative → Task 4's `_narrativeFor` ✓
- Header timer + X close → Task 4 ✓
- Metadata tag row (marks · b · subject·topic) → Task 4 ✓
- Backend `/next` exposure of θ, SE, next b → Task 1 ✓
- Forward-compat — card collapses when fields absent → Task 3's `if (theta == null) return const SizedBox.shrink()` ✓
- Applies to both authed (Phase 2c) and guest (Phase 2e) — they use the same `VidyaScreeningQuizScreen` ✓

Open items deferred (logged for follow-up):

- Real EAP-driven θ (Phase 5).
- UX writer pass on θ narrative copy (roadmap open question 2).
- Backend exposure of `marks` + `subject` + `topic_name` on `/next` (Phase 3c).
- Localisation of narrative copy to Hindi (Phase 3+).

---

## Backend ask checklist (for tracking PR review)

- [ ] `services/learning/src/learning/screening/routes.py` — `NextResponse` adds three nullable floats.
- [ ] Same file — `next_question` handler computes them.
- [ ] `services/learning/tests/test_screening_routes.py` — new tests for item-1 special case + post-answer θ shift.
- [ ] No DB migration needed — fields are computed at request time from the in-memory store payload.
- [ ] No NATS event shape change.
- [ ] No new env var or feature flag — purely additive.
