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

class VidyaStudyTabPlaceholder extends StatelessWidget {
  const VidyaStudyTabPlaceholder({super.key});
  @override
  Widget build(BuildContext context) => const _Placeholder(
        title: 'Study',
        message:
            "We're rebuilding this. Your Aurora Study tab stays available "
            'until Phase 3b ships the Vidya version.',
      );
}

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

class VidyaMoreTabPlaceholder extends StatelessWidget {
  final VoidCallback onSignOut;
  const VidyaMoreTabPlaceholder({super.key, required this.onSignOut});

  @override
  Widget build(BuildContext context) => _Placeholder(
        title: 'More',
        message:
            "Profile, settings, and developer options land in Phase 3e. "
            "For now: sign out below.",
        action: _Action(label: 'Sign out', onTap: onSignOut),
      );
}

class _Action {
  final String label;
  final VoidCallback onTap;
  const _Action({required this.label, required this.onTap});
}

class _Placeholder extends StatelessWidget {
  final String title;
  final String message;
  final _Action? action;
  const _Placeholder({
    required this.title,
    required this.message,
    this.action,
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
                if (action != null) ...[
                  const SizedBox(height: 16),
                  VidyaButton(
                    label: action!.label,
                    onPressed: action!.onTap,
                    size: VidyaButtonSize.md,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
