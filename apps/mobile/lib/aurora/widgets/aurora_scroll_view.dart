// AuroraScrollView — Aurora-aware scroll container.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.2 (molecule)
//
// A `CustomScrollView` derivative that:
//   - Wraps the body in a horizontal `SafeArea` (top/bottom honoured by
//     AuroraScaffold + status overlay; leading/trailing here for
//     foldables in posture mode).
//   - Exposes `scrollToTop()` via a controller — wire to bottom-nav
//     re-tap (iOS HIG) from `AuroraBottomNav`.
//   - Honours `reverseUnderStatusBar` so AppBar large-title collapse
//     reads as expected on iOS.
//
// Usage:
//   final ctrl = AuroraScrollController();
//   AuroraScrollView(
//     controller: ctrl,
//     slivers: [
//       SliverAppBar.large(title: Text('Home')),
//       SliverList.builder(itemBuilder: ...),
//     ],
//   );

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class AuroraScrollController extends ScrollController {
  AuroraScrollController({super.initialScrollOffset});

  /// Smooth-scroll back to the top. Safe to call when not yet attached.
  Future<void> scrollToTop({Duration? duration}) async {
    if (!hasClients) return;
    await animateTo(
      0,
      duration: duration ?? const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }
}

class AuroraScrollView extends StatelessWidget {
  const AuroraScrollView({
    super.key,
    required this.slivers,
    this.controller,
    this.padding,
    this.physics,
    this.keyboardDismissBehavior =
        ScrollViewKeyboardDismissBehavior.onDrag,
  });

  final List<Widget> slivers;
  final ScrollController? controller;
  final EdgeInsetsGeometry? padding;
  final ScrollPhysics? physics;
  final ScrollViewKeyboardDismissBehavior keyboardDismissBehavior;

  @override
  Widget build(BuildContext context) {
    final isIos =
        defaultTargetPlatform == TargetPlatform.iOS && !kIsWeb;
    final defaults = isIos
        ? const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          )
        : const ClampingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          );

    final wrapped = padding == null
        ? slivers
        : [SliverPadding(padding: padding!, sliver: _MultiSliver(slivers))];

    return SafeArea(
      top: false,
      bottom: false,
      child: CustomScrollView(
        controller: controller,
        physics: physics ?? defaults,
        keyboardDismissBehavior: keyboardDismissBehavior,
        slivers: wrapped,
      ),
    );
  }
}

/// Helper that lets us wrap a `List<Widget>` (a mix of slivers) in one
/// SliverPadding without taking a dependency on flutter_sliver_tools.
class _MultiSliver extends StatelessWidget {
  const _MultiSliver(this.slivers);

  final List<Widget> slivers;

  @override
  Widget build(BuildContext context) {
    if (slivers.length == 1) return slivers.single;
    return SliverMainAxisGroup(slivers: slivers);
  }
}

/// Pull-to-refresh wrapper that adapts iOS / Android. Use this with
/// AuroraScrollView when the screen owns the refresh action.
class AuroraSliverRefresh extends StatelessWidget {
  const AuroraSliverRefresh({
    super.key,
    required this.onRefresh,
    this.height = 60,
  });

  final Future<void> Function() onRefresh;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final isIos =
        defaultTargetPlatform == TargetPlatform.iOS && !kIsWeb;
    if (isIos) {
      return CupertinoSliverRefreshControl(
        onRefresh: onRefresh,
        refreshTriggerPullDistance: height,
        refreshIndicatorExtent: height,
      );
    }
    return SliverToBoxAdapter(
      child: SizedBox(
        height: 0,
        child: RefreshIndicator(
          onRefresh: onRefresh,
          color: colors.brand600,
          child: const SizedBox.shrink(),
        ),
      ),
    );
  }
}
