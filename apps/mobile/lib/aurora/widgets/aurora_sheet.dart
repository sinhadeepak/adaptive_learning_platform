// AuroraSheet — Aurora v2 bottom sheet helper.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §9.1
//
// Use `showAuroraSheet(context, builder: ...)` instead of
// `showModalBottomSheet`. Adds:
//   * Drag handle at top
//   * Optional title row
//   * SafeArea bottom inset
//   * Aurora rounded top corners (density-aware)
//   * 90% max-height clamp so the sheet never covers the status bar

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

Future<T?> showAuroraSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  String? title,
  bool isScrollControlled = true,
  bool isDismissible = true,
  bool enableDrag = true,
}) {
  final colors = Theme.of(context).extension<AuroraColors>()!;
  final radius = Theme.of(context).extension<AuroraRadius>()!;
  final density = Theme.of(context).extension<AuroraDensity>()!;

  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    isDismissible: isDismissible,
    enableDrag: enableDrag,
    backgroundColor: colors.neutral0,
    barrierColor: colors.neutral900.withValues(alpha: 0.45),
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(radius.xl * density.radiusScale),
      ),
    ),
    builder: (ctx) => _AuroraSheetShell(title: title, child: builder(ctx)),
  );
}

class _AuroraSheetShell extends StatelessWidget {
  const _AuroraSheetShell({this.title, required this.child});

  final String? title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final spacing = Theme.of(context).extension<AuroraSpacing>()!;

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle — iOS HIG canonical pattern, adopted on
            // Android for consistency.
            Padding(
              padding: EdgeInsets.symmetric(
                vertical: spacing.s2 * density.spaceScale,
              ),
              child: Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: colors.neutral300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
            ),
            if (title != null)
              Padding(
                padding: EdgeInsets.fromLTRB(
                  spacing.s5 * density.spaceScale,
                  spacing.s2 * density.spaceScale,
                  spacing.s5 * density.spaceScale,
                  spacing.s3 * density.spaceScale,
                ),
                child: Text(
                  title!,
                  style: typography.h3.copyWith(color: colors.neutral900),
                ),
              ),
            Flexible(child: child),
          ],
        ),
      ),
    );
  }
}
