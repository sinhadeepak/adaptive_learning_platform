# Vidya Flutter Phase 2c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 3-screen Vidya screening flow (intro + 12-item quiz + reveal-with-persist) wedged into `VidyaRootApp`'s state machine between `examSelect` and `home`, so first-time authenticated users complete a quick diagnostic that seeds their IRT prior before they reach `MainScaffold`.

**Architecture:** Three new screens — `VidyaScreeningIntroScreen` (Start + Skip), `VidyaScreeningQuizScreen` (anonymous-friendly question loop hitting `/screening/start` → `/next` → `/answer` until the server returns 409 "complete"), `VidyaScreeningResultScreen` (reveals score, topic breakdown, then calls `/screening/{token}/persist` + `/profile/me/diagnostic-complete` on Continue). `VidyaRootApp` grows three states between `examSelect` and `home`. Authenticated users with `onboardingState == 'ONBOARDED'` skip the screening entirely; users who tap "Skip" on the intro mark `vidya.screening_skipped` so we don't nag them on every cold start, but their server-side FSM advance still requires either screening completion or a separate "skip" backend call (deferred — for 2c, Skip locally bypasses the screening but doesn't advance the FSM, so the user can run the diagnostic later from Settings).

**Tech Stack:** Flutter 3.x, `AuthClient` (existing `apiPost`, `apiGet`), `http` (existing — for unauthenticated `/screening/start` call which is allowed without a bearer token). Vidya primitives from Phase 1 + 2a.

**Spec source:** `docs/superpowers/specs/2026-05-18-vidya-flutter-phase-2a-design.md` lines 24, 379 (table rows naming the 3 screens).

---

## Backend contract (verified — `services/learning/src/learning/screening/routes.py`)

| Call | Auth | Request | Response |
|---|---|---|---|
| `POST /api/v1/screening/start` | none | `{exam_code: "JEE-MAIN", language: "en"}` | `{token, target_count, exam_code}` |
| `GET /api/v1/screening/{token}/next` | none | — | `{item_idx, total, stem, choices[]}` or 409 `{code: "complete"}` when done |
| `POST /api/v1/screening/{token}/answer` | none | `{item_idx, answer_idx}` | 204 |
| `GET /api/v1/screening/{token}/reveal` | none | — | `{score_pct, correct, total, topic_breakdown[], readiness_seed}` |
| `POST /api/v1/screening/{token}/persist` | required | — | `{persisted, attempt_id}` |
| `POST /api/v1/profile/me/diagnostic-complete` | required | `{}` | 204 (FSM advance) |

Error codes: 404 `expired`, 409 `complete` (terminal — call `/reveal`), 409 `out_of_order`, 409 `incomplete`, 503 `screening_unavailable`.

The 12-item count comes from `screening/blueprint.py` (default `target_count`). `Start` may return 503 if the exam doesn't have enough published questions — we surface a banner + Skip-only path.

---

## File Map

**Create (3 screens + extended test group + 1 helper):**
- `apps/mobile/lib/vidya/screens/vidya_screening_intro_screen.dart`
- `apps/mobile/lib/vidya/screens/vidya_screening_quiz_screen.dart`
- `apps/mobile/lib/vidya/screens/vidya_screening_result_screen.dart`
- `apps/mobile/lib/vidya/screening_client.dart` — thin wrapper over `http` + `AuthClient` for the 6 endpoints (own file so tests can pass a fake)
- `apps/mobile/test/vidya/phase_2c_screening_test.dart` — 3 groups (intro + quiz + result), shared `_harness` helper

**Modify:**
- `apps/mobile/lib/vidya/vidya_root_app.dart` — add 3 states + screening-skip flag + wiring
- `apps/mobile/lib/vidya/vidya.dart` — add 4 exports (3 screens + client)
- `apps/mobile/test/vidya/vidya_root_app_test.dart` — append 2 transition tests (examSelect → screening → home; screening-done skips on cold restart)

**File responsibilities:**

| File | Responsibility | Approx. LOC |
|---|---|---|
| `vidya_screening_intro_screen.dart` | Persona-aware framing ("8 quick questions — we'll calibrate"), Start CTA, Skip text-button. Pure presentation. | ~140 |
| `vidya_screening_quiz_screen.dart` | One-question-at-a-time. Calls `start` on init, loops `next/answer`, on 409 "complete" calls `onCompleted(token)`. Progress dot row + stem + 4 option cards. | ~280 |
| `vidya_screening_result_screen.dart` | Calls `reveal(token)` on init; renders score percentage, top-3 weakest topics, "Save & continue" button → `persist(token)` + `diagnostic-complete` → `onCompleted()` (which the parent routes to `home`). | ~240 |
| `screening_client.dart` | Six methods mirroring the routes. `start/next/answer/reveal` use raw `http.Client` (no auth required); `persist` + `diagnosticComplete` use `auth.apiPost`. Return typed payloads. | ~140 |
| `vidya_root_app.dart` (extended) | +3 states (screeningIntro, screeningQuiz, screeningResult), wedge into existing examSelect → home path. | +60 (net) |

---

## Confirmed APIs (locked from 2a + 2b)

- `VidyaScaffold`, `VidyaAppBar`, `VidyaButton(size:, disabled:, label:, onPressed:, key?:)` — `VidyaButtonSize.lg`
- `VidyaBanner(tone: VidyaBannerTone.warn/info, message:)`
- `VidyaCard(child:, onTap?:, tone?:)` — `VidyaCardTone.accent` for the selected choice
- `VidyaThemeData.of(context)` non-nullable; `theme.ink`, `theme.ink3`, `theme.accent`, `theme.paper`
- `VidyaFonts.display`, `VidyaFonts.ui`, `VidyaFonts.mono`
- `VidyaMasteryBar(value:, bucket:, label:)`, `VidyaMasteryBucket.weak/dev/strong`
- `AuthClient.apiPost(path, body)` + `AuthClient.apiGet(path)` — add bearer header automatically
- Test viewport 544px → use `LayoutBuilder + SingleChildScrollView + ConstrainedBox(minHeight) + IntrinsicHeight` for `Spacer` widgets

