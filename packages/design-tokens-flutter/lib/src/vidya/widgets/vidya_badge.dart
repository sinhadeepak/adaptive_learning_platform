import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaBadgeTone { neutral, good, warn, bad, info }

class VidyaBadge extends StatelessWidget {
  final String label;
  final VidyaBadgeTone tone;

  const VidyaBadge({
    super.key,
    required this.label,
    this.tone = VidyaBadgeTone.neutral,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final (bg, fg) = switch (tone) {
      VidyaBadgeTone.neutral => (v.paper2, v.ink2),
      VidyaBadgeTone.good => (v.accentSoft, v.accent),
      VidyaBadgeTone.warn => (v.goldSoft, v.gold2),
      VidyaBadgeTone.bad => (v.bad.withValues(alpha: 0.12), v.bad),
      VidyaBadgeTone.info => (v.info.withValues(alpha: 0.12), v.info),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(VidyaRadius.sm),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 10.5,
          fontWeight: FontWeight.w500,
          color: fg,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
