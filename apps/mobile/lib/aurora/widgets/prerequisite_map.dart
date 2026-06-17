// PrerequisiteMap — concept-graph visualisation for Topic Detail.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Renders the prerequisite DAG for a topic. Spec mentions `graphview`
// or custom `CustomPainter`; we ship a CustomPainter implementation so
// no third-party dependency is added without an ADR.
//
// Layout: simple level-based topological sort. Caller supplies nodes
// and `prerequisiteOf` edges (parent → child).
//
// Interactivity: tap a node to drill — the tap target is the visible
// circle; hit-testing happens in the painter via a hit-rect map.

import 'dart:math' as math;

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_card.dart';

class PrereqNode {
  const PrereqNode({
    required this.id,
    required this.label,
    required this.ewa,
    this.subjectColor,
  });

  final String id;
  final String label;

  /// EWA in `[0,1]` — drives the node color.
  final double ewa;
  final Color? subjectColor;
}

class PrereqEdge {
  const PrereqEdge({required this.from, required this.to});
  final String from; // id
  final String to; // id
}

class PrerequisiteMap extends StatefulWidget {
  const PrerequisiteMap({
    super.key,
    required this.nodes,
    required this.edges,
    required this.focusId,
    this.onTapNode,
    this.height = 220,
  });

  /// All nodes in the graph. The widget computes levels via Kahn's
  /// topological sort; if a cycle is detected, remaining nodes pile
  /// in the final level.
  final List<PrereqNode> nodes;
  final List<PrereqEdge> edges;

  /// The "current" node — rendered with a thicker outline.
  final String focusId;

  final void Function(PrereqNode node)? onTapNode;
  final double height;

  @override
  State<PrerequisiteMap> createState() => _PrerequisiteMapState();
}

class _PrerequisiteMapState extends State<PrerequisiteMap> {
  late List<List<PrereqNode>> _levels;

  @override
  void initState() {
    super.initState();
    _levels = _layerize(widget.nodes, widget.edges);
  }

  @override
  void didUpdateWidget(covariant PrerequisiteMap old) {
    super.didUpdateWidget(old);
    if (old.nodes != widget.nodes || old.edges != widget.edges) {
      _levels = _layerize(widget.nodes, widget.edges);
    }
  }

