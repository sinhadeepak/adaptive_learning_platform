// AuroraTag — Aurora v2 status pill.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.1
//
// 7 tones × 3 variants × 2 sizes. Same tone/variant API as the web
// `<Tag>` component for cross-platform parity.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraTagTone { neutral, brand, success, warning, danger, reward, aurora }

enum AuroraTagVariant { solid, soft, outline }

enum AuroraTagSize { sm, md }

class AuroraTag extends StatelessWidget {
  const AuroraTag({
    super.key,
    required this.label,
    this.tone = AuroraTagTone.neutral,
    this.variant = AuroraTagVariant.soft,
    this.size = AuroraTagSize.sm,
    this.iconLeft,
  });

  final String label;
  final AuroraTagTone tone;
  final AuroraTagVariant variant;
  final AuroraTagSize size;
  final Widget? iconLeft;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final fg = _foreground(colors);
    final bg = _background(colors);
    final border = _border(colors);
    final isGradient =
        tone == AuroraTagTone.aurora && variant != AuroraTagVariant.outline;
    final gradient = isGradient
        ? (variant == AuroraTagVariant.solid
            ? colors.auroraAi
            : colors.auroraAiSoft)
        : null;

    final fontSize = (size == AuroraTagSize.sm
        ? typography.overline.fontSize ?? 11
        : typography.label.fontSize ?? 12) *
        density.typeScale;
    final padH = (size == AuroraTagSize.sm ? 8.0 : 12.0) * density.spaceScale;
    final padV = (size == AuroraTagSize.sm ? 2.0 : 4.0) * density.spaceScale;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: padH, vertical: padV),
      decoration: BoxDecoration(
        color: gradient == null ? bg : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(9999),
        border: border == null ? null : Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (iconLeft != null) ...[
            IconTheme(
              data: IconThemeData(color: fg, size: fontSize),
              child: iconLeft!,
            ),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontSize: fontSize,
              fontWeight: FontWeight.w600,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }

  Color _foreground(AuroraColors c) {
    if (variant == AuroraTagVariant.solid && tone != AuroraTagTone.aurora) {
      return c.neutral0;
    }
    return switch (tone) {
      AuroraTagTone.neutral => c.neutral700,
      AuroraTagTone.brand => c.brand700,
      AuroraTagTone.success => c.success600,
      AuroraTagTone.warning => c.developing600,
      AuroraTagTone.danger => c.danger600,
      AuroraTagTone.reward => c.reward600,
      AuroraTagTone.aurora =>
        variant == AuroraTagVariant.solid ? c.neutral0 : c.aurora500,
    };
  }

  Color? _background(AuroraColors c) {
    if (tone == AuroraTagTone.aurora) return null; // gradient
    switch (variant) {
      case AuroraTagVariant.solid:
        return switch (tone) {
          AuroraTagTone.neutral => c.neutral700,
          AuroraTagTone.brand => c.brand600,
          AuroraTagTone.success => c.success600,
          AuroraTagTone.warning => c.developing600,
          AuroraTagTone.danger => c.danger600,
          AuroraTagTone.reward => c.reward600,
          _ => null,
        };
      case AuroraTagVariant.soft:
        return switch (tone) {
          AuroraTagTone.neutral => c.neutral100,
          AuroraTagTone.brand => c.brand50,
          AuroraTagTone.success => c.success50,
          AuroraTagTone.warning => c.developing50,
          AuroraTagTone.danger => c.danger50,
          AuroraTagTone.reward => c.reward50,
          _ => null,
        };
      case AuroraTagVariant.outline:
        return Colors.transparent;
    }
  }

  Color? _border(AuroraColors c) {
    if (variant != AuroraTagVariant.outline) return null;
    return switch (tone) {
      AuroraTagTone.neutral => c.neutral300,
      AuroraTagTone.brand => c.brand500,
      AuroraTagTone.success => c.success500,
      AuroraTagTone.warning => c.developing500,
      AuroraTagTone.danger => c.danger500,
      AuroraTagTone.reward => c.reward500,
      AuroraTagTone.aurora => c.aurora500,
    };
  }
}
