// AuroraSnackbar — Aurora v2 snackbar helper.
//
// Replaces `ScaffoldMessenger.of(context).showSnackBar(SnackBar(...))`
// boilerplate with tone-aware helpers. Honors haptics + a11y.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

enum AuroraSnackbarTone { neutral, success, warning, danger, aurora }

void showAuroraSnackbar(
  BuildContext context, {
  required String message,
  AuroraSnackbarTone tone = AuroraSnackbarTone.neutral,
  String? actionLabel,
  VoidCallback? onAction,
  Duration duration = const Duration(seconds: 4),
}) {
  final colors = Theme.of(context).extension<AuroraColors>()!;
  final typography = Theme.of(context).extension<AuroraTypography>()!;

  switch (tone) {
    case AuroraSnackbarTone.success:
      HapticFeedback.lightImpact();
      break;
    case AuroraSnackbarTone.warning:
    case AuroraSnackbarTone.danger:
      HapticFeedback.mediumImpact();
      break;
    default:
      break;
  }

  final bg = switch (tone) {
    AuroraSnackbarTone.neutral => colors.neutral900,
    AuroraSnackbarTone.success => colors.success600,
    AuroraSnackbarTone.warning => colors.developing600,
    AuroraSnackbarTone.danger => colors.danger600,
    AuroraSnackbarTone.aurora => null, // gradient via custom shape below
  };

  ScaffoldMessenger.of(context).hideCurrentSnackBar();
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        message,
        style: typography.body.copyWith(color: colors.neutral0),
      ),
      backgroundColor: bg ?? colors.aurora500,
      behavior: SnackBarBehavior.floating,
      duration: duration,
      action: actionLabel == null
          ? null
          : SnackBarAction(
              label: actionLabel,
              textColor: colors.neutral0,
              onPressed: onAction ?? () {},
            ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
      ),
    ),
  );
}
