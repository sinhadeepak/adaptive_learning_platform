import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../tokens.dart';

class VidyaSigmoidIllustration extends StatelessWidget {
  final double theta;
  final double pAtTheta;
  final double thetaRange;

  const VidyaSigmoidIllustration({
    super.key,
    required this.theta,
    required this.pAtTheta,
    this.thetaRange = 3.0,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final thetaLabel = theta >= 0
        ? '+${theta.toStringAsFixed(2)}'
        : theta.toStringAsFixed(2);
    return LayoutBuilder(builder: (ctx, constraints) {
      return Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _SigmoidPainter(
                theta: theta,
                pAtTheta: pAtTheta,
                thetaRange: thetaRange,
                curveColor: v.accent,
                axisColor: v.ink3,
                gridColor: v.ink3.withValues(alpha: 0.15),
              ),
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            child: Text(
              'P(correct)',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                color: v.ink3,
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            right: 0,
            child: Text(
              'ability',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                color: v.ink3,
              ),
            ),
          ),
          Positioned(
            top: _markerY(constraints.maxHeight, pAtTheta) - 22,
            left: _markerX(constraints.maxWidth, theta, thetaRange) - 12,
            child: Text(
              'YOU @ $thetaLabel',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: v.accent,
              ),
            ),
          ),
        ],
      );
    });
  }

  double _markerX(double width, double t, double range) {
    const pad = 16.0;
    final usable = width - 2 * pad;
    return pad + ((t + range) / (2 * range)) * usable;
  }

  double _markerY(double height, double p) {
    const pad = 16.0;
    final usable = height - 2 * pad;
    return pad + (1 - p) * usable;
  }
}

class _SigmoidPainter extends CustomPainter {
  final double theta;
  final double pAtTheta;
  final double thetaRange;
  final Color curveColor;
  final Color axisColor;
  final Color gridColor;

  _SigmoidPainter({
    required this.theta,
    required this.pAtTheta,
    required this.thetaRange,
    required this.curveColor,
    required this.axisColor,
    required this.gridColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 16.0;
    final w = size.width - 2 * pad;
    final h = size.height - 2 * pad;

    final axisPaint = Paint()
      ..color = axisColor
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    canvas.drawLine(
      Offset(pad, pad + h),
      Offset(pad + w, pad + h),
      axisPaint,
    );
    canvas.drawLine(
      Offset(pad, pad),
      Offset(pad, pad + h),
      axisPaint,
    );

    final curvePaint = Paint()
      ..color = curveColor
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final path = Path();
    const steps = 100;
    for (var i = 0; i <= steps; i++) {
      final tFrac = i / steps;
      final t = -thetaRange + tFrac * 2 * thetaRange;
      final p = 1 / (1 + math.exp(-t));
      final x = pad + tFrac * w;
      final y = pad + (1 - p) * h;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, curvePaint);

    final markerX =
        pad + ((theta + thetaRange) / (2 * thetaRange)) * w;
    final markerY = pad + (1 - pAtTheta) * h;
    final dashPaint = Paint()
      ..color = curveColor.withValues(alpha: 0.5)
      ..strokeWidth = 1;
    const dash = 4.0, gap = 3.0;
    var y = pad + h;
    while (y > markerY) {
      final nextY = math.max(y - dash, markerY);
      canvas.drawLine(Offset(markerX, y), Offset(markerX, nextY), dashPaint);
      y = nextY - gap;
    }
    canvas.drawCircle(
      Offset(markerX, markerY),
      4,
      Paint()..color = curveColor,
    );
  }

  @override
  bool shouldRepaint(_SigmoidPainter old) =>
      old.theta != theta ||
      old.pAtTheta != pAtTheta ||
      old.thetaRange != thetaRange ||
      old.curveColor != curveColor ||
      old.axisColor != axisColor ||
      old.gridColor != gridColor;
}
