import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaBannerTone { neutral, good, warn, bad, info }

class VidyaBanner extends StatelessWidget {
  final String message;
  final VidyaBannerTone tone;
  final IconData? leadingIcon;
  final Widget? action;

  const VidyaBanner({
    super.key,
    required this.message,
    this.tone = VidyaBannerTone.neutral,
    this.leadingIcon,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final (bg, fg) = switch (tone) {
      VidyaBannerTone.neutral => (v.paper2, v.ink2),
      VidyaBannerTone.good => (v.accentSoft, v.accent2),
      VidyaBannerTone.warn => (v.goldSoft, v.gold2),
      VidyaBannerTone.bad => (v.bad.withValues(alpha: 0.12), v.bad),
      VidyaBannerTone.info => (v.info.withValues(alpha: 0.12), v.info),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(VidyaRadius.md),
      ),
      child: Row(
        children: [
          if (leadingIcon != null) ...[
            Icon(leadingIcon, size: 16, color: fg),
            const SizedBox(width: 10),
          ],
          Expanded(child: Text(message, style: VidyaText.bodySm(fg))),
          if (action != null) ...[
            const SizedBox(width: 10),
            action!,
          ],
        ],
      ),
    );
  }
}
