// First-launch value-prop carousel — shown once before the exam
// picker so a brand-new student knows what the app actually does
// before they're asked to commit to an exam target.
//
// Three swipe-able cards (Adaptive practice / Mock tests / AI doubts),
// a page indicator, and a "Get Started" CTA on the last page that
// hands off to ExamSelectScreen via the standard onContinue callback.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key, required this.onContinue});

  final VoidCallback onContinue;

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _slides = [
    (
      icon: Icons.bolt_rounded,
      accent: AlpColors.colorBlue,
      title: 'Adaptive practice',
      body:
          'Questions calibrate to your exact level. The IRT engine adjusts difficulty live so each round teaches you something new.',
    ),
    (
      icon: Icons.emoji_events_outlined,
      accent: AlpColors.colorAmber,
      title: 'Real exam-day mocks',
      body:
          'Full-blueprint tests with timing, scoring, projected percentile and rank — same shape as the real paper.',
    ),
    (
      icon: Icons.chat_bubble_outline,
      accent: AlpColors.colorAi,
      title: 'AI doubt clearing',
      body:
          'Stuck on a problem? Snap a photo or type your question. The AI walks through the solution step by step.',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _slides.length - 1;
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      body: SafeArea(
        child: Column(
          children: [
            // Skip in the top-right so the first-time student isn't
            // forced through the carousel if they already know what
            // they're doing.
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: widget.onContinue,
                    child: const Text('Skip',
                        style: TextStyle(
                            color: AlpColors.textMuted, fontSize: 13,),),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (ctx, i) {
                  final s = _slides[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 88,
                          height: 88,
                          decoration: BoxDecoration(
                            color: s.accent.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Icon(s.icon, color: s.accent, size: 44),
                        ),
                        const SizedBox(height: 28),
                        Text(
                          s.title,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              color: AlpColors.textPrimary,
                              fontSize: 24,
                              fontWeight: FontWeight.w700,),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          s.body,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              color: AlpColors.textSecondary,
                              fontSize: 14,
                              height: 1.5,),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            // Page indicator dots.
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_slides.length, (i) {
                final active = i == _page;
                return Container(
                  width: active ? 22 : 8,
                  height: 8,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    color: active
                        ? AlpColors.colorAi
                        : AlpColors.borderDefault,
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 0, 28, 32),
              child: SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: isLast
                      ? widget.onContinue
                      : () => _controller.nextPage(
                            duration: const Duration(milliseconds: 280),
                            curve: Curves.easeOut,
                          ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AlpColors.colorAi,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),),
                  ),
                  child: Text(
                    isLast ? 'Get started ▶' : 'Next',
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15,),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
