import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaSheet extends StatelessWidget {
  final String? title;
  final Widget child;
  final EdgeInsetsGeometry? padding;

  const VidyaSheet({
    super.key,
    this.title,
    required this.child,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      decoration: BoxDecoration(
        color: v.card,
        borderRadius: const BorderRadius.vertical(top: VidyaRadius.xl),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: padding ?? EdgeInsets.all(v.density.cardP),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: v.rule2,
                    borderRadius: const BorderRadius.all(VidyaRadius.pill),
                  ),
                ),
              ),
              if (title != null) ...[
                const SizedBox(height: 16),
                Text(title!, style: VidyaText.displayXs(v.ink)),
              ],
              const SizedBox(height: 16),
              child,
            ],
          ),
        ),
      ),
    );
  }
}
