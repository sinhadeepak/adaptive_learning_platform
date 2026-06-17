// AuroraBottomNav — Aurora v2 5-slot bottom nav with optional raised
// center FAB-style slot.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §10.1
//
// Uses Material 3 NavigationBar — both platforms (iOS visual feel is
// close enough; a future iteration may switch to CupertinoTabBar on
// iOS via Theme.of(context).platform branching).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AuroraBottomNavItem {
  const AuroraBottomNavItem({
    required this.icon,
    this.selectedIcon,
    required this.label,
    this.badge,
    this.primary = false,
  });

  final IconData icon;
  final IconData? selectedIcon;
  final String label;

  /// Optional badge (numeric or dot) overlaid at the top-right.
  final Widget? badge;

  /// When true, this slot renders raised FAB-style with the Aurora-AI
  /// gradient. Use sparingly — one per bar (typically "Practice").
  final bool primary;
}

class AuroraBottomNav extends StatelessWidget {
  const AuroraBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final List<AuroraBottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;

    return NavigationBar(
      selectedIndex: currentIndex,
      onDestinationSelected: (i) {
        HapticFeedback.selectionClick();
        onTap(i);
      },
      backgroundColor: colors.neutral0,
      indicatorColor: colors.brand100,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      destinations: [
        for (final item in items)
          NavigationDestination(
            icon: _IconWithBadge(
              icon: Icon(item.icon, color: colors.neutral500),
              primary: item.primary,
              colors: colors,
              badge: item.badge,
            ),
            selectedIcon: _IconWithBadge(
              icon: Icon(item.selectedIcon ?? item.icon, color: colors.brand700),
              primary: item.primary,
              colors: colors,
              badge: item.badge,
              isSelected: true,
            ),
            label: item.label,
          ),
      ],
    );
  }
}

class _IconWithBadge extends StatelessWidget {
  const _IconWithBadge({
    required this.icon,
    required this.primary,
    required this.colors,
    this.badge,
    this.isSelected = false,
  });

  final Widget icon;
  final bool primary;
  final AuroraColors colors;
  final Widget? badge;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    Widget child = icon;
    if (primary) {
      child = Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          gradient: colors.auroraAi,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: colors.brand600.withValues(alpha: 0.30),
              blurRadius: 10,
              spreadRadius: 1,
            ),
          ],
        ),
        alignment: Alignment.center,
        child: IconTheme.merge(
          data: IconThemeData(color: colors.neutral0, size: 24),
          child: icon is Icon
              ? Icon(
                  (icon as Icon).icon,
                  color: colors.neutral0,
                  size: 24,
                )
              : icon,
        ),
      );
    }
    if (badge != null) {
      child = Stack(
        clipBehavior: Clip.none,
        children: [
          child,
          Positioned(top: -4, right: -6, child: badge!),
        ],
      );
    }
    return child;
  }
}