  static List<List<PrereqNode>> _layerize(
    List<PrereqNode> nodes,
    List<PrereqEdge> edges,
  ) {
    final byId = {for (final n in nodes) n.id: n};
    final inDeg = <String, int>{for (final n in nodes) n.id: 0};
    final out = <String, List<String>>{for (final n in nodes) n.id: []};
    for (final e in edges) {
      if (byId.containsKey(e.from) && byId.containsKey(e.to)) {
        inDeg[e.to] = (inDeg[e.to] ?? 0) + 1;
        out[e.from]!.add(e.to);
      }
    }
    final levels = <List<PrereqNode>>[];
    var frontier =
        inDeg.entries.where((e) => e.value == 0).map((e) => e.key).toList();
    final seen = <String>{};
    while (frontier.isNotEmpty) {
      levels.add([for (final id in frontier) byId[id]!]);
      seen.addAll(frontier);
      final next = <String>[];
      for (final id in frontier) {
        for (final to in out[id]!) {
          inDeg[to] = inDeg[to]! - 1;
          if (inDeg[to] == 0) next.add(to);
        }
      }
      frontier = next;
    }
    final remaining = nodes.where((n) => !seen.contains(n.id)).toList();
    if (remaining.isNotEmpty) levels.add(remaining);
    return levels;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;

    return AuroraCard(
      padding: AuroraCardPadding.md,
      semanticLabel:
          'Prerequisite map with ${widget.nodes.length} concepts.',
      child: SizedBox(
        height: widget.height,
        child: LayoutBuilder(
          builder: (ctx, c) {
            final positions = _positions(c.maxWidth, c.maxHeight);
            return GestureDetector(
              onTapUp: (d) {
                for (final entry in positions.entries) {
                  final r = entry.value.inflate(4);
                  if (r.contains(d.localPosition)) {
                    final node = widget.nodes
                        .firstWhere((n) => n.id == entry.key);
                    widget.onTapNode?.call(node);
                    return;
                  }
                }
              },
              child: CustomPaint(
                size: Size(c.maxWidth, c.maxHeight),
                painter: _GraphPainter(
                  nodes: widget.nodes,
                  edges: widget.edges,
                  positions: positions,
                  focusId: widget.focusId,
                  colors: colors,
                  textStyle: Theme.of(context)
                      .extension<AuroraTypography>()!
                      .overline
                      .copyWith(color: colors.neutral900),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Map<String, Rect> _positions(double w, double h) {
    final cols = _levels.length;
    final positions = <String, Rect>{};
    const radius = 22.0;
    for (var c = 0; c < cols; c++) {
      final layer = _levels[c];
      final x = cols == 1 ? w / 2 : 24 + (w - 48) * (c / (cols - 1));
      for (var r = 0; r < layer.length; r++) {
        final n = layer.length;
        final y = n == 1 ? h / 2 : 24 + (h - 48) * (r / (n - 1));
        positions[layer[r].id] = Rect.fromCircle(
          center: Offset(x, y),
          radius: radius,
        );
      }
    }
    return positions;
  }
}

class _GraphPainter extends CustomPainter {
  const _GraphPainter({
    required this.nodes,
    required this.edges,
    required this.positions,
    required this.focusId,
    required this.colors,
    required this.textStyle,
  });

  final List<PrereqNode> nodes;
  final List<PrereqEdge> edges;
  final Map<String, Rect> positions;
  final String focusId;
  final AuroraColors colors;
  final TextStyle textStyle;

  @override
  void paint(Canvas canvas, Size size) {
    // Edges
    final edgePaint = Paint()
      ..color = colors.neutral300
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
    for (final e in edges) {
      final a = positions[e.from]?.center;
      final b = positions[e.to]?.center;
      if (a == null || b == null) continue;
      canvas.drawLine(a, b, edgePaint);
      _drawArrow(canvas, a, b);
    }

    // Nodes
    for (final n in nodes) {
      final r = positions[n.id];
      if (r == null) continue;
      final color = colors.masteryForEwa(n.ewa);
      final fill = Paint()..color = color.withValues(alpha: 0.18);
      final stroke = Paint()
        ..color = n.id == focusId ? colors.brand600 : color
        ..strokeWidth = n.id == focusId ? 3 : 1.6
        ..style = PaintingStyle.stroke;
      canvas.drawCircle(r.center, r.width / 2, fill);
      canvas.drawCircle(r.center, r.width / 2, stroke);
      _drawLabel(canvas, n.label, r);
    }
  }

  void _drawArrow(Canvas canvas, Offset from, Offset to) {
    final angle = (to - from).direction;
    const armLen = 6.0;
    const armAngle = math.pi / 6;
    final headEnd = to - Offset.fromDirection(angle, 24);
    final left = headEnd -
        Offset.fromDirection(angle - armAngle, armLen);
    final right = headEnd -
        Offset.fromDirection(angle + armAngle, armLen);
    final p = Paint()
      ..color = colors.neutral400
      ..strokeWidth = 1.4
      ..style = PaintingStyle.stroke;
    canvas.drawLine(headEnd, left, p);
    canvas.drawLine(headEnd, right, p);
  }

  void _drawLabel(Canvas canvas, String label, Rect r) {
    final tp = TextPainter(
      text: TextSpan(text: label, style: textStyle),
      textDirection: TextDirection.ltr,
      maxLines: 2,
      ellipsis: '…',
    )..layout(maxWidth: 80);
    final offset = Offset(
      r.center.dx - tp.width / 2,
      r.bottom + 4,
    );
    tp.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant _GraphPainter old) =>
      old.nodes != nodes ||
      old.edges != edges ||
      old.focusId != focusId ||
      old.positions != positions;
}
