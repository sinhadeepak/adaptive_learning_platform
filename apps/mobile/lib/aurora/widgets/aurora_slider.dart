// AuroraSlider — Aurora v2 slider. Used for confidence rating
// after answers + daily-goal picker in Settings.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class AuroraSlider extends StatelessWidget {
  const AuroraSlider({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 0,
    this.max = 1,
    this.divisions,
    this.label,
  });

  final double value;
  final ValueChanged<double>? onChanged;
  final double min;
  final double max;
  final int? divisions;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final isIOS = Theme.of(context).platform == TargetPlatform.iOS;
    if (isIOS) {
      return CupertinoSlider(
        value: value,
        onChanged: onChanged,
        min: min,
        max: max,
        divisions: divisions,
        activeColor: colors.brand600,
      );
    }
    return Slider(
      value: value,
      onChanged: onChanged,
      min: min,
      max: max,
      divisions: divisions,
      label: label,
      activeColor: colors.brand600,
      inactiveColor: colors.neutral200,
    );
  }
}
