// AuroraChip — Aurora v2 filter chip (selectable). Distinct from
// AuroraTag (informational pill) — chips are interactive.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraChip extends StatelessWidget {
  const AuroraChip({
    super.key,
    required this.label,
    this.selected = false,
    this.onTap,
    this.iconLeft,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final Widget? iconLeft;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final bg = selected ? colors.brand100 : colors.neutral50;
    final fg = selected ? colors.brand700 : colors.neutral700;
    final border = selected ? colors.brand500 : colors.neutral300;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(9999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9999),
        splashColor: colors.brand500.withValues(alpha: 0.15),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: border),
            borderRadius: BorderRadius.circular(9999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (iconLeft != null) ...[
                IconTheme(
                  data: IconThemeData(color: fg, size: 16),
                  child: iconLeft!,
                ),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: typography.bodySm.copyWith(
                  color: fg,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
