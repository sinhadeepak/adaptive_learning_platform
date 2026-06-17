// AuroraDrawer — side drawer for secondary navigation.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.3 (layout)
//
// Mostly retired on mobile in favour of bottom nav + sheets, but kept
// for the marketplace switcher and debug menu where a vertical list of
// rarely-used surfaces is the right shape.
//
// Anatomy:
//   ┌──────────────────────────┐
//   │  Header                 │  ← required: title + optional avatar/badge
//   ├──────────────────────────┤
//   │  Section 1 title         │
//   │   row · row · row        │
//   ├──────────────────────────┤
//   │  Section 2 title         │
//   │   row · row              │
//   ├──────────────────────────┤
//   │  Footer                 │  ← optional: sign-out / version
//   └──────────────────────────┘
//
// Open with `Scaffold.of(context).openDrawer()` or pass into
// `AuroraScaffold.drawer:` slot.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraDrawerSection {
  const AuroraDrawerSection({
    this.title,
    required this.items,
  });

  final String? title;
  final List<AuroraDrawerItem> items;
}

class AuroraDrawerItem {
  const AuroraDrawerItem({
    required this.label,
    required this.icon,
    this.onTap,
    this.trailing,
    this.selected = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool selected;
}

class AuroraDrawer extends StatelessWidget {
  const AuroraDrawer({
    super.key,
    required this.header,
    required this.sections,
    this.footer,
    this.widthFraction = 0.82,
  });

  /// Top-of-drawer slot. Typically a tile with avatar + name + email.
  final Widget header;

  /// Sections rendered top to bottom with a divider between each.
  final List<AuroraDrawerSection> sections;

  /// Optional bottom slot (sign-out button, version stamp).
  final Widget? footer;

  /// Width as a fraction of the screen. Material spec is 0.85; we clamp
  /// at 0.82 to leave a peek strip of the body even on small phones.
  final double widthFraction;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final width = MediaQuery.of(context).size.width * widthFraction;

    return Drawer(
      width: width,
      backgroundColor: colors.neutral0,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(20)),
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.all(16 * density.spaceScale),
              child: header,
            ),
            Divider(height: 1, color: colors.neutral200),
            Expanded(
              child: ListView(
                padding: EdgeInsets.symmetric(
                  vertical: 8 * density.spaceScale,
                ),
                children: [
                  for (final section in sections) ...[
                    if (section.title != null)
                      Padding(
                        padding: EdgeInsets.fromLTRB(
                          20 * density.spaceScale,
                          16 * density.spaceScale,
                          20 * density.spaceScale,
                          4 * density.spaceScale,
                        ),
                        child: Text(
                          section.title!.toUpperCase(),
                          style: typography.overline.copyWith(
                            color: colors.neutral500,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ),
                    for (final item in section.items)
                      _DrawerRow(item: item),
                  ],
                ],
              ),
            ),
            if (footer != null) ...[
              Divider(height: 1, color: colors.neutral200),
              Padding(
                padding: EdgeInsets.all(16 * density.spaceScale),
                child: footer,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DrawerRow extends StatelessWidget {
  const _DrawerRow({required this.item});

  final AuroraDrawerItem item;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final selected = item.selected;
    final fg = selected ? colors.brand700 : colors.neutral800;
    final bg = selected ? colors.brand50 : Colors.transparent;

    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: 8 * density.spaceScale,
        vertical: 2 * density.spaceScale,
      ),
      child: Material(
        color: bg,
        borderRadius:
            BorderRadius.circular(radius.md * density.radiusScale),
        child: InkWell(
          onTap: item.onTap,
          borderRadius:
              BorderRadius.circular(radius.md * density.radiusScale),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: 12 * density.spaceScale,
              vertical: 10 * density.spaceScale,
            ),
            child: Row(
              children: [
                Icon(item.icon, color: fg, size: 20),
                SizedBox(width: 12 * density.spaceScale),
                Expanded(
                  child: Text(
                    item.label,
                    style: typography.body.copyWith(
                      color: fg,
                      fontWeight: selected
                          ? FontWeight.w600
                          : FontWeight.w500,
                    ),
                  ),
                ),
                if (item.trailing != null) item.trailing!,
              ],
            ),
          ),
        ),
      ),
    );
  }
}
