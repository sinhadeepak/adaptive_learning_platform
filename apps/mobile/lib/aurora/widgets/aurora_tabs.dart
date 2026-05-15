// AuroraTabs — Aurora v2 tabs. Three variants: underlined (default),
// pill, segmented. State managed externally for full control.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

enum AuroraTabsVariant { underlined, pill, segmented }

class AuroraTabs extends StatelessWidget {
  const AuroraTabs({
    super.key,
    required this.tabs,
    required this.currentIndex,
    required this.onChanged,
    this.variant = AuroraTabsVariant.underlined,
  });

  final List<String> tabs;
  final int currentIndex;
  final ValueChanged<int> onChanged;
  final AuroraTabsVariant variant;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    if (variant == AuroraTabsVariant.segmented) {
      return _Segmented(
        tabs: tabs,
        currentIndex: currentIndex,
        onChanged: onChanged,
        colors: colors,
        typography: typography,
      );
    }
    return _UnderlinedOrPill(
      tabs: tabs,
      currentIndex: currentIndex,
      onChanged: onChanged,
      colors: colors,
      typography: typography,
      pill: variant == AuroraTabsVariant.pill,
    );
  }
}

class _UnderlinedOrPill extends StatelessWidget {
  const _UnderlinedOrPill({
    required this.tabs,
    required this.currentIndex,
    required this.onChanged,
    required this.colors,
    required this.typography,
    required this.pill,
  });

  final List<String> tabs;
  final int currentIndex;
  final ValueChanged<int> onChanged;
  final AuroraColors colors;
  final AuroraTypography typography;
  final bool pill;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: tabs.length,
      initialIndex: currentIndex,
      child: Container(
        decoration: pill
            ? null
            : BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: colors.neutral200),
                ),
              ),
        child: Row(
          children: [
            for (var i = 0; i < tabs.length; i++)
              Expanded(
                child: InkWell(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onChanged(i);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: pill && i == currentIndex
                          ? colors.brand100
                          : Colors.transparent,
                      borderRadius:
                          pill ? BorderRadius.circular(9999) : null,
                      border: !pill
                          ? Border(
                              bottom: BorderSide(
                                color: i == currentIndex
                                    ? colors.brand600
                                    : Colors.transparent,
                                width: 2,
                              ),
                            )
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      tabs[i],
                      style: typography.body.copyWith(
                        color: i == currentIndex
                            ? (pill ? colors.brand700 : colors.brand600)
                            : colors.neutral600,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({
    required this.tabs,
    required this.currentIndex,
    required this.onChanged,
    required this.colors,
    required this.typography,
  });

  final List<String> tabs;
  final int currentIndex;
  final ValueChanged<int> onChanged;
  final AuroraColors colors;
  final AuroraTypography typography;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: colors.neutral100,
        borderRadius: BorderRadius.circular(9999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < tabs.length; i++)
            GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                onChanged(i);
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: i == currentIndex
                      ? colors.neutral0
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(9999),
                  boxShadow: i == currentIndex
                      ? [
                          BoxShadow(
                            color: colors.neutral900.withValues(alpha: 0.08),
                            blurRadius: 4,
                            offset: const Offset(0, 1),
                          ),
                        ]
                      : null,
                ),
                child: Text(
                  tabs[i],
                  style: typography.bodySm.copyWith(
                    color: i == currentIndex
                        ? colors.neutral900
                        : colors.neutral600,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
