// AuroraListTile — Aurora v2 list-tile molecule.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.3
//
// Replaces ad-hoc Row/Column structures across Settings / Profile /
// Inbox / Bookmarks. Material's ListTile + CupertinoListTile both
// exist, but neither flexes by Aurora density nor honours persona
// touch-target floors (Kid 56 dp / Teen 48 / Aspirant + Learner 44).
// This widget enforces both.
//
// Slots:
//   - `leading`   — typically an `AuroraIcon` / `AuroraAvatar`.
//   - `title`     — required. Single-line by default; pass
//                   `titleMaxLines` to allow wrapping.
//   - `subtitle`  — secondary line; uses `bodySm` / `neutral500`.
//   - `trailing`  — typically a chevron, `AuroraSwitch`, `AuroraTag`,
//                   or a small count chip.
//   - `onTap` / `onLongPress` — interactivity. When `onTap` is null,
//     the row is read-only (no ripple, no Material wrap).
//
// Accessibility:
//   - Auto-merges leading + title + subtitle + trailing into a single
//     `Semantics(button: bool)` node so screen-readers don't read four
//     unrelated elements.
//   - When the row is read-only and carries a switch in `trailing`,
//     pass `excludeTrailingFromSemantics: false` so the switch's own
//     state announces.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraListTile extends StatelessWidget {
  const AuroraListTile({
    super.key,
    required this.title,
    this.leading,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.onLongPress,
    this.titleMaxLines = 1,
    this.subtitleMaxLines = 2,
    this.semanticLabel,
    this.excludeTrailingFromSemantics = true,
    this.dense = false,
  });

  final String title;
  final Widget? leading;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final int titleMaxLines;
  final int subtitleMaxLines;

  /// Override the auto-built semantic label. Useful when title +
  /// subtitle don't fully describe the action (e.g. "Edit profile,
  /// requires verification").
  final String? semanticLabel;

  /// Set to false when [trailing] is a stateful control (switch,
  /// radio, badge with count) so its state announces independently.
  final bool excludeTrailingFromSemantics;

  /// Tighter vertical padding for high-density lists (Inbox, Search
  /// results). Honours the persona's touch-target floor — we won't
  /// shrink below that.
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final personaTheme = Theme.of(context).extension<PersonaTheme>();
    final touchFloor = personaTheme?.touchTargetFloor ?? density.touchTarget;

    final vPad = (dense ? 8.0 : 12.0) * density.spaceScale;
    final hPad = 16.0 * density.spaceScale;

    final row = Padding(
      padding: EdgeInsets.symmetric(horizontal: hPad, vertical: vPad),
      child: Row(
        crossAxisAlignment: subtitle == null
            ? CrossAxisAlignment.center
            : CrossAxisAlignment.start,
        children: [
          if (leading != null) ...[
            leading!,
            SizedBox(width: 14 * density.spaceScale),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: typography.bodyLg.copyWith(
                    color: colors.neutral900,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: titleMaxLines,
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle != null) ...[
                  SizedBox(height: 2 * density.spaceScale),
                  Text(
                    subtitle!,
                    style: typography.bodySm.copyWith(
                      color: colors.neutral500,
                      height: 1.35,
                    ),
                    maxLines: subtitleMaxLines,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[
            SizedBox(width: 12 * density.spaceScale),
            ExcludeSemantics(
              excluding: excludeTrailingFromSemantics,
              child: trailing!,
            ),
          ],
        ],
      ),
    );

    final constrained = ConstrainedBox(
      constraints: BoxConstraints(minHeight: touchFloor),
      child: row,
    );

    Widget result = Semantics(
      label: semanticLabel ??
          (subtitle == null ? title : '$title, $subtitle'),
      button: onTap != null,
      child: constrained,
    );

    if (onTap != null || onLongPress != null) {
      result = Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          splashColor: colors.brand500.withValues(alpha: 0.10),
          highlightColor: colors.brand500.withValues(alpha: 0.06),
          child: result,
        ),
      );
    }
    return result;
  }
}
