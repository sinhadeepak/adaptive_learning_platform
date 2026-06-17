// VidyaGuestScreeningIntroScreen — pre-quiz framing for the guest funnel.
// Distinct from the authed VidyaScreeningIntroScreen: this screen frames
// the screening as a no-signup-required exploration, and a Skip path
// routes straight to register (the parent decides where).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaGuestScreeningIntroScreen extends StatelessWidget {
  final VoidCallback onStart;
  final VoidCallback onSkip;

  const VidyaGuestScreeningIntroScreen({
    super.key,
    required this.onStart,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: onSkip,
        ),
      ),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 16),
                  Text(
                    '5-MINUTE SCREENING',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 2,
                      color: v.ink3,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'See where you stand. Before signing up.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 28,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '15 adaptive questions across Physics, Chemistry, '
                    'Biology. No login needed.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 14,
                      color: v.ink3,
                      height: 1.55,
                    ),
                  ),
                  const SizedBox(height: 24),
                  VidyaCard(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 4, vertical: 4),
                      child: Column(
                        children: [
                          _InfoRow(
                            icon: Icons.timer_outlined,
                            label: 'Time',
                            value: '~5 min',
                          ),
                          _Divider(color: v.ink3.withValues(alpha: 0.12)),
                          _InfoRow(
                            icon: Icons.flash_on_outlined,
                            label: 'Questions',
                            value: '15 · adaptive',
                          ),
                          _Divider(color: v.ink3.withValues(alpha: 0.12)),
                          _InfoRow(
                            icon: Icons.track_changes_outlined,
                            label: "You'll get",
                            value: 'Readiness estimate',
                          ),
                          _Divider(color: v.ink3.withValues(alpha: 0.12)),
                          _InfoRow(
                            icon: Icons.lock_outline,
                            label: 'Privacy',
                            value: 'Saved if you sign up',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  VidyaButton(
                    key: const Key('vidya.guest.intro.start'),
                    label: 'Start screening',
                    onPressed: onStart,
                    style: VidyaButtonStyle.primary,
                    size: VidyaButtonSize.lg,
                    fullWidth: true,
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      key: const Key('vidya.guest.intro.skip'),
                      onPressed: onSkip,
                      child: const Text('Skip — sign up first'),
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

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
      child: Row(
        children: [
          Icon(icon, color: v.ink3, size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink3,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: v.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  final Color color;
  const _Divider({required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Container(height: 1, color: color),
    );
  }
}
