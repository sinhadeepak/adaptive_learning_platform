import 'package:flutter/material.dart';

import '../tokens.dart';

enum VidyaLang { en, hi }

class VidyaLangToggle extends StatelessWidget {
  final VidyaLang value;
  final ValueChanged<VidyaLang> onChanged;

  const VidyaLangToggle({
    super.key,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: v.ink3.withValues(alpha: 0.2), width: 1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Segment(
            label: 'EN',
            selected: value == VidyaLang.en,
            onTap: () {
              if (value != VidyaLang.en) onChanged(VidyaLang.en);
            },
          ),
          Container(width: 1, height: 18, color: v.ink3.withValues(alpha: 0.2)),
          _Segment(
            label: 'हि',
            selected: value == VidyaLang.hi,
            onTap: () {
              if (value != VidyaLang.hi) onChanged(VidyaLang.hi);
            },
          ),
        ],
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(7),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: selected ? v.ink : v.ink3,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}
