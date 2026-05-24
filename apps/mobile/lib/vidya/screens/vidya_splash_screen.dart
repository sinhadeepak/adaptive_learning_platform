// VidyaSplashScreen — branded cold-start splash rendered while
// VidyaRootApp's bootstrap futures settle (persona/density/themeMode
// notifiers + auth + onboarding-done flag).
//
// Renders before any inherited Vidya theme is fully ready, so token
// reads are guarded with a fallback. Aims for perceived 600–800ms;
// VidyaRootApp swaps to the next screen as soon as bootstrap completes.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaSplashScreen extends StatelessWidget {
  const VidyaSplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ext = Theme.of(context).extension<VidyaThemeData>();
    final bg     = ext?.paper  ?? const Color(0xFFFFFFFF);
    final ink    = ext?.ink    ?? const Color(0xFF0A0A0F);
    final accent = ext?.accent ?? const Color(0xFF1F6B4A);

    return Scaffold(
      backgroundColor: bg,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: accent,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    alignment: Alignment.center,
                    child: const Text(
                      'V',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 36,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Vidya',
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 32,
                      fontWeight: FontWeight.w400,
                      color: ink,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Adaptive learning, designed for you',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      color: ink.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
            Align(
              alignment: const Alignment(0, 0.85),
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(accent),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
