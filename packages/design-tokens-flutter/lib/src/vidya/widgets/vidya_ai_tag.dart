// The ONLY place gold is used as a primary color in the system.
// See ADR-0034 §4.
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaAiTag extends StatelessWidget {
  final String label;
  const VidyaAiTag({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: v.gold, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 10.5,
            fontWeight: FontWeight.w500,
            letterSpacing: 1.2,
            color: v.gold2,
          ),
        ),
      ],
    );
  }
}
