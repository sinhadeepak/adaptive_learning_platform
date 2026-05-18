import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaAvatar extends StatelessWidget {
  final String initials;
  final String? imageUrl;
  final double size;

  const VidyaAvatar({
    super.key,
    required this.initials,
    this.imageUrl,
    this.size = 36,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: v.accentSoft,
        shape: BoxShape.circle,
        image: imageUrl != null
            ? DecorationImage(image: NetworkImage(imageUrl!), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: imageUrl != null
          ? null
          : Text(
              initials,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: size * 0.38,
                fontWeight: FontWeight.w600,
                color: v.accent,
              ),
            ),
    );
  }
}
