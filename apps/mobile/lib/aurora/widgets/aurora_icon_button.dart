// AuroraIconButton — Aurora v2 icon button. Mandatory semanticLabel
// because icon-only buttons are otherwise invisible to screen readers.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AuroraIconButton extends StatelessWidget {
  const AuroraIconButton({
    super.key,
    required this.icon,
    required this.semanticLabel,
    this.onPressed,
    this.size = 40,
    this.tone = AuroraIconButtonTone.neutral,
    this.haptic = true,
  });

  final Widget icon;
  final String semanticLabel;
  final VoidCallback? onPressed;
  final double size;
  final AuroraIconButtonTone tone;
  final bool haptic;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final dim = size < density.touchTarget ? density.touchTarget : size;
    final fg = switch (tone) {
      AuroraIconButtonTone.brand => colors.brand600,
      AuroraIconButtonTone.danger => colors.danger600,
      AuroraIconButtonTone.neutral => colors.neutral700,
    };
    return Semantics(
      button: true,
      label: semanticLabel,
      child: SizedBox(
        width: dim,
        height: dim,
        child: IconButton(
          icon: icon,
          onPressed: onPressed == null
              ? null
              : () {
                  if (haptic) HapticFeedback.lightImpact();
                  onPressed!();
                },
          color: fg,
          splashRadius: dim / 2,
          tooltip: semanticLabel,
        ),
      ),
    );
  }
}

enum AuroraIconButtonTone { neutral, brand, danger }
