// AuroraAccordion — themed expansion molecule for syllabus / FAQ.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.2 (molecule)
//
// Composes Material's `ExpansionTile` with Aurora tokens. Single-tile
// (one open at a time) and group (`AuroraAccordionGroup`) flavours.
//
// Two visual variants:
//   - flat   — no card chrome; flush with surrounding content.
//   - card   — bordered card per tile; suitable for FAQ.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraAccordionVariant { flat, card }

class AuroraAccordion extends StatefulWidget {
  const AuroraAccordion({
    super.key,
    required this.title,
    required this.children,
    this.subtitle,
    this.leading,
    this.initiallyExpanded = false,
    this.variant = AuroraAccordionVariant.flat,
    this.onExpansionChanged,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final List<Widget> children;
  final bool initiallyExpanded;
  final AuroraAccordionVariant variant;
  final ValueChanged<bool>? onExpansionChanged;

  @override
  State<AuroraAccordion> createState() => _AuroraAccordionState();
}

class _AuroraAccordionState extends State<AuroraAccordion> {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final tile = Theme(
      // Strip the default divider lines ExpansionTile inherits from
      // ListTileTheme — Aurora draws its own borders.
      data: Theme.of(context).copyWith(
        dividerColor: Colors.transparent,
        splashColor: colors.brand500.withValues(alpha: 0.10),
      ),
      child: ExpansionTile(
        key: PageStorageKey(widget.title),
        initiallyExpanded: widget.initiallyExpanded,
        leading: widget.leading,
        title: Text(widget.title, style: typography.h4),
        subtitle: widget.subtitle == null
            ? null
            : Text(
                widget.subtitle!,
                style:
                    typography.bodySm.copyWith(color: colors.neutral600),
              ),
        iconColor: colors.brand600,
        collapsedIconColor: colors.neutral500,
        tilePadding: EdgeInsets.symmetric(
          horizontal: 16 * density.spaceScale,
          vertical: 4 * density.spaceScale,
        ),
        childrenPadding: EdgeInsets.fromLTRB(
          16 * density.spaceScale,
          0,
          16 * density.spaceScale,
          12 * density.spaceScale,
        ),
        onExpansionChanged: (v) {
          setState(() => _expanded = v);
          widget.onExpansionChanged?.call(v);
        },
        children: widget.children,
      ),
    );

    if (widget.variant == AuroraAccordionVariant.flat) return tile;

    return AnimatedContainer(
      duration: Theme.of(context).extension<AuroraMotion>()!.fast,
      decoration: BoxDecoration(
        color: colors.neutral0,
        borderRadius: BorderRadius.circular(radius.md * density.radiusScale),
        border: Border.all(
          color: _expanded ? colors.brand100 : colors.neutral200,
        ),
      ),
      child: ClipRRect(
        borderRadius:
            BorderRadius.circular(radius.md * density.radiusScale),
        child: tile,
      ),
    );
  }
}

/// Group container that lays out a list of [AuroraAccordion] tiles with
/// consistent spacing. Single-open behaviour is opt-in via [singleOpen].
class AuroraAccordionGroup extends StatefulWidget {
  const AuroraAccordionGroup({
    super.key,
    required this.tiles,
    this.singleOpen = false,
  });

  final List<AuroraAccordion> tiles;
  final bool singleOpen;

  @override
  State<AuroraAccordionGroup> createState() => _AuroraAccordionGroupState();
}

class _AuroraAccordionGroupState extends State<AuroraAccordionGroup> {
  int? _openIndex;

  @override
  Widget build(BuildContext context) {
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final gap = 8.0 * density.spaceScale;

    if (!widget.singleOpen) {
      return Column(
        children: [
          for (var i = 0; i < widget.tiles.length; i++) ...[
            widget.tiles[i],
            if (i < widget.tiles.length - 1) SizedBox(height: gap),
          ],
        ],
      );
    }

    return Column(
      children: [
        for (var i = 0; i < widget.tiles.length; i++) ...[
          AuroraAccordion(
            title: widget.tiles[i].title,
            subtitle: widget.tiles[i].subtitle,
            leading: widget.tiles[i].leading,
            variant: widget.tiles[i].variant,
            initiallyExpanded: _openIndex == i,
            onExpansionChanged: (open) {
              setState(() => _openIndex = open ? i : null);
            },
            children: widget.tiles[i].children,
          ),
          if (i < widget.tiles.length - 1) SizedBox(height: gap),
        ],
      ],
    );
  }
}
