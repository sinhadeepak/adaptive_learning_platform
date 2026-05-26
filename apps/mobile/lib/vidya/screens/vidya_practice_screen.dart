// VidyaPracticeScreen — Phase 3c v1. Stateless landing with three
// practice mode cards (Quick / Focused / Mock). Tap shows a snackbar;
// the real session screen with Phase 2f's θ-live overlay lands in
// Phase 3c.full.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaPracticeScreen extends StatelessWidget {
  const VidyaPracticeScreen({super.key});

  static const _modes = <_Mode>[
    _Mode(
      eyebrow: 'QUICK • 10 mins',
      title: 'Quick Practice',
      body: 'Random questions from your active syllabus.',
    ),
    _Mode(
      eyebrow: 'FOCUSED • 20 mins',
      title: 'Focused Practice',
      body: "Drill the topics you've struggled with recently.",
    ),
    _Mode(
      eyebrow: 'MOCK • 3 hrs',
      title: 'Mock Test',
      body: 'Full-length test under timed exam conditions.',
    ),
  ];

  void _onModeTap(BuildContext context, _Mode m) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${m.title} session is coming in Phase 3c.full.'),
      ),
    );
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
  final String eyebrow;
  final String title;
  final String body;
  const _Mode({
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
