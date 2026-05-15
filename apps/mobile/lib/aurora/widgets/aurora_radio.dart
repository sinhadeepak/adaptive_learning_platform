// AuroraRadio — Aurora v2 atom.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.1
//
// Single-select radio control. Honours the persona's touch-target
// floor (Kid 56 dp / Teen 48 / Aspirant + Learner 44). The default
// Material Radio shrinks to ~40 dp which fails the Kid floor — this
// wrapper wraps Radio in a hit-target box of the right size and
// adds semantic state ("Selected" / "Not selected") in plain
// language for screen-readers.
//
// Two usage shapes:
//
//   AuroraRadio<T>(            // raw radio in a custom row
//     value: T.a,
//     groupValue: _selected,
//     onChanged: (v) => setState(() => _selected = v),
//   )
//
//   AuroraRadioTile<T>(        // labelled tile (preferred)
//     value: T.a,
//     groupValue: _selected,
//     onChanged: ...,
//     title: 'Option A',
//     subtitle: 'Why pick this',
//   )

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AuroraRadio<T> extends StatelessWidget {
  const AuroraRadio({
    super.key,
    required this.value,
    required this.groupValue,
    required this.onChanged,
    this.semanticLabel,
  });

  final T value;
  final T? groupValue;
  final ValueChanged<T?>? onChanged;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final personaTheme = Theme.of(context).extension<PersonaTheme>();
    final touchFloor = personaTheme?.touchTargetFloor ?? density.touchTarget;
    final selected = value == groupValue;

    final core = Radio<T>(
      value: value,
      groupValue: groupValue,
      onChanged: onChanged,
      activeColor: colors.brand600,
      materialTapTargetSize: MaterialTapTargetSize.padded,
    );

    return Semantics(
      label: semanticLabel,
      inMutuallyExclusiveGroup: true,
      checked: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onChanged == null
            ? null
            : () {
                HapticFeedback.selectionClick();
                onChanged!(value);
              },
        child: SizedBox(
          width: touchFloor,
          height: touchFloor,
          child: Center(child: core),
        ),
      ),
    );
  }
}

/// Labelled radio tile — the recommended shape for radio groups inside
/// onboarding / settings / report flows. Tap target spans the whole
/// row (not just the radio circle), matching native iOS / Android
/// expectations.
class AuroraRadioTile<T> extends StatelessWidget {
  const AuroraRadioTile({
    super.key,
    required this.value,
    required this.groupValue,
    required this.onChanged,
    required this.title,
    this.subtitle,
  });

  final T value;
  final T? groupValue;
  final ValueChanged<T?>? onChanged;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final personaTheme = Theme.of(context).extension<PersonaTheme>();
    final touchFloor = personaTheme?.touchTargetFloor ?? density.touchTarget;
    final selected = value == groupValue;

    return Semantics(
      label: subtitle == null ? title : '$title. $subtitle',
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onChanged == null
              ? null
              : () {
                  HapticFeedback.selectionClick();
                  onChanged!(value);
                },
          splashColor: colors.brand500.withValues(alpha: 0.10),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: touchFloor),
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: 8 * density.spaceScale,
                vertical: 8 * density.spaceScale,
              ),
              child: Row(
                crossAxisAlignment: subtitle == null
                    ? CrossAxisAlignment.center
                    : CrossAxisAlignment.start,
                children: [
                  ExcludeSemantics(
                    child: AuroraRadio<T>(
                      value: value,
                      groupValue: groupValue,
                      onChanged: onChanged,
                    ),
                  ),
                  SizedBox(width: 4 * density.spaceScale),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          style: typography.body
                              .copyWith(color: colors.neutral900),
                        ),
                        if (subtitle != null) ...[
                          SizedBox(height: 2 * density.spaceScale),
                          Text(
                            subtitle!,
                            style: typography.bodySm.copyWith(
                              color: colors.neutral500,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
