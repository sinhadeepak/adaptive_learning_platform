// AuroraCard — Aurora v2 card primitive for the mobile app.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.2
//
// Three surface tiers + four tone variants. Tone controls the optional
// Aurora gradient background overlay (reserved for AI / celebration /
// progress moments).
//
// Padding is density-aware (Junior 1.20× / Aspirant 1.0× / Pro 0.85×).
// Radius is density-aware. Pressed state (when `onTap` is wired) adds
// a subtle elevation lift + scale on Android, soft pressed state on iOS.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraCardSurface { tier1, tier2, tier3 }

enum AuroraCardPadding { sm, md, lg }

enum AuroraCardTone { neutral, auroraAi, auroraCelebration, auroraProgress }

class AuroraCard extends StatelessWidget {
  const AuroraCard({
    super.key,
    required this.child,
    this.surface = AuroraCardSurface.tier1,
    this.padding = AuroraCardPadding.md,
    this.tone = AuroraCardTone.neutral,
    this.onTap,
    this.interactive,
    this.semanticLabel,
  });

  final Widget child;
  final AuroraCardSurface surface;
  final AuroraCardPadding padding;
  final AuroraCardTone tone;
  final VoidCallback? onTap;

  /// Defaults to `onTap != null`. Set explicitly to render a hoverable
  /// surface even without a tap handler (e.g. drag target).
  final bool? interactive;

  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final bgColor = switch (surface) {
      AuroraCardSurface.tier1 => colors.neutral0,
      AuroraCardSurface.tier2 => colors.neutral100,
      AuroraCardSurface.tier3 => colors.neutral200,
    };
    final pad = _paddingFor(padding) * density.spaceScale;
    final cornerRadius = radius.lg * density.radiusScale;

    final gradient = switch (tone) {
      AuroraCardTone.auroraAi => colors.auroraAiSoft,
      AuroraCardTone.auroraCelebration => colors.auroraCelebrationSoft,
      AuroraCardTone.auroraProgress => colors.auroraProgressSoft,
      AuroraCardTone.neutral => null,
    };

    final isInteractive = interactive ?? (onTap != null);

    Widget surfaceWidget = Container(
      decoration: BoxDecoration(
        color: gradient == null ? bgColor : null,
        gradient: gradient,
        border: Border.all(
          color: tone == AuroraCardTone.neutral
              ? colors.neutral200
              : Colors.transparent,
        ),
        borderRadius: BorderRadius.circular(cornerRadius),
      ),
      padding: EdgeInsets.all(pad),
      child: child,
    );

    if (isInteractive) {
      surfaceWidget = Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(cornerRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(cornerRadius),
          splashColor: colors.brand500.withValues(alpha: 0.10),
          highlightColor: colors.brand500.withValues(alpha: 0.06),
          child: surfaceWidget,
        ),
      );
    }

    if (semanticLabel != null) {
      surfaceWidget = Semantics(
        label: semanticLabel,
        button: isInteractive,
        child: surfaceWidget,
      );
    }
    return surfaceWidget;
  }

  double _paddingFor(AuroraCardPadding p) => switch (p) {
        AuroraCardPadding.sm => 12,
        AuroraCardPadding.md => 16,
        AuroraCardPadding.lg => 24,
      };
}
