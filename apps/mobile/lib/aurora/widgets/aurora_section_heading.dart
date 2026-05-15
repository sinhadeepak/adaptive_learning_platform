// AuroraSectionHeading — Aurora v2 section-heading molecule.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.3
//
// Replaces the legacy AlpSectionHeading widget. The legacy version
// hardcoded `AlpColors.textPrimary` (a dark-theme constant), which
// rendered invisibly on a light scaffold — see Wave 1 root-cause
// analysis. This version reads colour from
// `Theme.of(context).colorScheme.onSurface`, so it is theme-aware by
// construction and works in both light + dark + every persona's
// density/typography flex.
//
// API mirrors the legacy widget's call sites so swap-in is mechanical:
//   AuroraSectionHeading('My exams & courses')
//   AuroraSectionHeading('Today', count: 3, action: const Text('See all'))
//
// Slots:
//   - `text` (required) — the heading itself; uses `typography.h4`
//     scaled by persona type-scale.
//   - `count` (optional) — small badge after the text ("3", "12") for
//     "Today (3)"-style headings. Renders as an `AuroraTag`.
//   - `action` (optional) — right-aligned widget; typically a
//     `TextButton`-style "See all" CTA. Tap target is provided by the
//     caller.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraSectionHeading extends StatelessWidget {
  const AuroraSectionHeading(
    this.text, {
    super.key,
    this.count,
    this.action,
    this.padding,
  });

  /// Heading text. Should be a short label; long phrases break the
  /// single-line layout.
  final String text;

  /// Optional count rendered as a small chip to the right of the text.
  /// Useful for "Today (3)"-style framings.
  final int? count;

  /// Optional right-aligned action widget — typically a small text
  /// button. Caller owns the tap target.
  final Widget? action;

  /// Override the default density-scaled vertical padding around the
  /// heading. The default mirrors `EdgeInsets.fromLTRB(0, 16, 0, 8)`
  /// scaled by the persona's `spaceScale`.
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final personaTheme = Theme.of(context).extension<PersonaTheme>();
    final typeScale = personaTheme?.typeScale ?? 1.0;
    final defaultPad = EdgeInsets.fromLTRB(
      0,
      16 * density.spaceScale,
      0,
      8 * density.spaceScale,
    );

    return Semantics(
      header: true,
      label: count == null ? text : '$text, $count',
      child: Padding(
        padding: padding ?? defaultPad,
        child: Row(
          children: [
            Flexible(
              child: Text(
                text,
                style: typography.h4.copyWith(
                  color: colors.neutral900,
                  fontSize: typography.h4.fontSize! * typeScale,
                  height: 1.2,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (count != null) ...[
              SizedBox(width: 8 * density.spaceScale),
              _CountChip(value: count!),
            ],
            const Spacer(),
            if (action != null)
              DefaultTextStyle.merge(
                style: typography.button.copyWith(color: colors.brand600),
                child: action!,
              ),
          ],
        ),
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({required this.value});
  final int value;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: colors.brand100,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$value',
        style: typography.label.copyWith(
          color: colors.brand600,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
