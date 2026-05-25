import 'package:flutter/material.dart';

import '../tokens.dart';

class VidyaTopicAllocation {
  final String name;
  final int percent;
  final bool accent;

  const VidyaTopicAllocation({
    required this.name,
    required this.percent,
    this.accent = false,
  });
}

class VidyaTopicAllocationBar extends StatelessWidget {
  final List<VidyaTopicAllocation> items;

  const VidyaTopicAllocationBar({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          _Row(
            item: items[i],
            accentColor: v.accent,
            trackColor: v.ink3.withValues(alpha: 0.12),
            nameColor: v.ink,
            mutedColor: v.ink3,
          ),
          if (i < items.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _Row extends StatelessWidget {
  final VidyaTopicAllocation item;
  final Color accentColor;
  final Color trackColor;
  final Color nameColor;
  final Color mutedColor;
  const _Row({
    required this.item,
    required this.accentColor,
    required this.trackColor,
    required this.nameColor,
    required this.mutedColor,
  });

  @override
  Widget build(BuildContext context) {
    final pct = (item.percent.clamp(0, 100)) / 100.0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: item.accent
            ? accentColor.withValues(alpha: 0.10)
            : trackColor,
        borderRadius: BorderRadius.circular(10),
        border: item.accent
            ? Border.all(color: accentColor.withValues(alpha: 0.4), width: 1)
            : null,
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: FractionallySizedBox(
                widthFactor: pct,
                alignment: Alignment.centerLeft,
                child: Container(
                  color: item.accent
                      ? accentColor.withValues(alpha: 0.18)
                      : accentColor.withValues(alpha: 0.10),
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  item.name,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 14,
                    fontWeight:
                        item.accent ? FontWeight.w600 : FontWeight.w500,
                    color: nameColor,
                  ),
                ),
              ),
              Text(
                '${item.percent}%',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 13,
                  color: item.accent ? accentColor : mutedColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
