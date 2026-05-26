// VidyaBottomNav — 5-tab bottom navigation primitive used by VidyaMainShell.
// Stateless: caller owns the active tab and tap callback. Tab order
// (home, study, practice, insights, more) is locked via the
// VidyaShellTab enum so IndexedStack indexes align with the enum index.

import 'package:flutter/material.dart';

import '../tokens.dart';

enum VidyaShellTab { home, study, practice, insights, more }

class VidyaBottomNav extends StatelessWidget {
  final VidyaShellTab active;
  final ValueChanged<VidyaShellTab> onTap;

  const VidyaBottomNav({
    super.key,
    required this.active,
    required this.onTap,
  });

  static const _items = <_Spec>[
    _Spec(tab: VidyaShellTab.home, label: 'HOME', icon: Icons.home_outlined),
    _Spec(
        tab: VidyaShellTab.study,
        label: 'STUDY',
        icon: Icons.menu_book_outlined),
    _Spec(
        tab: VidyaShellTab.practice,
        label: 'PRACTICE',
        icon: Icons.bolt_outlined),
    _Spec(
        tab: VidyaShellTab.insights,
        label: 'INSIGHTS',
        icon: Icons.insights_outlined),
    _Spec(
        tab: VidyaShellTab.more,
        label: 'MORE',
        icon: Icons.more_horiz_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      decoration: BoxDecoration(
        color: v.paper,
        border: Border(
          top: BorderSide(color: v.ink3.withValues(alpha: 0.10)),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 68,
          child: Row(
            children: _items
                .map((s) => Expanded(
                      child: _Item(
                        spec: s,
                        active: active == s.tab,
                        onTap: () => onTap(s.tab),
                      ),
                    ))
                .toList(),
          ),
        ),
      ),
    );
  }
}

class _Spec {
  final VidyaShellTab tab;
  final String label;
  final IconData icon;
  const _Spec({required this.tab, required this.label, required this.icon});
}

class _Item extends StatelessWidget {
  final _Spec spec;
  final bool active;
  final VoidCallback onTap;
  const _Item({
    required this.spec,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final colour = active ? v.accent : v.ink3;
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            spec.icon,
            size: 24,
            color: colour,
            key: Key('vidya.nav.icon.${spec.tab.name}'),
          ),
          const SizedBox(height: 4),
          Text(
            spec.label,
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 10,
              color: colour,
              letterSpacing: 1.2,
              fontWeight: active ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}
