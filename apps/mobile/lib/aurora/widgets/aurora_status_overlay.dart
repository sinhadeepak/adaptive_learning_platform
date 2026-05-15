// AuroraStatusOverlay — top-of-screen banner stack.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.3 (layout)
//
// Renders a stack of system-status banners at the top of every screen
// when needed. Use cases:
//   - Connectivity offline / reconnecting indicator.
//   - System status ("Maintenance window 02:00–04:00 IST").
//   - Debug-build banner (red strip in dev / staging APKs).
//
// Composition rule: each banner is a slim 32–40dp strip that pushes
// content down (does NOT overlay it, so accessibility focus order
// stays linear). When dismissed, the strip slides up with the standard
// Aurora `motion.base` curve.
//
// AuroraScaffold wires this above the AppBar via the `statusOverlay:`
// slot. The widget is intentionally a no-op when no entries are active.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraStatusKind { offline, reconnecting, maintenance, debug, info }

class AuroraStatusEntry {
  const AuroraStatusEntry({
    required this.kind,
    required this.message,
    this.action,
    this.dismissible = false,
  });

  final AuroraStatusKind kind;
  final String message;
  final Widget? action;
  final bool dismissible;
}

class AuroraStatusOverlay extends StatefulWidget {
  const AuroraStatusOverlay({
    super.key,
    required this.entries,
    this.onDismiss,
  });

  final List<AuroraStatusEntry> entries;
  final void Function(AuroraStatusEntry entry)? onDismiss;

  @override
  State<AuroraStatusOverlay> createState() => _AuroraStatusOverlayState();
}

class _AuroraStatusOverlayState extends State<AuroraStatusOverlay> {
  final _dismissed = <AuroraStatusEntry>{};

  @override
  Widget build(BuildContext context) {
    final visible = widget.entries
        .where((e) => !_dismissed.contains(e))
        .toList(growable: false);
    if (visible.isEmpty) return const SizedBox.shrink();

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final e in visible) _StatusStrip(entry: e, onDismiss: _onDismiss),
      ],
    );
  }

  void _onDismiss(AuroraStatusEntry e) {
    setState(() => _dismissed.add(e));
    widget.onDismiss?.call(e);
  }
}

class _StatusStrip extends StatelessWidget {
  const _StatusStrip({required this.entry, required this.onDismiss});

  final AuroraStatusEntry entry;
  final void Function(AuroraStatusEntry) onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final palette = _paletteFor(entry.kind, colors);

    return Semantics(
      liveRegion: entry.kind == AuroraStatusKind.offline ||
          entry.kind == AuroraStatusKind.maintenance,
      child: Material(
        color: palette.bg,
        child: SafeArea(
          bottom: false,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 32),
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: 16 * density.spaceScale,
                vertical: 6 * density.spaceScale,
              ),
              child: Row(
                children: [
                  Icon(_iconFor(entry.kind), size: 16, color: palette.fg),
                  SizedBox(width: 8 * density.spaceScale),
                  Expanded(
                    child: Text(
                      entry.message,
                      style: typography.bodySm.copyWith(
                        color: palette.fg,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (entry.action != null) ...[
                    SizedBox(width: 8 * density.spaceScale),
                    entry.action!,
                  ],
                  if (entry.dismissible) ...[
                    SizedBox(width: 4 * density.spaceScale),
                    InkResponse(
                      onTap: () => onDismiss(entry),
                      radius: 18,
                      child: Padding(
                        padding: const EdgeInsets.all(2),
                        child: Icon(Icons.close,
                            color: palette.fg, size: 16,),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  static IconData _iconFor(AuroraStatusKind k) => switch (k) {
        AuroraStatusKind.offline => Icons.wifi_off,
        AuroraStatusKind.reconnecting => Icons.sync,
        AuroraStatusKind.maintenance => Icons.build_circle_outlined,
        AuroraStatusKind.debug => Icons.bug_report_outlined,
        AuroraStatusKind.info => Icons.info_outline,
      };

  static _StatusPalette _paletteFor(AuroraStatusKind k, AuroraColors c) {
    switch (k) {
      case AuroraStatusKind.offline:
        return _StatusPalette(bg: c.neutral900, fg: c.neutral0);
      case AuroraStatusKind.reconnecting:
        return _StatusPalette(bg: c.developing500, fg: c.neutral900);
      case AuroraStatusKind.maintenance:
        return _StatusPalette(bg: c.developing600, fg: c.neutral0);
      case AuroraStatusKind.debug:
        return _StatusPalette(bg: c.danger600, fg: c.neutral0);
      case AuroraStatusKind.info:
        return _StatusPalette(bg: c.brand600, fg: c.neutral0);
    }
  }
}

class _StatusPalette {
  const _StatusPalette({required this.bg, required this.fg});
  final Color bg;
  final Color fg;
}
