// VidyaPracticeScreen — Phase 3c.full v1. Landing surface with three
// practice mode cards (Quick / Focused / Mock). Quick now wires through
// to VidyaPracticeSessionScreen → VidyaPracticeResultScreen; Focused +
// Mock still snackbar (their slices land in Phase 3c.full v2 + v3).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../quiz/quiz_client.dart';
import 'vidya_practice_result_screen.dart';
import 'vidya_practice_session_screen.dart';

/// Stable identifier for each practice mode, decoupled from the
/// user-visible `title`. Lets a copy or i18n change touch the
/// `_modes` literal without silently re-routing dispatch.
enum _PracticeModeKind { quick, focused, mock }

class VidyaPracticeScreen extends StatelessWidget {
  final QuizClient client;
  const VidyaPracticeScreen({super.key, required this.client});

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
      kind: _PracticeModeKind.mock,
      eyebrow: 'MOCK • 3 hrs',
      title: 'Mock Test',
      body: 'Full-length test under timed exam conditions.',
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
      case _PracticeModeKind.mock:
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${m.title} session is coming in Phase 3c.full v2.'),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
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
