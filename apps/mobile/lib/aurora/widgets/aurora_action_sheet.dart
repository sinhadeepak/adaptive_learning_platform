// AuroraActionSheet — context-menu / long-press action list molecule.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.2 (molecule)
//
// Adapts iOS / Android:
//   - iOS:     `showCupertinoModalPopup` + `CupertinoActionSheet`
//   - Android: `showModalBottomSheet` with a column of Aurora tiles
//
// Public API:
//   showAuroraActionSheet(
//     context,
//     title: 'Sort by',
//     message: 'Pick how the list is ordered',
//     actions: [
//       AuroraActionSheetAction(label: 'Most recent', onPressed: ...),
//       AuroraActionSheetAction(label: 'Best score',  onPressed: ...),
//       AuroraActionSheetAction.destructive(label: 'Clear', onPressed: ...),
//     ],
//     cancelLabel: 'Cancel',
//   );
//
// Returns the action's [value] (or null if dismissed).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class AuroraActionSheetAction<T> {
  const AuroraActionSheetAction({
    required this.label,
    this.value,
    this.icon,
    this.destructive = false,
    this.isDefault = false,
    this.onPressed,
  });

  factory AuroraActionSheetAction.destructive({
    required String label,
    T? value,
    IconData? icon,
    VoidCallback? onPressed,
  }) =>
      AuroraActionSheetAction<T>(
        label: label,
        value: value,
        icon: icon,
        destructive: true,
        onPressed: onPressed,
      );

  final String label;
  final T? value;
  final IconData? icon;
  final bool destructive;
  final bool isDefault;
  final VoidCallback? onPressed;
}

Future<T?> showAuroraActionSheet<T>(
  BuildContext context, {
  String? title,
  String? message,
  required List<AuroraActionSheetAction<T>> actions,
  String cancelLabel = 'Cancel',
}) {
  final isIos =
      defaultTargetPlatform == TargetPlatform.iOS && !kIsWeb;

  if (isIos) {
    return showCupertinoModalPopup<T>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: title == null ? null : Text(title),
        message: message == null ? null : Text(message),
        actions: [
          for (final a in actions)
            CupertinoActionSheetAction(
              isDestructiveAction: a.destructive,
              isDefaultAction: a.isDefault,
              onPressed: () {
                a.onPressed?.call();
                Navigator.of(ctx).pop(a.value);
              },
              child: Text(a.label),
            ),
        ],
        cancelButton: CupertinoActionSheetAction(
          onPressed: () => Navigator.of(ctx).pop(),
          child: Text(cancelLabel),
        ),
      ),
    );
  }

  return showModalBottomSheet<T>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _MaterialActionSheet<T>(
      title: title,
      message: message,
      actions: actions,
      cancelLabel: cancelLabel,
    ),
  );
}

class _MaterialActionSheet<T> extends StatelessWidget {
  const _MaterialActionSheet({
    required this.title,
    required this.message,
    required this.actions,
    required this.cancelLabel,
  });

  final String? title;
  final String? message;
  final List<AuroraActionSheetAction<T>> actions;
  final String cancelLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    return SafeArea(
      top: false,
      child: Container(
        margin: EdgeInsets.all(8 * density.spaceScale),
        decoration: BoxDecoration(
          color: colors.neutral0,
          borderRadius:
              BorderRadius.circular(radius.lg * density.radiusScale),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null || message != null) ...[
              Padding(
                padding: EdgeInsets.fromLTRB(
                  16 * density.spaceScale,
                  16 * density.spaceScale,
                  16 * density.spaceScale,
                  8 * density.spaceScale,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (title != null)
                      Text(
                        title!,
                        style: typography.h4
                            .copyWith(color: colors.neutral900),
                      ),
                    if (message != null) ...[
                      SizedBox(height: 4 * density.spaceScale),
                      Text(
                        message!,
                        style: typography.bodySm
                            .copyWith(color: colors.neutral600),
                      ),
                    ],
                  ],
                ),
              ),
              Divider(height: 1, color: colors.neutral200),
            ],
            for (var i = 0; i < actions.length; i++) ...[
              _ActionRow<T>(action: actions[i]),
              if (i < actions.length - 1)
                Divider(height: 1, color: colors.neutral100),
            ],
            SizedBox(height: 8 * density.spaceScale),
            Padding(
              padding: EdgeInsets.symmetric(
                horizontal: 12 * density.spaceScale,
              ),
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(
                  minimumSize: Size.fromHeight(density.touchTarget),
                ),
                child: Text(cancelLabel,
                    style: typography.button
                        .copyWith(color: colors.neutral700),),
              ),
            ),
            SizedBox(height: 8 * density.spaceScale),
          ],
        ),
      ),
    );
  }
}

class _ActionRow<T> extends StatelessWidget {
  const _ActionRow({required this.action});

  final AuroraActionSheetAction<T> action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final fg = action.destructive
        ? colors.danger600
        : (action.isDefault ? colors.brand600 : colors.neutral800);

    return InkWell(
      onTap: () {
        action.onPressed?.call();
        Navigator.of(context).pop(action.value);
      },
      child: SizedBox(
        height: density.touchTarget + 4,
        child: Padding(
          padding:
              EdgeInsets.symmetric(horizontal: 16 * density.spaceScale),
          child: Row(
            children: [
              if (action.icon != null) ...[
                Icon(action.icon, color: fg, size: 20),
                SizedBox(width: 12 * density.spaceScale),
              ],
              Expanded(
                child: Text(
                  action.label,
                  style: typography.body.copyWith(
                    color: fg,
                    fontWeight: action.isDefault
                        ? FontWeight.w600
                        : FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
