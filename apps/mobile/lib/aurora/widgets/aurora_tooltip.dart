// AuroraTooltip — Material Tooltip themed for Aurora. Long-press
// triggered on mobile; hover on devices with a pointer (iPad with
// Magic Keyboard, ChromeOS).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraTooltip extends StatelessWidget {
  const AuroraTooltip({
    super.key,
    required this.message,
    required this.child,
  });

  final String message;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Tooltip(
      message: message,
      preferBelow: false,
      textStyle: typography.bodySm.copyWith(color: colors.neutral0),
      decoration: BoxDecoration(
        color: colors.neutral900,
        borderRadius: BorderRadius.circular(8),
      ),
      child: child,
    );
  }
}
