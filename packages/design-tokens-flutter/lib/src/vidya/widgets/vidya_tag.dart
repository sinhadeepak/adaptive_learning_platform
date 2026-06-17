import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaTag extends StatelessWidget {
  final String label;
  final Color? subjectColor;
  final Color? bucketColor;

  const VidyaTag({
    super.key,
    required this.label,
    this.subjectColor,
    this.bucketColor,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final dot = subjectColor ?? bucketColor;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: v.paper2,
        borderRadius: const BorderRadius.all(VidyaRadius.sm),
        border: Border.all(color: v.rule),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot != null) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontSize: 12,
              color: v.ink2,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