---

## Task 1: `ScreeningClient` (HTTP wrapper)

**Files:**
- Create: `apps/mobile/lib/vidya/screening_client.dart`
- Create: `apps/mobile/test/vidya/phase_2c_screening_test.dart` (new file — group + helpers, populated incrementally)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Write failing test**

Create `apps/mobile/test/vidya/phase_2c_screening_test.dart`:

```dart
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screening_client.dart';

ScreeningClient _makeClient(MockClient mock, {AuthClient? auth}) {
  return ScreeningClient(
    baseUrl: 'http://test',
    httpClient: mock,
    auth: auth ??
        AuthClient(baseUrl: 'http://test', httpClient: mock),
  );
}

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('ScreeningClient', () {
    test('start posts exam_code+language and returns ScreeningStart',
        (() async {
      String? capturedBody;
      final mock = MockClient((req) async {
        capturedBody = req.body;
        return http.Response(
          jsonEncode({'token': 'tok-1', 'target_count': 12, 'exam_code': 'JEE-MAIN'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final c = _makeClient(mock);
      final r = await c.start(examCode: 'JEE-MAIN', language: 'en');
      expect(r.token, 'tok-1');
      expect(r.targetCount, 12);
      expect(r.examCode, 'JEE-MAIN');
      expect(jsonDecode(capturedBody!), {'exam_code': 'JEE-MAIN', 'language': 'en'});
    }));

    test('next returns ScreeningQuestion on 200', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({
              'item_idx': 0,
              'total': 12,
              'stem': 'What is 2+2?',
              'choices': ['3', '4', '5', '6'],
            }),
            200,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final q = await c.next('tok-1');
      expect(q, isA<ScreeningQuestion>());
      expect((q as ScreeningQuestion).stem, 'What is 2+2?');
      expect(q.choices, ['3', '4', '5', '6']);
    });

    test('next returns ScreeningComplete on 409 {code: complete}', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({'detail': {'code': 'complete', 'message': 'done'}}),
            409,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final r = await c.next('tok-1');
      expect(r, isA<ScreeningComplete>());
    });

    test('answer posts {item_idx, answer_idx} and returns on 204', () async {
      Map<String, dynamic>? capturedBody;
      final mock = MockClient((req) async {
        capturedBody = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response('', 204);
      });
      final c = _makeClient(mock);
      await c.answer('tok-1', itemIdx: 0, answerIdx: 2);
      expect(capturedBody, {'item_idx': 0, 'answer_idx': 2});
    });

    test('reveal returns ScreeningReveal payload', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({
              'score_pct': 75.0,
              'correct': 9,
              'total': 12,
              'topic_breakdown': [
                {'topic_id': 't-1', 'correct': 2, 'total': 3},
                {'topic_id': 't-2', 'correct': 1, 'total': 4},
              ],
              'readiness_seed': 0.75,
            }),
            200,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final r = await c.reveal('tok-1');
      expect(r.scorePct, 75.0);
      expect(r.correct, 9);
      expect(r.total, 12);
      expect(r.readinessSeed, 0.75);
      expect(r.topicBreakdown.length, 2);
      expect(r.topicBreakdown.first.topicId, 't-1');
    });

    test('persist hits POST /screening/{token}/persist via auth.apiPost',
        () async {
      String? capturedPath;
      final mock = MockClient((req) async {
        capturedPath = req.url.path;
        return http.Response(
          jsonEncode({'persisted': true, 'attempt_id': 'a-1'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
      final c = _makeClient(mock, auth: auth);
      final r = await c.persist('tok-1');
      expect(r.persisted, true);
      expect(r.attemptId, 'a-1');
      expect(capturedPath, '/api/v1/screening/tok-1/persist');
    });

    test('diagnosticComplete hits POST /profile/me/diagnostic-complete',
        () async {
      String? capturedPath;
      final mock = MockClient((req) async {
        capturedPath = req.url.path;
        return http.Response('', 204);
      });
      final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
      final c = _makeClient(mock, auth: auth);
      await c.diagnosticComplete();
      expect(capturedPath, '/api/v1/profile/me/diagnostic-complete');
    });
  });
}
```

- [ ] **Step 2: Verify test fails**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2c_screening_test.dart
```
Expected: FAIL — `screening_client.dart` doesn't exist.

- [ ] **Step 3: Implement `ScreeningClient`**

Create `apps/mobile/lib/vidya/screening_client.dart`:

```dart
// ScreeningClient — thin wrapper over the /screening/* endpoints.
// start/next/answer/reveal are unauthenticated (server policy — see
// services/learning/src/learning/screening/routes.py). persist +
// diagnosticComplete require auth and go through AuthClient so the
// bearer token is added automatically.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_client.dart';

class ScreeningClient {
  final String baseUrl;
  final http.Client _http;
  final AuthClient _auth;

  ScreeningClient({
    required this.baseUrl,
    required http.Client httpClient,
    required AuthClient auth,
  })  : _http = httpClient,
        _auth = auth;

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<ScreeningStart> start({
    required String examCode,
    String language = 'en',
  }) async {
    final res = await _http.post(
      _uri('/api/v1/screening/start'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'exam_code': examCode, 'language': language}),
    );
    if (res.statusCode == 503) {
      throw ScreeningUnavailable(_decodeMessage(res));
    }
    if (res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ScreeningStart(
      token: json['token'] as String,
      targetCount: json['target_count'] as int,
      examCode: json['exam_code'] as String,
    );
  }

  Future<ScreeningNextResult> next(String token) async {
    final res = await _http.get(_uri('/api/v1/screening/$token/next'));
    if (res.statusCode == 409) {
      final code = _decodeCode(res);
      if (code == 'complete') return ScreeningComplete();
      throw ScreeningException(409, _decodeMessage(res));
    }
    if (res.statusCode == 404) throw ScreeningExpired();
    if (res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ScreeningQuestion(
      itemIdx: json['item_idx'] as int,
      total: json['total'] as int,
      stem: json['stem'] as String,
      choices: (json['choices'] as List<dynamic>).cast<String>(),
    );
  }

  Future<void> answer(
    String token, {
    required int itemIdx,
    required int answerIdx,
  }) async {
    final res = await _http.post(
      _uri('/api/v1/screening/$token/answer'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'item_idx': itemIdx, 'answer_idx': answerIdx}),
    );
    if (res.statusCode == 204) return;
    if (res.statusCode == 404) throw ScreeningExpired();
    throw ScreeningException(res.statusCode, _decodeMessage(res));
  }

