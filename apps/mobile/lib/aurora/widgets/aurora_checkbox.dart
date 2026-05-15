// AuroraCheckbox — Aurora v2 checkbox.
// Native Material Checkbox with brand-600 fill (via aurora_theme).

import 'package:flutter/material.dart';

class AuroraCheckbox extends StatelessWidget {
  const AuroraCheckbox({
    super.key,
    required this.value,
    required this.onChanged,
    this.tristate = false,
    this.semanticLabel,
  });

  final bool? value;
  final ValueChanged<bool?>? onChanged;
  final bool tristate;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel,
      checked: value ?? false,
      child: Checkbox(
        value: value,
        onChanged: onChanged,
        tristate: tristate,
      ),
    );
  }
}
