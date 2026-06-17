import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaMasteryBucket { none, weak, dev, strong, mastered }

class VidyaMasteryBar extends StatelessWidget {
  final String label;
  final double value;
  final VidyaMasteryBucket bucket;
  final String? pct;
  final Color? leadingDotColor;

  const VidyaMasteryBar({
    super.key,
    required this.label,
    required this.value,
    required this.bucket,
    this.pct,
    this.leadingDotColor,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final fillColor = switch (bucket) {
      VidyaMasteryBucket.none => v.mNone,
      VidyaMasteryBucket.weak => v.mWeak,
      VidyaMasteryBucket.dev => v.mDev,
      VidyaMasteryBucket.strong => v.mStrong,
      VidyaMasteryBucket.mastered => v.mMastered,
    };
    final v01 = value.clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (leadingDotColor != null) ...[
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: leadingDotColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(child: Text(label, style: VidyaText.body(v.ink))),
            if (pct != null) Text(pct!, style: VidyaText.mono(v.ink3)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: const BorderRadius.all(VidyaRadius.pill),
          child: Stack(
            children: [
              Container(height: 5, color: v.mNone),
              FractionallySizedBox(
                widthFactor: v01,
                child: Container(height: 5, color: fillColor),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
