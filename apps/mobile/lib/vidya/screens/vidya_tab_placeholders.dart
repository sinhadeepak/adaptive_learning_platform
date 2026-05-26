// Phase 3a placeholders for Study / Practice / Insights / More tabs.
// Each renders a "Coming soon" Vidya card. Tabs 1–3 (Study, Practice,
// Insights) point users at the previous Aurora version via a tap;
// wiring of the AuroraRoute push lands in Phase 3b–3e when each tab
// gets its real Vidya implementation. For Phase 3a the CTA is inert
// (button label only) — explicitly noted in the card body so users
// aren't confused.
//
// The More tab carries the Sign out action so authenticated users have
// a way out of the app even before Phase 3e ships the real More tab.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

// VidyaStudyTabPlaceholder retired in Phase 3b v1 — VidyaStudyScreen
// is now the real Study tab.

class VidyaPracticeTabPlaceholder extends StatelessWidget {
  const VidyaPracticeTabPlaceholder({super.key});
  @override
  Widget build(BuildContext context) => const _Placeholder(
        title: 'Practice',
        message:
            "We're rebuilding this. Your Aurora Practice tab stays available "
            'until Phase 3c ships the Vidya version.',
      );
}

class VidyaInsightsTabPlaceholder extends StatelessWidget {
  const VidyaInsightsTabPlaceholder({super.key});
  @override
  Widget build(BuildContext context) => const _Placeholder(
        title: 'Insights',
        message:
            "We're rebuilding this. Vidya Insights replaces Rank with a "
            'weekly story view — coming in Phase 3d.',
      );
}

// Phase 3e v1 retired VidyaMoreTabPlaceholder in favour of the real
// VidyaMoreScreen; the optional 'action' field is no longer used by
// any caller, so _Placeholder simplifies to title + message only.

class _Placeholder extends StatelessWidget {
  final String title;
  final String message;
  const _Placeholder({
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'COMING SOON',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 10,
                    color: v.ink3,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  title,
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 24,
                    fontWeight: FontWeight.w500,
                    color: v.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  message,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 14,
                    color: v.ink2,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
