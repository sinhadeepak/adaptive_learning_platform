import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaSparkline extends StatelessWidget {
  final List<double> values;
  final double strokeWidth;
  final Color? color;
  final Color? endDotColor;

  const VidyaSparkline({
    super.key,
    required this.values,
    this.strokeWidth = 1.5,
    this.color,
    this.endDotColor,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return CustomPaint(
      painter: _SparkPainter(
        values: values,
        stroke: color ?? v.accent,
        strokeWidth: strokeWidth,
        endDot: endDotColor,
      ),
      child: const SizedBox.expand(),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> values;
  final Color stroke;
  final double strokeWidth;
  final Color? endDot;

  _SparkPainter({
    required this.values,
    required this.stroke,
    required this.strokeWidth,
    required this.endDot,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final lo = values.reduce((a, b) => a < b ? a : b);
    final hi = values.reduce((a, b) => a > b ? a : b);
    final range = (hi - lo) == 0 ? 1.0 : (hi - lo);
    final dx = size.width / (values.length - 1);
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = i * dx;
      final y = size.height - ((values[i] - lo) / range) * size.height;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = stroke
        ..strokeWidth = strokeWidth
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    if (endDot != null) {
      final lastX = (values.length - 1) * dx;
      final lastY = size.height - ((values.last - lo) / range) * size.height;
      canvas.drawCircle(
        Offset(lastX, lastY),
        strokeWidth + 1.2,
        Paint()..color = endDot!,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) =>
      old.values != values || old.stroke != stroke || old.endDot != endDot;
}
