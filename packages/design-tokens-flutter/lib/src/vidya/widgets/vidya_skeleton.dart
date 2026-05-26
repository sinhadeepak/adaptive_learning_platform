// VidyaSkeletonBlock — static placeholder shape for loading states.
// Deliberately not animated: a shimmer would require an
// AnimationController that never settles, breaking pumpAndSettle in
// widget tests. The static block is also less visually noisy than a
// shimmer when the underlying fetch resolves in <300ms.

import 'package:flutter/material.dart';

import '../tokens.dart';

class VidyaSkeletonBlock extends StatelessWidget {
  final double? width;
  final double height;
  final BorderRadius? borderRadius;

  const VidyaSkeletonBlock({
    super.key,
    this.width,
    required this.height,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: v.ink3.withValues(alpha: 0.10),
        borderRadius: borderRadius ?? BorderRadius.circular(8),
      ),
    );
  }
}
