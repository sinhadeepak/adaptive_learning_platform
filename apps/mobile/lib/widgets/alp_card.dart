import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

/// Standard dark-theme content card. Uses the same surface tones as the web
/// dashboard so the mobile + web "AI-first chrome" reads as one product.
class AlpCard extends StatelessWidget {
  const AlpCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.borderColor,
    this.gradient,
    this.borderRadius = 14,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final Color? borderColor;
  final Gradient? gradient;
  final double borderRadius;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: padding,
      margin: margin,
      decoration: BoxDecoration(
        color: gradient == null ? AlpColors.bgSurface2 : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(
          color: borderColor ?? AlpColors.borderDefault,
          width: borderColor == null ? 1 : 1.2,
        ),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(borderRadius),
        onTap: onTap,
        child: card,
      ),
    );
  }
}

/// Coloured pill used for chips: "AI-POWERED", "PREMIUM", "MEDIUM" etc.
class AlpPill extends StatelessWidget {
  const AlpPill({
    super.key,
    required this.label,
    this.color,
    this.bg,
  });
  final String label;
  final Color? color;
  final Color? bg;

  @override
  Widget build(BuildContext context) {
    final fg = color ?? AlpColors.colorAi;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg ?? fg.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: fg,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

/// Section heading for tab content — "Quick Actions", "Subject Mastery", etc.
class AlpSectionHeading extends StatelessWidget {
  const AlpSectionHeading(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 18, 0, 10),
      child: Row(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AlpColors.textPrimary,
            ),
          ),
          const Spacer(),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
