import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaCardTone { defaultTone, muted, accent, dark }

class VidyaCard extends StatelessWidget {
  final Widget child;
  final VidyaCardTone tone;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final BorderRadius borderRadius;

  const VidyaCard({
    super.key,
    required this.child,
    this.tone = VidyaCardTone.defaultTone,
    this.padding,
    this.onTap,
    this.borderRadius = const BorderRadius.all(VidyaRadius.lg),
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final (bg, fg) = switch (tone) {
      VidyaCardTone.defaultTone => (v.card, v.ink),
      VidyaCardTone.muted => (v.paper2, v.ink2),
      VidyaCardTone.accent => (v.accentSoft, v.ink),
      VidyaCardTone.dark => (const Color(0xFF0C0F14), const Color(0xFFF1EEE7)),
    };
    final pad = padding ?? EdgeInsets.all(v.density.cardP);

    final body = DefaultTextStyle.merge(
      style: TextStyle(color: fg, fontFamily: VidyaFonts.ui),
      child: Padding(padding: pad, child: child),
    );

    final card = Material(
      color: bg,
      borderRadius: borderRadius,
      child: tone == VidyaCardTone.defaultTone
          ? Container(
              decoration: BoxDecoration(
                borderRadius: borderRadius,
                border: Border.all(color: v.rule, width: 1),
              ),
              child: body,
            )
          : body,
    );

    if (onTap == null) return card;
    return InkWell(
      onTap: onTap,
      borderRadius: borderRadius,
      child: card,
    );
  }
}
