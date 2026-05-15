// AuroraBanner — Aurora v2 banner molecule.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.3
//
// Inline, dismissable message that sits inside content flow (not
// floating like a snackbar). Use for:
//   - Connectivity / offline status (see AuroraConnectivityBanner —
//     ships in a follow-up sub-wave on top of this primitive)
//   - Monetisation upsell ("Unlock test series — 30% off this week")
//   - In-app announcements ("Maintenance window 02:00–04:00 IST")
//   - Onboarding nudges
//
// Four tones map to the Aurora semantic palette + a neutral baseline:
//   - info     → brand-blue background, dark text
//   - success  → success-green background
//   - warning  → developing-amber background
//   - danger   → danger-red background
//
// Slots:
//   - `title`     — required headline.
//   - `body`      — optional secondary line.
//   - `icon`      — optional leading icon; falls back to a tone-
//                   appropriate default when omitted.
//   - `action`    — optional CTA button or text-button on the right.
//   - `onDismiss` — when provided, renders an ✕ button on the far
//                   right. Caller is responsible for removing the
//                   banner from the tree after the callback fires.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraBannerTone { info, success, warning, danger }

class AuroraBanner extends StatelessWidget {
  const AuroraBanner({
    super.key,
    required this.title,
    this.body,
    this.tone = AuroraBannerTone.info,
    this.icon,
    this.action,
    this.onDismiss,
  });

  final String title;
  final String? body;
  final AuroraBannerTone tone;
  final Widget? icon;
  final Widget? action;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final palette = _paletteFor(tone, colors);
    final pad = 14.0 * density.spaceScale;
    final defaultIcon = Icon(
      _defaultIconFor(tone),
      color: palette.fg,
      size: 20,
    );

    return Semantics(
      liveRegion: tone == AuroraBannerTone.warning ||
          tone == AuroraBannerTone.danger,
      label: body == null ? title : '$title. $body',
      child: Container(
        padding: EdgeInsets.all(pad),
        decoration: BoxDecoration(
          color: palette.bg,
          borderRadius:
              BorderRadius.circular(radius.md * density.radiusScale),
          border: Border.all(color: palette.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            icon ?? defaultIcon,
            SizedBox(width: 12 * density.spaceScale),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: typography.body.copyWith(
                      color: palette.fg,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (body != null) ...[
                    SizedBox(height: 2 * density.spaceScale),
                    Text(
                      body!,
                      style: typography.bodySm
                          .copyWith(color: palette.fg, height: 1.4),
                    ),
                  ],
                  if (action != null) ...[
                    SizedBox(height: 8 * density.spaceScale),
                    action!,
                  ],
                ],
              ),
            ),
            if (onDismiss != null) ...[
              SizedBox(width: 8 * density.spaceScale),
              InkResponse(
                onTap: onDismiss,
                radius: 20,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(Icons.close,
                      color: palette.fg.withValues(alpha: 0.7), size: 18,),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static IconData _defaultIconFor(AuroraBannerTone tone) => switch (tone) {
        AuroraBannerTone.info => Icons.info_outline,
        AuroraBannerTone.success => Icons.check_circle_outline,
        AuroraBannerTone.warning => Icons.warning_amber_outlined,
        AuroraBannerTone.danger => Icons.error_outline,
      };

  static _BannerPalette _paletteFor(
    AuroraBannerTone tone,
    AuroraColors colors,
  ) {
    switch (tone) {
      case AuroraBannerTone.info:
        return _BannerPalette(
          bg: colors.brand50,
          fg: colors.brand700,
          border: colors.brand100,
        );
      case AuroraBannerTone.success:
        return _BannerPalette(
          bg: colors.success50,
          fg: colors.success600,
          border: colors.success500.withValues(alpha: 0.35),
        );
      case AuroraBannerTone.warning:
        return _BannerPalette(
          bg: colors.developing50,
          fg: colors.developing600,
          border: colors.developing500.withValues(alpha: 0.35),
        );
      case AuroraBannerTone.danger:
        return _BannerPalette(
          bg: colors.danger50,
          fg: colors.danger600,
          border: colors.danger500.withValues(alpha: 0.35),
        );
    }
  }
}

class _BannerPalette {
  const _BannerPalette({
    required this.bg,
    required this.fg,
    required this.border,
  });
  final Color bg;
  final Color fg;
  final Color border;
}
