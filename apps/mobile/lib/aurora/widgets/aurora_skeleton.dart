// AuroraSkeleton — Aurora v2 shimmer skeleton.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.1
//
// Three shapes (text / rectangle / circle). Shimmer is a linear
// gradient sweep animated 1.4s ease-in-out. Honors
// `MediaQuery.disableAnimations` (Reduce Motion) — when on, freezes
// the gradient at its midpoint so the skeleton is still visible
// without motion.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraSkeletonShape { text, rectangle, circle }

class AuroraSkeleton extends StatefulWidget {
  const AuroraSkeleton({
    super.key,
    this.shape = AuroraSkeletonShape.rectangle,
    this.width,
    this.height,
  });

  final AuroraSkeletonShape shape;
  final double? width;
  final double? height;

  @override
  State<AuroraSkeleton> createState() => _AuroraSkeletonState();
}

class _AuroraSkeletonState extends State<AuroraSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    final width = widget.width ??
        switch (widget.shape) {
          AuroraSkeletonShape.text => double.infinity,
          AuroraSkeletonShape.rectangle => double.infinity,
          AuroraSkeletonShape.circle => 40.0,
        };
    final height = widget.height ??
        switch (widget.shape) {
          AuroraSkeletonShape.text => 14.0,
          AuroraSkeletonShape.rectangle => 24.0,
          AuroraSkeletonShape.circle => 40.0,
        };

    final shape = switch (widget.shape) {
      AuroraSkeletonShape.text => BorderRadius.circular(radius.sm * density.radiusScale),
      AuroraSkeletonShape.rectangle =>
        BorderRadius.circular(radius.md * density.radiusScale),
      AuroraSkeletonShape.circle => BorderRadius.circular(9999),
    };

    return Semantics(
      label: 'Loading',
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final t = reduceMotion ? 0.5 : _controller.value;
          // Sweep the highlight band across the rectangle.
          final shift = (t - 0.5) * 2; // -1 → +1
          return Container(
            width: width,
            height: height,
            decoration: BoxDecoration(
              borderRadius: shape,
              gradient: LinearGradient(
                begin: Alignment(-1 + shift, 0),
                end: Alignment(1 + shift, 0),
                colors: [
                  colors.neutral100,
                  colors.neutral200,
                  colors.neutral100,
                ],
                stops: const [0, 0.5, 1],
              ),
            ),
          );
        },
      ),
    );
  }
}
