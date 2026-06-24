// VidyaPracticeScreen — Phase 3c.full v3.v1 (Quick + Focused + Mock).
//
// All three practice-mode cards now wire to the full session loop:
//   - Quick   → VidyaPracticeSessionScreen (10 random questions)
//   - Focused → VidyaFocusedIntroScreen → VidyaPracticeSessionScreen
//                 (10 questions from the user's weakest concept)
//   - Mock    → VidyaMockIntroScreen → VidyaMockSessionScreen
//                 (full-length timed blueprint mock)
//
// Focused branches through VidyaFocusedIntroScreen first so the user
// sees the resolved topic name + EWA before committing; the intro
// screen hands back the topicId via onStart and we pushReplacement
// into the session screen so back-from-Result lands on the Practice
// landing (not on the intro).
//
// Mock additionally guards on `auth.user?.examId` before navigating;
// when null we show an onboarding-nudge snackbar instead of a broken
// flow. Quick/Focused don't need the guard because they don't need
// the user's exam (Quick uses a seeded topic, Focused uses analytics).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../insights/insights_client.dart';
import '../../quiz/quiz_client.dart';
import '../state/active_exam_notifier.dart';
import 'vidya_focused_intro_screen.dart';
import 'vidya_mocks_screen.dart';
import 'vidya_practice_result_screen.dart';
import 'vidya_practice_session_screen.dart';
import 'vidya_pyq_screen.dart';
import 'vidya_test_builder_screen.dart';

/// Stable identifier for each practice mode, decoupled from the
/// user-visible `title`. Lets a copy or i18n change touch the
/// `_modes` literal without silently re-routing dispatch.
enum _PracticeModeKind { quick, focused, mistakes, pyq, mock, build }

class VidyaPracticeScreen extends StatelessWidget {
  final QuizClient client;
  final InsightsClient insights;
  const VidyaPracticeScreen({
    super.key,
    required this.client,
    required this.insights,
  });

  // Seeded Mechanics topic — same UUID Aurora's PracticeTab passes for
  // its Adaptive Practice card. Quick Practice in v1 reuses it as a
  // sensible random-syllabus stand-in. v2 will source this from the
  // user's active subject/topic; the constant lives here (private)
  // until that wiring lands.
  static const _seededQuickTopic = '33333333-0000-0000-0000-000000000001';

  static const _modes = <_Mode>[
    _Mode(
      kind: _PracticeModeKind.quick,
      eyebrow: 'QUICK • 10 mins',
      title: 'Quick Practice',
      body: 'Random questions from your active syllabus.',
    ),
    _Mode(
      kind: _PracticeModeKind.focused,
      eyebrow: 'FOCUSED • 20 mins',
      title: 'Focused Practice',
      body: "Drill the topics you've struggled with recently.",
    ),
    _Mode(
      kind: _PracticeModeKind.mistakes,
      eyebrow: 'MISTAKES • 10 mins',
      title: 'Mistakes Drill',
      body: 'Re-attempt the questions you recently got wrong.',
    ),
    _Mode(
      kind: _PracticeModeKind.pyq,
      eyebrow: 'PYQ • Browse',
      title: 'Previous-Year Qs',
      body: 'Browse real questions from past exam papers by chapter.',
    ),
    _Mode(
      kind: _PracticeModeKind.mock,
      eyebrow: 'MOCK • 3 hrs',
      title: 'Mock Test',
      body: 'Full-length test under timed exam conditions.',
    ),
    _Mode(
      kind: _PracticeModeKind.build,
      eyebrow: 'BUILD • Custom',
      title: 'Build a Test',
      body: 'Pick a topic, difficulty, and length — then start.',
    ),
  ];