  Future<ScreeningReveal> reveal(String token) async {
    final res = await _http.get(_uri('/api/v1/screening/$token/reveal'));
    if (res.statusCode == 404) throw ScreeningExpired();
    if (res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ScreeningReveal(
      scorePct: (json['score_pct'] as num).toDouble(),
      correct: json['correct'] as int,
      total: json['total'] as int,
      readinessSeed: (json['readiness_seed'] as num).toDouble(),
      topicBreakdown: (json['topic_breakdown'] as List<dynamic>)
          .map((e) => TopicBreakdown(
                topicId: (e as Map<String, dynamic>)['topic_id'] as String,
                correct: e['correct'] as int,
                total: e['total'] as int,
              ))
          .toList(growable: false),
    );
  }

  Future<ScreeningPersist> persist(String token) async {
    final res = await _auth.apiPost('/screening/$token/persist', const <String, dynamic>{});
    if (res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ScreeningPersist(
      persisted: json['persisted'] as bool,
      attemptId: json['attempt_id'] as String?,
    );
  }

  Future<void> diagnosticComplete() async {
    final res = await _auth.apiPost(
      '/profile/me/diagnostic-complete',
      const <String, dynamic>{},
    );
    if (res.statusCode != 204 && res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
  }
}

String _decodeMessage(http.Response res) {
  try {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final detail = body['detail'];
    if (detail is Map<String, dynamic>) {
      final msg = detail['message'];
      if (msg is String) return msg;
    }
  } catch (_) {}
  return 'Something went wrong.';
}

String? _decodeCode(http.Response res) {
  try {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final detail = body['detail'];
    if (detail is Map<String, dynamic>) {
      final code = detail['code'];
      if (code is String) return code;
    }
  } catch (_) {}
  return null;
}

class ScreeningStart {
  final String token;
  final int targetCount;
  final String examCode;
  const ScreeningStart({
    required this.token,
    required this.targetCount,
    required this.examCode,
  });
}

sealed class ScreeningNextResult {}

class ScreeningQuestion extends ScreeningNextResult {
  final int itemIdx;
  final int total;
  final String stem;
  final List<String> choices;
  ScreeningQuestion({
    required this.itemIdx,
    required this.total,
    required this.stem,
    required this.choices,
  });
}

class ScreeningComplete extends ScreeningNextResult {}

class TopicBreakdown {
  final String topicId;
  final int correct;
  final int total;
  const TopicBreakdown({
    required this.topicId,
    required this.correct,
    required this.total,
  });
}

class ScreeningReveal {
  final double scorePct;
  final int correct;
  final int total;
  final double readinessSeed;
  final List<TopicBreakdown> topicBreakdown;
  const ScreeningReveal({
    required this.scorePct,
    required this.correct,
    required this.total,
    required this.readinessSeed,
    required this.topicBreakdown,
  });
}

class ScreeningPersist {
  final bool persisted;
  final String? attemptId;
  const ScreeningPersist({required this.persisted, this.attemptId});
}

class ScreeningException implements Exception {
  final int statusCode;
  final String message;
  ScreeningException(this.statusCode, this.message);
  @override
  String toString() => 'ScreeningException($statusCode): $message';
}

class ScreeningExpired extends ScreeningException {
  ScreeningExpired() : super(404, 'Screening session expired.');
}

class ScreeningUnavailable extends ScreeningException {
  ScreeningUnavailable(String msg) : super(503, msg);
}
```

- [ ] **Step 4: Add export to barrel**

In `apps/mobile/lib/vidya/vidya.dart`:
```dart
export 'screening_client.dart';
```

- [ ] **Step 5: Verify pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2c_screening_test.dart
```
Expected: 7 ScreeningClient tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screening_client.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2c_screening_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): ScreeningClient — typed wrapper over /screening/* + diagnostic FSM advance

start/next/answer/reveal are unauthenticated; persist + diagnosticComplete
go through AuthClient. ScreeningNextResult is sealed (Question | Complete)
so the quiz loop is type-checked.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `VidyaScreeningIntroScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_screening_intro_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2c_screening_test.dart` (append group + `_harness` helper)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append failing test**

Add to the top of `phase_2c_screening_test.dart` (before `void main()` if not already there):

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_screening_intro_screen.dart';
```

If `_harness` helper isn't already in the file (it isn't — Task 1 only added unit tests), add it before `void main()`:

```dart
Widget _harness({
  required Widget child,
  Brightness brightness = Brightness.light,
  VidyaPersona persona = VidyaPersona.aspirant,
  VidyaDensity density = VidyaDensity.regular,
}) {
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: brightness,
      persona: persona,
      density: density,
    ),
    home: child,
  );
}
```

Append this group inside `main()`:

```dart
  group('VidyaScreeningIntroScreen', () {
    testWidgets('renders title + Start CTA + Skip', (tester) async {
      await tester.pumpWidget(_harness(
        child: VidyaScreeningIntroScreen(
          onStart: () {},
          onSkip: () {},
        ),
      ));
      expect(find.byKey(const Key('vidya.screening.intro.start')), findsOneWidget);
      expect(find.text('Skip for now'), findsOneWidget);
      expect(find.textContaining('calibrate'), findsOneWidget);
    });

    testWidgets('Start fires onStart', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningIntroScreen(
          onStart: () => taps++,
          onSkip: () {},
        ),
      ));
      await tester.tap(find.byKey(const Key('vidya.screening.intro.start')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Skip fires onSkip', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningIntroScreen(
          onStart: () {},
          onSkip: () => taps++,
        ),
      ));
      await tester.tap(find.text('Skip for now'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });
```

- [ ] **Step 2: Verify test fails**

Expected: FAIL — `vidya_screening_intro_screen.dart` not found.

- [ ] **Step 3: Implement `VidyaScreeningIntroScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_screening_intro_screen.dart`:

```dart
// VidyaScreeningIntroScreen — pre-quiz framing.
// First-time users see this after exam-select but before being dropped
// into MainScaffold. Start kicks off the 12-item adaptive screening;
// Skip bypasses it locally (the user can re-take it from Settings).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaScreeningIntroScreen extends StatelessWidget {
  final VoidCallback onStart;
  final VoidCallback onSkip;

  const VidyaScreeningIntroScreen({
    super.key,
    required this.onStart,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 32),
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(Icons.compass_calibration_outlined,
                        color: accent, size: 32),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    "Let's calibrate to your level",
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 30,
                      fontWeight: FontWeight.w500,
                      color: ink,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'A quick 12-question check-in so every practice session '
                    'is dialled to your actual level — not too easy, not '
                    'too hard.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      color: muted,
                      height: 1.55,
                    ),
                  ),
                  const SizedBox(height: 32),
                  _Tip(
                    icon: Icons.timer_outlined,
                    text: 'Takes ~5 minutes',
                  ),
                  const SizedBox(height: 12),
                  _Tip(
                    icon: Icons.lightbulb_outline,
                    text: 'Adaptive — gets easier or harder as you go',
                  ),
                  const SizedBox(height: 12),
                  _Tip(
                    icon: Icons.bar_chart,
                    text: 'Seeds your readiness score',
                  ),
                  const Spacer(),
                  VidyaButton(
                    key: const Key('vidya.screening.intro.start'),
                    label: 'Start diagnostic',
                    onPressed: onStart,
                    size: VidyaButtonSize.lg,
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      onPressed: onSkip,
                      child: const Text('Skip for now'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _Tip extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Tip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final muted = theme.ink3;
    final accent = theme.accent;
    return Row(children: [
      Icon(icon, color: accent, size: 20),
      const SizedBox(width: 12),
      Expanded(
        child: Text(
          text,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 14,
            color: muted,
          ),
        ),
      ),
    ]);
  }
}
```

- [ ] **Step 4: Add export**

```dart
export 'screens/vidya_screening_intro_screen.dart';
```

- [ ] **Step 5: Verify pass**

Expected: 7 client + 3 intro = 10 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_screening_intro_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2c_screening_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaScreeningIntroScreen — pre-diagnostic framing

3 tips (time, adaptive, seeds readiness) + Start + Skip. Skip bypasses
the diagnostic locally; the user can run it later from Settings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `VidyaScreeningQuizScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_screening_quiz_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2c_screening_test.dart` (append group + import)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append failing test**

Import:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_screening_quiz_screen.dart';
```

Helper before main (if not already present):

```dart
ScreeningClient _fakeClientFor(List<http.Response> Function(int callIdx) plan) {
  var idx = 0;
  final mock = MockClient((req) async {
    final res = plan(idx);
    idx++;
    return res[0];
  });
  return ScreeningClient(
    baseUrl: 'http://test',
    httpClient: mock,
    auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
  );
}
```

(Actually simpler — use direct MockClient per test, see below.)

Append group:

```dart
  group('VidyaScreeningQuizScreen', () {
    testWidgets('renders first question after start', (tester) async {
      var callIdx = 0;
      final mock = MockClient((req) async {
        callIdx++;
        if (req.url.path.endsWith('/screening/start')) {
          return http.Response(
            jsonEncode({'token': 'tok-1', 'target_count': 2, 'exam_code': 'JEE-MAIN'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (req.url.path.endsWith('/next')) {
          return http.Response(
            jsonEncode({
              'item_idx': 0,
              'total': 2,
              'stem': 'What is 2+2?',
              'choices': ['3', '4', '5', '6'],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      await tester.pumpWidget(_harness(
        child: VidyaScreeningQuizScreen(
          client: client,
          examCode: 'JEE-MAIN',
          onCompleted: (_) {},
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('What is 2+2?'), findsOneWidget);
      expect(find.text('4'), findsOneWidget);
      expect(find.text('Question 1 of 2'), findsOneWidget);
    });

    testWidgets('selecting a choice + tapping Submit advances to next',
        (tester) async {
      final stems = ['Q1?', 'Q2?'];
      var nextCalls = 0;
      var answerCalls = 0;
      final mock = MockClient((req) async {
        final path = req.url.path;
        if (path.endsWith('/screening/start')) {
          return http.Response(
            jsonEncode({'token': 'tok-1', 'target_count': 2, 'exam_code': 'JEE-MAIN'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (path.endsWith('/next')) {
          final idx = nextCalls;
          nextCalls++;
          if (idx >= stems.length) {
            return http.Response(
              jsonEncode({'detail': {'code': 'complete', 'message': 'done'}}),
              409,
            );
          }
          return http.Response(
            jsonEncode({
              'item_idx': idx,
              'total': stems.length,
              'stem': stems[idx],
              'choices': ['A', 'B', 'C', 'D'],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (path.endsWith('/answer')) {
          answerCalls++;
          return http.Response('', 204);
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      await tester.pumpWidget(_harness(
        child: VidyaScreeningQuizScreen(
          client: client,
          examCode: 'JEE-MAIN',
          onCompleted: (_) {},
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      // Q1 visible
      expect(find.text('Q1?'), findsOneWidget);
      // Pick choice "B" (index 1) by finding its text inside a VidyaCard
      await tester.tap(find.text('B'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.screening.quiz.submit')));
      await tester.pumpAndSettle();
      // Q2 visible
      expect(find.text('Q2?'), findsOneWidget);
      expect(answerCalls, 1);
    });

    testWidgets('when next returns complete, fires onCompleted(token)',
        (tester) async {
      var nextCalls = 0;
      final mock = MockClient((req) async {
        final path = req.url.path;
        if (path.endsWith('/screening/start')) {
          return http.Response(
            jsonEncode({'token': 'tok-final', 'target_count': 1, 'exam_code': 'JEE-MAIN'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (path.endsWith('/next')) {
          final idx = nextCalls;
          nextCalls++;
          if (idx == 0) {
            return http.Response(
              jsonEncode({
                'item_idx': 0, 'total': 1, 'stem': 'Q?', 'choices': ['A', 'B', 'C', 'D'],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response(
            jsonEncode({'detail': {'code': 'complete', 'message': 'done'}}),
            409,
          );
        }
        if (path.endsWith('/answer')) return http.Response('', 204);
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      String? capturedToken;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningQuizScreen(
          client: client,
          examCode: 'JEE-MAIN',
          onCompleted: (t) => capturedToken = t,
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('A'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.screening.quiz.submit')));
      await tester.pumpAndSettle();
      expect(capturedToken, 'tok-final');
    });

    testWidgets('503 unavailable surfaces banner with Skip CTA',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/screening/start')) {
          return http.Response(
            jsonEncode({
              'detail': {
                'code': 'screening_unavailable',
                'message': 'Not enough published questions to seed a screening test for this exam yet.',
              }
            }),
            503,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      var backTaps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningQuizScreen(
          client: client,
          examCode: 'JEE-MAIN',
          onCompleted: (_) {},
          onBack: () => backTaps++,
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('Not enough published questions'), findsOneWidget);
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();
      expect(backTaps, 1);
    });
  });
```

Add at the top of the test file if not present:
```dart
import 'package:adaptive_learning_mobile/vidya/screening_client.dart';
```

- [ ] **Step 2: Verify test fails**

- [ ] **Step 3: Implement `VidyaScreeningQuizScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_screening_quiz_screen.dart`:

```dart
// VidyaScreeningQuizScreen — runs the adaptive screening loop.
// Calls ScreeningClient.start on init, then loops next → answer until
// ScreeningComplete arrives, at which point it surfaces the token to
// the parent via onCompleted. Errors surface in a VidyaBanner with a
// Skip-only escape hatch.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../screening_client.dart';

class VidyaScreeningQuizScreen extends StatefulWidget {
  final ScreeningClient client;
  final String examCode;
  final void Function(String token) onCompleted;
  final VoidCallback onBack;

  const VidyaScreeningQuizScreen({
    super.key,
    required this.client,
    required this.examCode,
    required this.onCompleted,
    required this.onBack,
  });

  @override
  State<VidyaScreeningQuizScreen> createState() =>
      _VidyaScreeningQuizScreenState();
}

class _VidyaScreeningQuizScreenState extends State<VidyaScreeningQuizScreen> {
  String? _token;
  ScreeningQuestion? _question;
  int? _selectedIdx;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      final start = await widget.client.start(examCode: widget.examCode);
      _token = start.token;
      await _fetchNext();
    } on ScreeningUnavailable catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = "We couldn't start the diagnostic.");
    }
  }

  Future<void> _fetchNext() async {
    final result = await widget.client.next(_token!);
    if (!mounted) return;
    if (result is ScreeningComplete) {
      widget.onCompleted(_token!);
      return;
    }
    setState(() {
      _question = result as ScreeningQuestion;
      _selectedIdx = null;
    });
  }

  Future<void> _submit() async {
    if (_selectedIdx == null || _submitting || _question == null) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.client.answer(
        _token!,
        itemIdx: _question!.itemIdx,
        answerIdx: _selectedIdx!,
      );
      await _fetchNext();
    } catch (_) {
      if (mounted) setState(() => _error = "We couldn't record that answer.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    if (_error != null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          leading: IconButton(
            icon: Icon(Icons.arrow_back, color: ink),
            onPressed: widget.onBack,
          ),
        ),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
              const Spacer(),
              VidyaButton(
                label: 'Skip',
                onPressed: widget.onBack,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      );
    }

    if (_question == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final q = _question!;
    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Question ${q.itemIdx + 1} of ${q.total}',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 12,
                color: muted,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 8),
            // Progress bar — accent fills to (itemIdx / total)
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: (q.itemIdx + 1) / q.total,
                minHeight: 4,
                backgroundColor: muted.withValues(alpha: 0.2),
                valueColor: AlwaysStoppedAnimation<Color>(accent),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              q.stem,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: ink,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: ListView.separated(
                itemCount: q.choices.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (ctx, i) {
                  final selected = _selectedIdx == i;
                  return VidyaCard(
                    onTap: _submitting ? null : () => setState(() => _selectedIdx = i),
                    tone: selected ? VidyaCardTone.accent : VidyaCardTone.defaultTone,
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Row(
                        children: [
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: selected
                                  ? accent
                                  : muted.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              String.fromCharCode(65 + i), // A, B, C, D
                              style: TextStyle(
                                fontFamily: VidyaFonts.ui,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: selected ? Colors.white : ink,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              q.choices[i],
                              style: TextStyle(
                                fontFamily: VidyaFonts.ui,
                                fontSize: 15,
                                color: ink,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              key: const Key('vidya.screening.quiz.submit'),
              label: _submitting ? 'Saving…' : 'Submit',
              onPressed: _selectedIdx == null || _submitting ? null : _submit,
              disabled: _selectedIdx == null || _submitting,
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Add export**

```dart
export 'screens/vidya_screening_quiz_screen.dart';
```

- [ ] **Step 5: Verify pass**

Expected: 10 prior + 4 quiz = 14 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_screening_quiz_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2c_screening_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaScreeningQuizScreen — adaptive question loop

Calls start on init, loops next/answer until ScreeningComplete arrives.
Progress bar + lettered option cards (A-D). 503 unavailable surfaces a
banner with Skip; runtime errors retry-friendly via the same banner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `VidyaScreeningResultScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_screening_result_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2c_screening_test.dart` (append group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append failing test**

Import:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_screening_result_screen.dart';
```

Group:

```dart
  group('VidyaScreeningResultScreen', () {
    testWidgets('renders score + topic breakdown after reveal',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 75.0,
              'correct': 9,
              'total': 12,
              'topic_breakdown': [
                {'topic_id': 't-mech', 'correct': 1, 'total': 4},
                {'topic_id': 't-thermo', 'correct': 3, 'total': 4},
                {'topic_id': 't-calc', 'correct': 5, 'total': 4},
              ],
              'readiness_seed': 0.75,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      await tester.pumpWidget(_harness(
        child: VidyaScreeningResultScreen(
          client: client,
          token: 'tok-1',
          onCompleted: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('75%'), findsOneWidget);
      expect(find.textContaining('9 of 12'), findsOneWidget);
    });

    testWidgets('Save & continue calls persist + diagnosticComplete + onCompleted',
        (tester) async {
      var persistCalled = false;
      var fsmCalled = false;
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 50.0,
              'correct': 6,
              'total': 12,
              'topic_breakdown': [],
              'readiness_seed': 0.5,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (req.url.path.endsWith('/persist')) {
          persistCalled = true;
          return http.Response(
            jsonEncode({'persisted': true, 'attempt_id': 'a-1'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (req.url.path.endsWith('/diagnostic-complete')) {
          fsmCalled = true;
          return http.Response('', 204);
        }
        return http.Response('{}', 404);
      });
      final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: auth,
      );
      var done = 0;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningResultScreen(
          client: client,
          token: 'tok-1',
          onCompleted: () => done++,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vidya.screening.result.continue')));
      await tester.pumpAndSettle();
      expect(persistCalled, true);
      expect(fsmCalled, true);
      expect(done, 1);
    });

    testWidgets('reveal failure surfaces banner', (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response('{}', 500);
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      await tester.pumpWidget(_harness(
        child: VidyaScreeningResultScreen(
          client: client,
          token: 'tok-1',
          onCompleted: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Verify test fails**

- [ ] **Step 3: Implement `VidyaScreeningResultScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_screening_result_screen.dart`:

```dart
// VidyaScreeningResultScreen — reveal + persist gate.
// Calls reveal on init to show the score; on "Save & continue", calls
// persist + diagnosticComplete (FSM advance) then onCompleted (parent
// routes to home). Errors at either stage surface in a banner.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../screening_client.dart';

class VidyaScreeningResultScreen extends StatefulWidget {
  final ScreeningClient client;
  final String token;
  final VoidCallback onCompleted;

  const VidyaScreeningResultScreen({
    super.key,
    required this.client,
    required this.token,
    required this.onCompleted,
  });

  @override
  State<VidyaScreeningResultScreen> createState() =>
      _VidyaScreeningResultScreenState();
}

class _VidyaScreeningResultScreenState
    extends State<VidyaScreeningResultScreen> {
  ScreeningReveal? _reveal;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await widget.client.reveal(widget.token);
      if (mounted) setState(() => _reveal = r);
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't load your result. Try again later.");
      }
    }
  }

  Future<void> _saveAndContinue() async {
    if (_saving) return;
    setState(() {
      _error = null;
      _saving = true;
    });
    try {
      await widget.client.persist(widget.token);
      await widget.client.diagnosticComplete();
      widget.onCompleted();
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't save your result. Try again.");
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    if (_error != null && _reveal == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
          ),
        ),
      );
    }

    if (_reveal == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final r = _reveal!;
    // Weakest 3 — sort topics by accuracy ascending.
    final weakest = [...r.topicBreakdown]..sort((a, b) {
        final aR = a.total == 0 ? 0.0 : a.correct / a.total;
        final bR = b.total == 0 ? 0.0 : b.correct / b.total;
        return aR.compareTo(bR);
      });
    final top3 = weakest.take(3).toList();

    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 16),
                  Text(
                    'Calibrated!',
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 28,
                      fontWeight: FontWeight.w500,
                      color: ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Your starting readiness is set.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 14,
                      color: muted,
                    ),
                  ),
                  const SizedBox(height: 24),
                  VidyaCard(
                    tone: VidyaCardTone.accent,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Column(
                        children: [
                          Text(
                            '${r.scorePct.toStringAsFixed(0)}%',
                            style: TextStyle(
                              fontFamily: VidyaFonts.display,
                              fontSize: 56,
                              fontWeight: FontWeight.w600,
                              color: accent,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${r.correct} of ${r.total} correct',
                            style: TextStyle(
                              fontFamily: VidyaFonts.ui,
                              fontSize: 14,
                              color: muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (top3.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    Text(
                      'Focus areas',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: muted,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final t in top3) ...[
                      _TopicRow(topic: t),
                      const SizedBox(height: 8),
                    ],
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                  ],
                  const Spacer(),
                  VidyaButton(
                    key: const Key('vidya.screening.result.continue'),
                    label: _saving ? 'Saving…' : 'Save & continue',
                    onPressed: _saving ? null : _saveAndContinue,
                    disabled: _saving,
                    size: VidyaButtonSize.lg,
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _TopicRow extends StatelessWidget {
  final TopicBreakdown topic;
  const _TopicRow({required this.topic});

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accuracy = topic.total == 0 ? 0.0 : topic.correct / topic.total;
    final pct = (accuracy * 100).toStringAsFixed(0);
    return Row(children: [
      Expanded(
        child: Text(
          topic.topicId,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 14,
            color: ink,
          ),
        ),
      ),
      Text(
        '$pct% (${topic.correct}/${topic.total})',
        style: TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 13,
          color: muted,
        ),
      ),
    ]);
  }
}
```

- [ ] **Step 4: Add export**

```dart
export 'screens/vidya_screening_result_screen.dart';
```

- [ ] **Step 5: Verify pass**

Expected: 14 prior + 3 result = 17 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_screening_result_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2c_screening_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaScreeningResultScreen — reveal + persist + FSM advance

Big percentage card + top-3 weakest topics. Save & continue calls
/screening/{token}/persist + /profile/me/diagnostic-complete then
hands off to onCompleted (parent routes to home).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire `VidyaRootApp` state machine for screening

**Files:**
- Modify: `apps/mobile/lib/vidya/vidya_root_app.dart` (+3 states + screening client + skip flag)
- Modify: `apps/mobile/test/vidya/vidya_root_app_test.dart` (append 2 transition tests)

**State machine after this task (16 states):**

```
… (existing 13) …
examSelect → onContinue → screeningIntro
screeningIntro → Start → screeningQuiz
screeningIntro → Skip → mark vidya.screening_skipped → home
screeningQuiz → onCompleted(token) → screeningResult(token)
screeningQuiz → onBack → home (skip via error path)
screeningResult → onCompleted → mark vidya.screening_done → home

home stays the terminal state.
```

Routing on cold start (after auth + bootstrap):
- If `auth.isAuthenticated` AND `onboardingState == 'ONBOARDED'` → home (no change)
- Else if `auth.isAuthenticated` AND `vidya.screening_done == 'true'` → examSelect → home path (no screening shown again)
- Else if `auth.isAuthenticated` AND `vidya.screening_skipped == 'true'` → examSelect → home path (don't re-prompt)
- Else if `auth.isAuthenticated` → examSelect → screeningIntro → … → home

- [ ] **Step 1: Append failing test**

Open `apps/mobile/test/vidya/vidya_root_app_test.dart`. Append 2 tests after the existing ones:

```dart
  testWidgets(
      'authenticated user (not ONBOARDED, no screening done) routes examSelect → screeningIntro on Continue',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'alp.auth.tokens':
          '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
    });
    final mock = MockClient((req) async {
      if (req.url.path.endsWith('/catalog/exams')) {
        return http.Response(
          '[{"id":"a-1","code":"NEET","name":"NEET UG"}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path.endsWith('/profile/exams')) {
        return http.Response('{}', 200);
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
    await tester.pumpWidget(VidyaRootApp(auth: auth));
    await tester.pumpAndSettle();
    // examSelect should be visible
    expect(find.text('NEET UG'), findsOneWidget);
    await tester.tap(find.text('NEET UG'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.textContaining('calibrate'), findsOneWidget);
  });

  testWidgets(
      'screening_done == true skips screening — examSelect Continue routes straight to home',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'alp.auth.tokens':
          '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
      'vidya.screening_done': 'true',
    });
    final mock = MockClient((req) async {
      if (req.url.path.endsWith('/catalog/exams')) {
        return http.Response(
          '[{"id":"a-1","code":"NEET","name":"NEET UG"}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path.endsWith('/profile/exams')) {
        return http.Response('{}', 200);
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
    await tester.pumpWidget(VidyaRootApp(auth: auth));
    await tester.pumpAndSettle();
    await tester.tap(find.text('NEET UG'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    // home renders MainScaffold which mounts InboxBellButton's 60s timer —
    // use explicit pump instead of pumpAndSettle (T6 pattern).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    // Diagnostic intro NOT visible
    expect(find.textContaining('calibrate'), findsNothing);
  });
```

Also ensure the imports at the top of `vidya_root_app_test.dart` include the screening intro import — should already be transitively wired via the export barrel; if not:
```dart
// (no new import needed — text matching on 'calibrate' is sufficient)
```

- [ ] **Step 2: Verify test fails**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/vidya_root_app_test.dart
```
Expected: FAIL — examSelect Continue currently routes to `home`, not `screeningIntro`.

- [ ] **Step 3: Extend `VidyaRootApp`**

Open `apps/mobile/lib/vidya/vidya_root_app.dart`. Apply these targeted changes (don't rewrite the whole file — preserve T6's structure):

1. Add new imports:
   ```dart
   import 'screening_client.dart';
   import 'screens/vidya_screening_intro_screen.dart';
   import 'screens/vidya_screening_quiz_screen.dart';
   import 'screens/vidya_screening_result_screen.dart';
   ```
   And the http import (if not present):
   ```dart
   import 'package:http/http.dart' as http;
   ```

2. Extend the `_VidyaScreen` enum — add 3 cases between `examSelect` and `home`:
   ```dart
   enum _VidyaScreen {
     splash,
     welcome,
     card1, card2, card3,
     login, register, verifyOtp, forgotPassword, newPassword,
     examSelect,
     screeningIntro,
     screeningQuiz,
     screeningResult,
     home,
   }
   ```

3. Add new state fields in `_VidyaRootAppState`:
   ```dart
   static const _screeningDoneKey = 'vidya.screening_done';
   static const _screeningSkippedKey = 'vidya.screening_skipped';

   String? _screeningToken;
   String? _selectedExamCode; // captured from examSelect for screening start
   late final ScreeningClient _screeningClient = ScreeningClient(
     baseUrl: widget.auth.baseUrl,
     httpClient: http.Client(),
     auth: widget.auth,
   );
   ```

4. Modify `_VidyaScreen.examSelect` case in `_currentScreen()`. The current code calls `_markOnboardingDone` + routes to `home`. Replace `onContinue` to:
   - Read `vidya.screening_done` and `vidya.screening_skipped` from secure storage
   - If either is `'true'`, route to `home` (mark onboarding_done as before)
   - Otherwise, route to `screeningIntro`
   
   You'll likely need to make this an async callback. Adapt accordingly:
   ```dart
   case _VidyaScreen.examSelect:
     return VidyaExamSelectScreen(
       auth: widget.auth,
       onContinue: () async {
         await _markOnboardingDone();
         final done = await _storage.read(key: _screeningDoneKey);
         final skipped = await _storage.read(key: _screeningSkippedKey);
         if (!mounted) return;
         setState(() {
           _screen = (done == 'true' || skipped == 'true')
               ? _VidyaScreen.home
               : _VidyaScreen.screeningIntro;
         });
         // VidyaExamSelectScreen already captured the chosen exam code
         // in its own state; we need it here for screening start. Read
         // it back from storage (T6 has VidyaExamSelectScreen writing
         // 'vidya.selected_exam_code').
         final code = await _storage.read(key: 'vidya.selected_exam_code');
         if (mounted) setState(() => _selectedExamCode = code);
       },
       onBack: () => setState(() => _screen = _VidyaScreen.welcome),
     );
   ```

5. Add cases for the 3 new states:
   ```dart
   case _VidyaScreen.screeningIntro:
     return VidyaScreeningIntroScreen(
       onStart: () => setState(() => _screen = _VidyaScreen.screeningQuiz),
       onSkip: () async {
         await _storage.write(key: _screeningSkippedKey, value: 'true');
         if (mounted) setState(() => _screen = _VidyaScreen.home);
       },
     );
   case _VidyaScreen.screeningQuiz:
     return VidyaScreeningQuizScreen(
       client: _screeningClient,
       examCode: _selectedExamCode ?? 'JEE-MAIN',
       onCompleted: (token) => setState(() {
         _screeningToken = token;
         _screen = _VidyaScreen.screeningResult;
       }),
       onBack: () async {
         await _storage.write(key: _screeningSkippedKey, value: 'true');
         if (mounted) setState(() => _screen = _VidyaScreen.home);
       },
     );
   case _VidyaScreen.screeningResult:
     return VidyaScreeningResultScreen(
       client: _screeningClient,
       token: _screeningToken ?? '',
       onCompleted: () async {
         await _storage.write(key: _screeningDoneKey, value: 'true');
         if (mounted) setState(() => _screen = _VidyaScreen.home);
       },
     );
   ```

6. The `_onSignedIn(session)` callback currently routes to either `home` or `examSelect`. No change — the screening gate happens at `examSelect.onContinue`.

- [ ] **Step 4: Verify pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/vidya_root_app_test.dart
```
Expected: 6 prior + 2 new = 8 PASS.

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test
```
Expected: 328 prior + 17 (Task 1–4) + 2 (root app extension) = 347 PASS.

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter analyze 2>&1 | tail -5
```
Expected: no new errors in vidya_root_app.dart.

- [ ] **Step 5: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/vidya_root_app.dart apps/mobile/test/vidya/vidya_root_app_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): wire screening flow into VidyaRootApp (16-state machine)

examSelect Continue now routes through screeningIntro → screeningQuiz →
screeningResult → home for first-time users. vidya.screening_done +
vidya.screening_skipped flags let returning users skip the diagnostic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Manual smoke + acceptance gate

Verification-only — no code changes.

- [ ] **Step 1: Run automated suite**

```bash
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter analyze
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter analyze
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter build apk --debug
```

All four must exit 0 with no new errors.

- [ ] **Step 2: Manual smoke on device**

```bash
adb install -r apps/mobile/build/app/outputs/flutter-apk/app-debug.apk
```

Walk this checklist on a freshly-installed device (wipe data first):

1. Register a brand-new user → verify OTP → examSelect → pick NEET → Continue.
2. **Diagnostic intro renders** (compass icon + "Let's calibrate" + 3 tips + Start + Skip).
3. Tap Start → first question renders with "Question 1 of 12" + 4 A-D option cards.
4. Pick a choice → Submit → next question advances; counter updates.
5. Cycle through all 12 → result screen renders with big % + correct/total + Focus areas list.
6. Tap "Save & continue" → MainScaffold renders.
7. Sign out → sign back in → **straight to MainScaffold** (no diagnostic re-prompt — `vidya.screening_done` is set).
8. Wipe data, register a new user → reach diagnostic intro → tap "Skip for now" → MainScaffold renders. Sign out → sign back in → straight to MainScaffold (`vidya.screening_skipped` is set).
9. Wipe data, register a new user with an exam that has < 4 published questions (use a test exam) → tap Start → 503 banner "Not enough published questions…" + Skip button → tap Skip → MainScaffold.

Record pass/fail next to each.

- [ ] **Step 3: Final commit (optional)**

If the 2a design spec needs status updates:

```bash
git add docs/superpowers/specs/2026-05-18-vidya-flutter-phase-2a-design.md
git commit -m "docs(vidya): mark Phase 2c items shipped"
```

Then invoke the finishing-a-development-branch skill.

---

## Self-Review Notes

**Spec coverage check:**
- 07 guest-screening intro — Task 2 (`VidyaScreeningIntroScreen`) — note: shipped as authed-user intro, NOT guest. Guest flow deferred — needs persist-with-token-handoff after auth, separate scope.
- 08 diagnostic Theme-wrap reuse — Task 3 (`VidyaScreeningQuizScreen`) — built as new Vidya-themed quiz UI hitting the existing `/screening/*` backend, NOT a literal wrap of Aurora's `QuizScreen`. The spec language "Theme-wrap reuse" was ambiguous; this delivers the same outcome (one diagnostic surface used by both flows) without leaking Aurora chrome.
- 09 screening result — Task 4 (`VidyaScreeningResultScreen`) ✓

**Type consistency:**
- `ScreeningClient` methods return typed records; `ScreeningNextResult` is sealed (Question | Complete).
- `_VidyaScreen` enum extension preserves existing ordering; new states wedge between `examSelect` and `home`.
- Storage keys: `vidya.screening_done`, `vidya.screening_skipped`, `vidya.selected_exam_code` (last is already written by `VidyaExamSelectScreen` per Phase 2a T6).

**Potential gotchas:**
- `_screeningClient` is a `late final` field. Constructed once per `_VidyaRootAppState` instance. The `http.Client()` it owns is never closed — acceptable for an app-lifetime state but flag if you add a dispose-aware test.
- Task 5 reads `vidya.selected_exam_code` to seed screening's `examCode`. If `VidyaExamSelectScreen` hasn't run (e.g., user reaches screening via a different path in the future), the fallback `'JEE-MAIN'` matches the backend default.
- `MainScaffold`'s `InboxBellButton` 60s timer still requires `pump() + pump(100ms)` instead of `pumpAndSettle()` for tests that reach `home`. The Task 5 "screening_done skips" test uses this pattern.

**Deferred:**
- **Guest screening** (running the diagnostic before auth, then carrying the token through register → persist after verify). Needs token-handoff plumbing across the welcome → register flow.
- **"Re-take diagnostic" entry in Settings**. After Skip, the user has no in-app path back. Acceptable for 2c since the user can clear app data.
- **i18n** — copy is English-only. Hindi will follow when the existing Hindi seed pipeline is wired into Vidya.
