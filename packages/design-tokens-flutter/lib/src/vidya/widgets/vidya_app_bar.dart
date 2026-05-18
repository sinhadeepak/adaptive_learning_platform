import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String? title;
  final Widget? leading;
  final List<Widget>? actions;
  final bool centerTitle;
  final bool serif;

  const VidyaAppBar({
    super.key,
    this.title,
    this.leading,
    this.actions,
    this.centerTitle = false,
    this.serif = false,
  });

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return AppBar(
      backgroundColor: v.paper,
      surfaceTintColor: v.paper,
      foregroundColor: v.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: centerTitle,
      leading: leading,
      title: title == null
          ? null
          : Text(
              title!,
              style: serif
                  ? VidyaText.displayXs(v.ink)
                  : TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 17,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                    ),
            ),
      actions: actions,
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Container(color: v.rule, height: 1),
      ),
    );
  }
}
