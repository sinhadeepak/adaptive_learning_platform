// VidyaThetaReadout — live diagnostic readout card shown below the answer
// choices on VidyaScreeningQuizScreen during Phase 2f screening. Renders
// nothing when [theta] is null, so consumers can pass through unparsed
// backend responses without conditional rendering.

import 'package:flutter/material.dart';

import '../tokens.dart';
import 'vidya_card.dart';

class VidyaThetaReadout extends StatelessWidget {
  final double? theta;
  final double? previousTheta;
  final double? nextQB;
  final String narrative;

  const VidyaThetaReadout({
    super.key,
    required this.theta,
    required this.previousTheta,
    required this.nextQB,
    required this.narrative,
  });

  // Uses U+2212 MINUS SIGN (not hyphen) for consistency with typography.
  String _formatTheta(double v) {
    final sign = v < 0 ? '−' : '';
    return '$sign${v.abs().toStringAsFixed(2)}';
  }

  Widget? _trendIcon(Color color) {
    if (previousTheta == null || theta == null) return null;
    final delta = theta! - previousTheta!;
    if (delta.abs() < 0.05) return null;
    return Icon(
      delta > 0 ? Icons.arrow_upward : Icons.arrow_downward,
      size: 16,
      color: color,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (theta == null) return const SizedBox.shrink();
    final v = VidyaThemeData.of(context);
    final trend = _trendIcon(v.accent);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'LIVE θ READOUT',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                color: v.ink3,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Text(
                  'θ ${_formatTheta(theta!)}',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: v.ink,
                  ),
                ),
                if (trend != null) ...[
                  const SizedBox(width: 6),
                  trend,
                ],
                if (nextQB != null) ...[
                  const SizedBox(width: 10),
                  Text(
                    '·  Next Q diff ${nextQB!.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 12,
                      color: v.ink3,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 6),
            Text(
              narrative,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontStyle: FontStyle.italic,
                fontSize: 13,
                color: v.accent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
