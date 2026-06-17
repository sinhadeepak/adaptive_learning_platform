// AuroraDivider — Aurora v2 hairline divider.
//
// Uses neutral-200 (light) / neutral-300 (dark) via the theme; 1 dp
// always. Horizontal by default; pass `axis: Axis.vertical` for
// vertical use inside Rows.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraDivider extends StatelessWidget {
  const AuroraDivider({
    super.key,
    this.axis = Axis.horizontal,
    this.indent = 0,
    this.endIndent = 0,
  });

  final Axis axis;
  final double indent;
  final double endIndent;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).extension<AuroraColors>()!.neutral200;
    if (axis == Axis.horizontal) {
      return Divider(
        color: color,
        thickness: 1,
        height: 1,
        indent: indent,
        endIndent: endIndent,
      );
    }
    return VerticalDivider(
      color: color,
      thickness: 1,
      width: 1,
      indent: indent,
      endIndent: endIndent,
    );
  }
}
