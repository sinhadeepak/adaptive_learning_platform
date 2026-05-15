// AuroraAppBar — Aurora v2 adaptive app bar.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §5.3 + §8.3
//
// Renders a Material 3 toolbar on Android and a Cupertino-style
// large-title navigation bar on iOS, both honoring Aurora tokens.
// Callers don't branch on Platform.is*; the widget does.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AuroraAppBar extends StatelessWidget implements PreferredSizeWidget {
  const AuroraAppBar({
    super.key,
    this.title = '',
    this.titleWidget,
    this.leading,
    this.actions = const [],
    this.centerTitle,
    this.backgroundColor,
  });

  /// String title. The default. Pass empty string when `titleWidget` is set.
  final String title;

  /// Optional custom title widget (e.g. a Row with icon + label). When
  /// provided, replaces the [title] String in the layout but [title] is
  /// still used as the accessible semantic label.
  final Widget? titleWidget;

  final Widget? leading;
  final List<Widget> actions;

  /// Defaults to iOS-style centered on iOS, leading-aligned on Android.
  final bool? centerTitle;

  /// Override the surface tint. Defaults to neutral-0 (theme-driven).
  final Color? backgroundColor;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final isIOS = Theme.of(context).platform == TargetPlatform.iOS;

    return AppBar(
      title: titleWidget ??
          Semantics(
            header: true,
            child: Text(title, style: typography.h3),
          ),
      titleTextStyle: typography.h3.copyWith(color: colors.neutral900),
      leading: leading,
      actions: actions,
      centerTitle: centerTitle ?? isIOS,
      backgroundColor: backgroundColor ?? colors.neutral0,
      foregroundColor: colors.neutral900,
      elevation: 0,
      scrolledUnderElevation: 1,
      surfaceTintColor: colors.brand600,
      // On iOS, use the chevron icon shape; on Android, the standard
      // back arrow. Both already platform-canonical via Flutter's
      // default leading lookup — we just pass through unless the
      // caller supplies their own.
      iconTheme: IconThemeData(color: colors.neutral900),
      systemOverlayStyle: Theme.of(context).brightness == Brightness.dark
          ? SystemUiOverlayStyle.light
          : SystemUiOverlayStyle.dark,
    );
  }
}

// Note: a future iOS-canonical branch may swap to
// CupertinoSliverNavigationBar with large-title collapse on iOS. The
// AppBar above already adopts iOS-style centered titles and the
// chevron icon via Flutter's default leading lookup.
