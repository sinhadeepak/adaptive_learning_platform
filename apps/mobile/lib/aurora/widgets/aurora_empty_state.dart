// AuroraEmptyState — Aurora v2 empty-state molecule.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.2 + §9
//
// One canonical empty-state across the app:
//   * Junior density adds illustrated halo behind the leading icon
//     (Aurora-ai-soft gradient ring).
//   * Aspirant density renders a flat icon halo.
//   * Pro density renders no illustration.
//
// Callers pass an optional leading widget (Lucide-style icon or
// mascot illustration), a title, an optional description, and 0-2
// action widgets (typically AuroraButton).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraEmptyState extends StatelessWidget {
  const AuroraEmptyState({
    super.key,
    this.illustration,
    required this.title,
    this.description,
    this.actions = const [],
  });

  /// Icon or illustration. Auto-wrapped in an Aurora-tinted halo in
  /// Junior/Aspirant density modes.
  final Widget? illustration;

  final String title;
  final String? description;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final spacing = Theme.of(context).extension<AuroraSpacing>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final showHalo =
        illustration != null && density.mode != AuroraDensityMode.pro;

    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: spacing.s6 * density.spaceScale,
        vertical: spacing.s12 * density.spaceScale,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (illustration != null) ...[
            if (showHalo)
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  gradient: colors.auroraAiSoft,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: IconTheme(
                  data: IconThemeData(color: colors.aurora500, size: 40),
                  child: illustration!,
                ),
              )
            else
              IconTheme(
                data: IconThemeData(color: colors.neutral500, size: 40),
                child: illustration!,
              ),
            SizedBox(height: spacing.s3 * density.spaceScale),
          ],
          Text(
            title,
            textAlign: TextAlign.center,
            style: typography.h3.copyWith(color: colors.neutral900),
          ),
          if (description != null) ...[
            SizedBox(height: spacing.s2 * density.spaceScale),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: Text(
                description!,
                textAlign: TextAlign.center,
                style: typography.body.copyWith(color: colors.neutral600),
              ),
            ),
          ],
          if (actions.isNotEmpty) ...[
            SizedBox(height: spacing.s4 * density.spaceScale),
            Wrap(
              spacing: spacing.s2 * density.spaceScale,
              runSpacing: spacing.s2 * density.spaceScale,
              alignment: WrapAlignment.center,
              children: actions,
            ),
          ],
        ],
      ),
    );
  }
}
