import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaChipTone { neutral, accent }

class VidyaChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final IconData? leadingIcon;
  final VidyaChipTone tone;

  const VidyaChip({
    super.key,
    required this.label,
    this.selected = false,
    this.onTap,
    this.leadingIcon,
    this.tone = VidyaChipTone.neutral,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final Color bg;
    final Color fg;
    final Color border;
    if (selected) {
      bg = v.accentSoft;
      fg = v.accent;
      border = v.accent;
    } else if (tone == VidyaChipTone.accent) {
      bg = v.accentSoft;
      fg = v.accent;
      border = v.accentSoft;
    } else {
      bg = v.paper2;
      fg = v.ink2;
      border = v.rule;
    }
    return Material(
      color: bg,
      borderRadius: const BorderRadius.all(VidyaRadius.pill),
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.all(VidyaRadius.pill),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.all(VidyaRadius.pill),
            border: Border.all(color: border, width: 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (leadingIcon != null) ...[
                Icon(leadingIcon, size: 14, color: fg),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: fg,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
