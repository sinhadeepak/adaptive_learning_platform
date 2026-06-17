// AuroraRefreshable — Pull-to-refresh wrapper. Adaptive: Cupertino
// rubber-band on iOS, Material spinner on Android.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class AuroraRefreshable extends StatelessWidget {
  const AuroraRefreshable({
    super.key,
    required this.onRefresh,
    required this.child,
  });

  final Future<void> Function() onRefresh;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isIOS = Theme.of(context).platform == TargetPlatform.iOS;
    final colors = Theme.of(context).extension<AuroraColors>()!;
    if (isIOS) {
      // iOS — Cupertino rubber-band requires a CustomScrollView with a
      // sliver-refresh. When the caller passes a non-sliver child we
      // wrap it in a SliverToBoxAdapter under a CustomScrollView so the
      // pattern stays uniform across screens.
      return CustomScrollView(
        slivers: [
          CupertinoSliverRefreshControl(onRefresh: onRefresh),
          SliverToBoxAdapter(child: child),
        ],
      );
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      color: colors.brand600,
      backgroundColor: colors.neutral0,
      child: child,
    );
  }
}
