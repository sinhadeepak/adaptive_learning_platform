// AuroraFormField — Aurora v2 form-field wrapper.
//
// Pairs a label + required marker + helper/error text with any control.
// Differs from AuroraTextField in that this can wrap any widget
// (Slider, Switch, Picker, custom selector).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraFormField extends StatelessWidget {
  const AuroraFormField({
    super.key,
    required this.label,
    required this.child,
    this.required = false,
    this.helper,
    this.error,
  });

  final String label;
  final Widget child;
  final bool required;
  final String? helper;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final spacing = Theme.of(context).extension<AuroraSpacing>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: EdgeInsets.only(bottom: spacing.s1 * density.spaceScale),
          child: RichText(
            text: TextSpan(
              text: label,
              style: typography.label.copyWith(color: colors.neutral700),
              children: required
                  ? [
                      TextSpan(
                        text: ' *',
                        style: TextStyle(color: colors.danger600),
                      ),
                    ]
                  : null,
            ),
          ),
        ),
        child,
        if (error != null)
          Padding(
            padding: EdgeInsets.only(top: spacing.s1 * density.spaceScale),
            child: Text(
              error!,
              style: typography.bodySm.copyWith(color: colors.danger600),
            ),
          )
        else if (helper != null)
          Padding(
            padding: EdgeInsets.only(top: spacing.s1 * density.spaceScale),
            child: Text(
              helper!,
              style: typography.bodySm.copyWith(color: colors.neutral500),
            ),
          ),
      ],
    );
  }
}
