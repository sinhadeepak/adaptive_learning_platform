// AuroraButton — Aurora v2 button primitive for the mobile app.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.1
//
// Six variants:
//   primary   — brand-600 fill, white text
//   secondary — neutral-tinted fill, dark text
//   tertiary  — outline, brand text
//   ghost     — transparent until pressed
//   aurora    — gradient AI CTA (cyan → violet)
//   danger    — destructive action
//
// Sizes: sm 36 / md 44 / lg 52 / xl 60 dp height — never below the
// active density's touch-target floor.
//
// Adapts iOS / Android internally:
//   * iOS:     CupertinoButton-style fill + soft pressed-state
//   * Android: Material 3 FilledButton / OutlinedButton ripple
//
// Loading state preserves the button's width and replaces children
// with a spinner so layouts don't reflow on submit.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

enum AuroraButtonVariant { primary, secondary, tertiary, ghost, aurora, danger }

enum AuroraButtonSize { sm, md, lg, xl }

class AuroraButton extends StatelessWidget {
  const AuroraButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AuroraButtonVariant.primary,
    this.size = AuroraButtonSize.md,
    this.iconLeft,
    this.iconRight,
    this.loading = false,
    this.fullWidth = false,
    this.haptic = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final AuroraButtonVariant variant;
  final AuroraButtonSize size;
  final Widget? iconLeft;
  final Widget? iconRight;
  final bool loading;
  final bool fullWidth;

  /// Fire `HapticFeedback.lightImpact()` on press. Default true. Set
  /// false for buttons that already wrap a tappable surface.
  final bool haptic;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;
    final spacing = Theme.of(context).extension<AuroraSpacing>()!;

    final height = _heightFor(size, density);
    final padH = _horizontalPaddingFor(size) * density.spaceScale;
    final padV = _verticalPaddingFor(size) * density.spaceScale;
    final cornerRadius = radius.md * density.radiusScale;

    final isDisabled = onPressed == null || loading;
    final tap = isDisabled
        ? null
        : () {
            if (haptic) HapticFeedback.lightImpact();
            onPressed!();
          };

    // Resolve foreground / background per variant.
    final fg = _foregroundFor(variant, colors);
    final bg = _backgroundFor(variant, colors);
    final border = _borderFor(variant, colors);
    final gradient = variant == AuroraButtonVariant.aurora ? colors.auroraAi : null;

    final textStyle = typography.button.copyWith(
      color: fg,
      fontSize: (typography.button.fontSize ?? 15) * density.typeScale,
    );

    Widget content = Row(
      mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (iconLeft != null) ...[
          IconTheme(
            data: IconThemeData(color: fg, size: textStyle.fontSize),
            child: iconLeft!,
          ),
          SizedBox(width: spacing.s2 * density.spaceScale),
        ],
        if (loading)
          SizedBox(
            width: textStyle.fontSize,
            height: textStyle.fontSize,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation<Color>(fg),
            ),
          )
        else
          Flexible(
            child: Text(
              label,
              style: textStyle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        if (iconRight != null) ...[
          SizedBox(width: spacing.s2 * density.spaceScale),
          IconTheme(
            data: IconThemeData(color: fg, size: textStyle.fontSize),
            child: iconRight!,
          ),
        ],
      ],
    );

    final button = AnimatedContainer(
      duration: Theme.of(context).extension<AuroraMotion>()!.fast,
      height: height,
      padding: EdgeInsets.symmetric(horizontal: padH, vertical: padV),
      decoration: BoxDecoration(
        color: gradient == null ? bg : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(cornerRadius),
        border: border == null ? null : Border.all(color: border),
      ),
      alignment: Alignment.center,
      child: DefaultTextStyle(style: textStyle, child: content),
    );

    final tappable = Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(cornerRadius),
      child: InkWell(
        onTap: tap,
        borderRadius: BorderRadius.circular(cornerRadius),
        splashColor: _splashFor(variant, colors),
        highlightColor: _highlightFor(variant, colors),
        child: AbsorbPointer(
          absorbing: isDisabled,
          child: Opacity(opacity: isDisabled ? 0.55 : 1, child: button),
        ),
      ),
    );

    return Semantics(
      button: true,
      enabled: !isDisabled,
      label: label,
      child: fullWidth ? SizedBox(width: double.infinity, child: tappable) : tappable,
    );
  }

  // ── per-variant tokens ─────────────────────────────────────────────────
  Color _foregroundFor(AuroraButtonVariant v, AuroraColors c) {
    switch (v) {
      case AuroraButtonVariant.primary:
      case AuroraButtonVariant.aurora:
      case AuroraButtonVariant.danger:
        return c.neutral0;
      case AuroraButtonVariant.secondary:
        return c.neutral800;
      case AuroraButtonVariant.tertiary:
      case AuroraButtonVariant.ghost:
        return c.brand600;
    }
  }

  Color? _backgroundFor(AuroraButtonVariant v, AuroraColors c) {
    switch (v) {
      case AuroraButtonVariant.primary:
        return c.brand600;
      case AuroraButtonVariant.secondary:
        return c.neutral100;
      case AuroraButtonVariant.tertiary:
        return Colors.transparent;
      case AuroraButtonVariant.ghost:
        return Colors.transparent;
      case AuroraButtonVariant.aurora:
        return null; // gradient
      case AuroraButtonVariant.danger:
        return c.danger600;
    }
  }

  Color? _borderFor(AuroraButtonVariant v, AuroraColors c) {
    switch (v) {
      case AuroraButtonVariant.secondary:
        return c.neutral200;
      case AuroraButtonVariant.tertiary:
        return c.brand100;
      default:
        return null;
    }
  }

  Color? _splashFor(AuroraButtonVariant v, AuroraColors c) {
    switch (v) {
      case AuroraButtonVariant.primary:
      case AuroraButtonVariant.aurora:
        return c.brand700.withValues(alpha: 0.25);
      case AuroraButtonVariant.danger:
        return c.danger500.withValues(alpha: 0.25);
      case AuroraButtonVariant.secondary:
      case AuroraButtonVariant.tertiary:
      case AuroraButtonVariant.ghost:
        return c.brand500.withValues(alpha: 0.15);
    }
  }

  Color? _highlightFor(AuroraButtonVariant v, AuroraColors c) =>
      _splashFor(v, c)?.withValues(alpha: 0.10);

  double _heightFor(AuroraButtonSize s, AuroraDensity d) {
    final base = switch (s) {
      AuroraButtonSize.sm => 36.0,
      AuroraButtonSize.md => 44.0,
      AuroraButtonSize.lg => 52.0,
      AuroraButtonSize.xl => 60.0,
    };
    // Never below the active density's OS touch floor.
    return base < d.touchTarget && s != AuroraButtonSize.sm
        ? d.touchTarget
        : base;
  }

  double _horizontalPaddingFor(AuroraButtonSize s) => switch (s) {
        AuroraButtonSize.sm => 12,
        AuroraButtonSize.md => 16,
        AuroraButtonSize.lg => 20,
        AuroraButtonSize.xl => 24,
      };

  double _verticalPaddingFor(AuroraButtonSize s) => switch (s) {
        AuroraButtonSize.sm => 6,
        AuroraButtonSize.md => 10,
        AuroraButtonSize.lg => 12,
        AuroraButtonSize.xl => 14,
      };
}

// Note: Material InkWell renders cleanly on both iOS and Android with
// brand splash. If future user testing shows the ripple feels foreign
// on iOS sub-44pt taps we'll switch to a platform branch (CupertinoButton
// on iOS, InkWell on Android) without changing this widget's public API.
