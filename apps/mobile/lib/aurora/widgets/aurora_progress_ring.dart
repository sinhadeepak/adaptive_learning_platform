// AuroraProgressRing — Aurora v2 circular progress with center label.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// CustomPainter-drawn; lighter than rasterised gauge widgets and
// scales crisply at any size. Used for mastery rings everywhere
// (Topic Detail, Catalog Exam, Profile, Resume practice, Mission).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraProgressRingTone { neutral, weak, developing, strong, mastered, aurora }

class AuroraProgressRing extends StatelessWidget {
  const AuroraProgressRing({
    super.key,
    required this.value,
    this.size = 56,
    this.thickness = 6,
    this.tone = AuroraProgressRingTone.neutral,
    this.child,
  });

  /// Progress in `[0, 1]`. Values outside the range clamp.
  final double value;

  /// Outer dimension in dp.
  final double size;

  /// Stroke width in dp.
  final double thickness;

  final AuroraProgressRingTone tone;

  /// Optional content rendered in the ring center — typically a
  /// `Text` showing the percentage or a small icon.
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final track = colors.neutral200;
    final stroke = switch (tone) {
      AuroraProgressRingTone.weak => colors.danger500,
      AuroraProgressRingTone.developing => colors.developing500,
      AuroraProgressRingTone.strong => colors.success500,
      AuroraProgressRingTone.mastered => colors.success500, // gradient handled via overlay below
      AuroraProgressRingTone.aurora => colors.brand600,
      AuroraProgressRingTone.neutral => colors.neutral500,
    };

    return Semantics(
      label: 'progress',
      value: '${(value.clamp(0.0, 1.0) * 100).round()} percent',
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            CustomPaint(
              size: Size(size, size),
              painter: _RingPainter(
                value: value.clamp(0.0, 1.0),
                track: track,
                stroke: stroke,
                thickness: thickness,
              ),
            ),
            if (child != null) child!,
          ],
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.value,
    required this.track,
    required this.stroke,
    required this.thickness,
  });

  final double value;
  final Color track;
  final Color stroke;
  final double thickness;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - thickness) / 2;

    final trackPaint = Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness;
    canvas.drawCircle(center, radius, trackPaint);

    if (value <= 0) return;

    final progressPaint = Paint()
      ..color = stroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness
      ..strokeCap = StrokeCap.round;
    // -pi/2 starts at 12 o'clock. Sweep clockwise.
    const startAngle = -1.5707963267948966; // -pi/2
    final sweep = 6.283185307179586 * value; // 2*pi * value
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweep,
      false,
      progressPaint,
    );
  }

  @override
  bool shouldRepaint(_RingPainter oldDelegate) =>
      oldDelegate.value != value ||
      oldDelegate.track != track ||
      oldDelegate.stroke != stroke ||
      oldDelegate.thickness != thickness;
}
