// AuroraIcon — Thin wrapper over Material Icon that auto-selects
// Cupertino equivalent on iOS for the common icons we use.

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class AuroraIcon extends StatelessWidget {
  const AuroraIcon(
    this.icon, {
    super.key,
    this.iosIcon,
    this.size,
    this.color,
    this.semanticLabel,
  });

  /// Android / fallback icon.
  final IconData icon;

  /// Optional iOS-canonical icon. When present and on iOS, replaces
  /// `icon`. When null, `icon` renders on both platforms.
  final IconData? iosIcon;

  final double? size;
  final Color? color;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final isIOS = Theme.of(context).platform == TargetPlatform.iOS;
    final resolved = isIOS && iosIcon != null ? iosIcon! : icon;
    return Icon(
      resolved,
      size: size,
      color: color,
      semanticLabel: semanticLabel,
    );
  }
}

// Common iOS↔Android icon pairs — convenience constants.
class AuroraIcons {
  AuroraIcons._();
  static const home = (Icons.home_filled, CupertinoIcons.house_fill);
  static const study = (Icons.auto_stories, CupertinoIcons.book_fill);
  static const practice = (Icons.flash_on, CupertinoIcons.bolt_fill);
  static const battle = (Icons.sports_kabaddi, CupertinoIcons.shield_fill);
  static const profile = (Icons.person, CupertinoIcons.person_fill);
  static const search = (Icons.search, CupertinoIcons.search);
  static const settings = (Icons.settings, CupertinoIcons.settings);
  static const bell = (Icons.notifications_outlined, CupertinoIcons.bell);
  static const back = (Icons.arrow_back, CupertinoIcons.back);
  static const close = (Icons.close, CupertinoIcons.xmark);
  static const check = (Icons.check, CupertinoIcons.checkmark);
  static const more = (Icons.more_horiz, CupertinoIcons.ellipsis);
}
