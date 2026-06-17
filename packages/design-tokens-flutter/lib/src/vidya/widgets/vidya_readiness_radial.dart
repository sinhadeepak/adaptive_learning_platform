import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../tokens.dart';

class VidyaReadinessRadial extends StatelessWidget {
  final String eyebrow;
  final int value;
  final int max;

  const VidyaReadinessRadial({
    super.key,
    required this.eyebrow,
    required this.value,
    required this.max,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final clampedFraction = (value.toDouble() / math.max(max, 1))
        .clamp(0.0, 1.0)
        .toDouble();

    return AspectRatio(
      aspectRatio: 1,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _RadialPainter(
                fraction: clampedFraction,
                trackColor: v.ink3.withValues(alpha: 0.15),
                arcColor: v.accent,
              ),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                eyebrow,
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.5,
                  color: v.ink3,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '$value',
                style: TextStyle(
                  fontFamily: VidyaFonts.display,
                  fontSize: 44,
                  fontWeight: FontWeight.w500,
                  color: v.ink,
                  height: 1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '/ $max',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: v.ink3,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RadialPainter extends CustomPainter {
  final double fraction;
  final Color trackColor;
  final Color arcColor;

  _RadialPainter({
    required this.fraction,
    required this.trackColor,
    required this.arcColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 6.0;
    final radius = math.min(size.width, size.height) / 2 - stroke;
    final center = Offset(size.width / 2, size.height / 2);

    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, trackPaint);

    if (fraction > 0) {
      final arcPaint = Paint()
        ..color = arcColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2,
        2 * math.pi * fraction,
        false,
        arcPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_RadialPainter old) =>
      old.fraction != fraction ||
      old.trackColor != trackColor ||
      old.arcColor != arcColor;
}
