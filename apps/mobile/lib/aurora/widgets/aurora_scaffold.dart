// AuroraScaffold — Aurora v2 scaffold organism.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.3
//
// Mobile equivalent of web's AppShell. Wraps a normal Material Scaffold
// with:
//   * Aurora AppBar slot
//   * Aurora BottomNav slot
//   * Optional FAB
//   * SafeArea handling (edge-to-edge + system inset awareness)
//   * Focus mode (hides app bar + bottom nav for Quiz / focus flows)
//   * Auto-applied system UI overlay style per active brightness

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AuroraScaffold extends StatelessWidget {
  const AuroraScaffold({
    super.key,
    required this.body,
    this.appBar,
    this.bottomNav,
    this.floatingActionButton,
    this.focusMode = false,
    this.resizeToAvoidBottomInset = true,
    this.backgroundColor,
  });

  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNav;
  final Widget? floatingActionButton;

  /// Hide app bar + bottom nav. Used by Quiz / Photo Doubt / Mock Test
  /// to remove navigation distractions during focused activities.
  final bool focusMode;

  final bool resizeToAvoidBottomInset;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;

    // Pick a system-UI overlay style matching the active brightness so
    // status bar icons stay readable. Honors focus mode (forces dark
    // status bar so the camera UI / quiz timer pops).
    final overlayStyle = focusMode || Theme.of(context).brightness == Brightness.dark
        ? SystemUiOverlayStyle.light.copyWith(
            statusBarColor: Colors.transparent,
            systemNavigationBarColor: colors.neutral0,
            systemNavigationBarIconBrightness:
                Theme.of(context).brightness == Brightness.dark
                    ? Brightness.light
                    : Brightness.dark,
          )
        : SystemUiOverlayStyle.dark.copyWith(
            statusBarColor: Colors.transparent,
            systemNavigationBarColor: colors.neutral0,
            systemNavigationBarIconBrightness: Brightness.dark,
          );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlayStyle,
      child: Scaffold(
        backgroundColor: backgroundColor ?? colors.neutral50,
        resizeToAvoidBottomInset: resizeToAvoidBottomInset,
        appBar: focusMode ? null : appBar,
        bottomNavigationBar: focusMode ? null : bottomNav,
        floatingActionButton: focusMode ? null : floatingActionButton,
        body: SafeArea(
          top: focusMode || appBar == null,
          bottom: focusMode || bottomNav == null,
          child: body,
        ),
      ),
    );
  }
}
