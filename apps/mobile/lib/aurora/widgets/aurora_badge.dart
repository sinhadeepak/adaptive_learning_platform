// AuroraBadge — Aurora v2 numeric / dot badge.
//
// Used in tab bars (unread count), avatars (status overlay), and
// list rows. For tap-targets use Tag + Button instead.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraBadgeTone { brand, danger, reward, success }

class AuroraBadge extends StatelessWidget {
  const AuroraBadge({
    super.key,
    this.count,
    this.dot = false,
    this.tone = AuroraBadgeTone.danger,
  });

  /// Numeric badge content. Renders nothing when null + dot is false.
  /// Numbers > 99 render as "99+".
  final int? count;

  /// Render a small dot instead of a number. Ignored when count != null.
  final bool dot;

  final AuroraBadgeTone tone;

  @override
  Widget build(BuildContext context) {
    if (count == null && !dot) return const SizedBox.shrink();
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final bg = switch (tone) {
      AuroraBadgeTone.brand => colors.brand600,
      AuroraBadgeTone.danger => colors.danger600,
      AuroraBadgeTone.reward => colors.reward500,
      AuroraBadgeTone.success => colors.success600,
    };

    if (dot) {
      return Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      );
    }

    final text = count! > 99 ? '99+' : '$count';
    return Container(
      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(9999),
      ),
      alignment: Alignment.center,
      child: Text(
        text,
        style: TextStyle(
          color: colors.neutral0,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          height: 1.2,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}
