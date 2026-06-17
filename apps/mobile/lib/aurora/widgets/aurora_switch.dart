// AuroraSwitch — Aurora v2 toggle.
// Platform-adaptive: CupertinoSwitch on iOS, Material Switch on Android.
// Both tinted brand-600 via theme.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class AuroraSwitch extends StatelessWidget {
  const AuroraSwitch({
    super.key,
    required this.value,
    required this.onChanged,
    this.semanticLabel,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final isIOS = Theme.of(context).platform == TargetPlatform.iOS;
    final child = isIOS
        ? CupertinoSwitch(
            value: value,
            onChanged: onChanged,
            activeTrackColor: colors.brand600,
          )
        : Switch(value: value, onChanged: onChanged);
    return Semantics(label: semanticLabel, toggled: value, child: child);
  }
}
