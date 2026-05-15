// AuroraSettingsScreen — Theme + Density picker (M8 anchor screen).
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §13.10
//
// Drop-in standalone screen. Routes to from any nav entry as:
//   Navigator.push(context, MaterialPageRoute(builder: (_) =>
//       AuroraSettingsScreen(themeMode: themeMode, density: density)));
//
// Both notifiers are passed in so the parent's main.tsx ChangeNotifier
// listeners pick up the change and the whole tree rebuilds.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../density_notifier.dart';
import '../theme_mode_notifier.dart';
import '../widgets/widgets.dart';

class AuroraSettingsScreen extends StatelessWidget {
  const AuroraSettingsScreen({
    super.key,
    required this.themeMode,
    required this.density,
  });

  final ThemeModeNotifier themeMode;
  final DensityNotifier density;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    return AuroraScaffold(
      appBar: const AuroraAppBar(title: 'Settings'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Text(
            'Theme & density',
            style: typography.h2.copyWith(color: colors.neutral900),
          ),
          const SizedBox(height: 4),
          Text(
            'Aurora adapts the visual system to your environment and persona. '
            'Both switches apply instantly across every screen.',
            style: typography.body.copyWith(color: colors.neutral600),
          ),
          const SizedBox(height: 20),

          Text(
            'Theme',
            style: typography.label.copyWith(color: colors.neutral700),
          ),
          const SizedBox(height: 8),
          _ThemeRow(themeMode: themeMode),

          const SizedBox(height: 20),
          Text(
            'Density',
            style: typography.label.copyWith(color: colors.neutral700),
          ),
          const SizedBox(height: 8),
          _DensityRow(density: density),

          const SizedBox(height: 32),
          AuroraButton(
            label: 'Done',
            variant: AuroraButtonVariant.primary,
            fullWidth: true,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }
}

class _ThemeRow extends StatelessWidget {
  const _ThemeRow({required this.themeMode});
  final ThemeModeNotifier themeMode;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: themeMode,
      builder: (context, _) {
        final entries = <(ThemeMode, String, String)>[
          (ThemeMode.system, 'System', "Match your device's setting."),
          (ThemeMode.light, 'Light', 'Bright canvas, dark text.'),
          (ThemeMode.dark, 'Dark', 'Quiet — better for long sessions.'),
        ];
        return Column(
          children: [
            for (final (mode, label, desc) in entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _SelectableCard(
                  selected: themeMode.mode == mode,
                  title: label,
                  description: desc,
                  onTap: () => themeMode.setMode(mode),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _DensityRow extends StatelessWidget {
  const _DensityRow({required this.density});
  final DensityNotifier density;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: density,
      builder: (context, _) {
        final entries = <(AuroraDensityMode, String, String)>[
          (
            AuroraDensityMode.junior,
            'Junior',
            'Comfortable spacing + larger touch targets. Class 5–10.'
          ),
          (
            AuroraDensityMode.aspirant,
            'Aspirant',
            'Standard density. NEET / JEE / UPSC / Class 11–12.'
          ),
          (
            AuroraDensityMode.pro,
            'Pro',
            'Compact — working pros and tutors.'
          ),
        ];
        return Column(
          children: [
            for (final (mode, label, desc) in entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _SelectableCard(
                  selected: density.mode == mode,
                  title: label,
                  description: desc,
                  onTap: () => density.setMode(mode),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _SelectableCard extends StatelessWidget {
  const _SelectableCard({
    required this.selected,
    required this.title,
    required this.description,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String description;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: title,
      child: AuroraCard(
        tone: selected ? AuroraCardTone.auroraAi : AuroraCardTone.neutral,
        onTap: onTap,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: typography.h4.copyWith(
                      color: colors.neutral900,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    description,
                    style: typography.bodySm
                        .copyWith(color: colors.neutral600),
                  ),
                ],
              ),
            ),
            if (selected)
              Icon(Icons.check_circle, color: colors.brand600, size: 22),
          ],
        ),
      ),
    );
  }
}
