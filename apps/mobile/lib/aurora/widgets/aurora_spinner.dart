// AuroraSpinner — Aurora v2 platform-adaptive spinner.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.1
//
// iOS: CupertinoActivityIndicator (gray spinner — native feel).
// Android (everywhere else): CircularProgressIndicator tinted brand-600.
// Both honor `MediaQuery.disableAnimations`.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class AuroraSpinner extends StatelessWidget {
  const AuroraSpinner({super.key, this.size = 24, this.color});

  /// Outer dimension in dp.
  final double size;

  /// Override the spinner color. Defaults to brand-600 on Android,
  /// gray on iOS (Cupertino-canonical).
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final isIOS = Theme.of(context).platform == TargetPlatform.iOS;
    if (isIOS) {
      return SizedBox(
        width: size,
        height: size,
        child: CupertinoActivityIndicator(
          radius: size / 2,
          color: color, // null = native gray
        ),
      );
    }
    return SizedBox(
      width: size,
      height: size,
      child: CircularProgressIndicator(
        strokeWidth: size <= 20 ? 2 : 2.5,
        valueColor: AlwaysStoppedAnimation<Color>(color ?? colors.brand600),
      ),
    );
  }
}