  void _onModeTap(BuildContext context, _Mode m) {
    switch (m.kind) {
      case _PracticeModeKind.quick:
        final userId = client.auth.user?.id ?? '';
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => VidyaPracticeSessionScreen(
            client: client,
            mode: QuizSessionMode.practice,
            questionCount: 10,
            topicId: _seededQuickTopic,
            userId: userId,
            onCompleted: (sessionId) {
              Navigator.of(context).pushReplacement(MaterialPageRoute(
                builder: (_) => VidyaPracticeResultScreen(
                  client: client,
                  sessionId: sessionId,
                  onDone: () => Navigator.of(context).pop(),
                ),
              ));
            },
            onBack: () => Navigator.of(context).pop(),
          ),
        ));
      case _PracticeModeKind.focused:
        final userId = client.auth.user?.id ?? '';
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => VidyaFocusedIntroScreen(
            client: client,
            insights: insights,
            userId: userId,
            onStart: (topicId, _) {
              Navigator.of(context).pushReplacement(MaterialPageRoute(
                builder: (_) => VidyaPracticeSessionScreen(
                  client: client,
                  mode: QuizSessionMode.practice,
                  questionCount: 10,
                  topicId: topicId,
                  userId: userId,
                  onCompleted: (sessionId) {
                    Navigator.of(context).pushReplacement(MaterialPageRoute(
                      builder: (_) => VidyaPracticeResultScreen(
                        client: client,
                        sessionId: sessionId,
                        onDone: () => Navigator.of(context).pop(),
                      ),
                    ));
                  },
                  onBack: () => Navigator.of(context).pop(),
                ),
              ));
            },
            onBack: () => Navigator.of(context).pop(),
          ),
        ));
      case _PracticeModeKind.mistakes:
        final userId = client.auth.user?.id ?? '';
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => VidyaPracticeSessionScreen(
            client: client,
            mode: QuizSessionMode.mistakes,
            questionCount: 10,
            // topicId is unused for mistake-replay (server pulls the
            // user's recent wrong answers); pass empty to satisfy the API.
            topicId: '',
            userId: userId,
            onCompleted: (sessionId) {
              Navigator.of(context).pushReplacement(MaterialPageRoute(
                builder: (_) => VidyaPracticeResultScreen(
                  client: client,
                  sessionId: sessionId,
                  onDone: () => Navigator.of(context).pop(),
                ),
              ));
            },
            onBack: () => Navigator.of(context).pop(),
          ),
        ));
      case _PracticeModeKind.pyq:
        final user = client.auth.user;
        // Scope to the app-wide active exam (not the stale single-exam
        // user.examId), so PYQ follows the exam the student switched to.
        final examId = VidyaActiveExam.of(context)?.activeExamId;
        if (user == null || examId == null || examId.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Pick your exam in onboarding to browse previous-year questions.',
              ),
            ),
          );
          return;
        }
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => VidyaPyqScreen(auth: client.auth, examId: examId),
        ));
      case _PracticeModeKind.mock:
        final user = client.auth.user;
        final exam = VidyaActiveExam.of(context)?.active;
        if (user == null || exam == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Pick your exam in onboarding to unlock mock tests.',
              ),
            ),
          );
          return;
        }
        // Open the mocks catalog (choose a blueprint / review attempts)
        // rather than auto-launching the first blueprint.
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => VidyaMocksScreen(
            auth: client.auth,
            examId: exam.examId,
            examName: exam.name,
          ),
        ));
      case _PracticeModeKind.build:
        final user = client.auth.user;
        final exam = VidyaActiveExam.of(context)?.active;
        if (user == null || exam == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Pick your exam in onboarding to build a test.'),
            ),
          );
          return;
        }
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => VidyaTestBuilderScreen(
            auth: client.auth,
            examId: exam.examId,
            examName: exam.name,
          ),
        ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    // SingleChildScrollView (not ListView) so every mode card builds
    // eagerly — adding the Mistakes Drill card made four, and a lazy
    // ListView would leave the last card unbuilt off-screen in tests.
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'PRACTICE',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 11,
              color: v.ink3,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Sharpen your edge.',
            style: TextStyle(
              fontFamily: VidyaFonts.display,
              fontSize: 32,
              fontWeight: FontWeight.w500,
              color: v.ink,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 20),
          for (final m in _modes) ...[
            _PracticeModeCard(mode: m, onTap: () => _onModeTap(context, m)),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _Mode {
  final _PracticeModeKind kind;
  final String eyebrow;
  final String title;
  final String body;
  const _Mode({
    required this.kind,
    required this.eyebrow,
    required this.title,
    required this.body,
  });
}

class _PracticeModeCard extends StatelessWidget {
  final _Mode mode;
  final VoidCallback onTap;
  const _PracticeModeCard({required this.mode, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                mode.eyebrow,
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 10,
                  color: v.ink3,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                mode.title,
                style: TextStyle(
                  fontFamily: VidyaFonts.display,
                  fontSize: 22,
                  fontWeight: FontWeight.w500,
                  color: v.ink,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                mode.body,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink2,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
