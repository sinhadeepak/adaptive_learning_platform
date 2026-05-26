// VidyaMainShellScope — InheritedWidget that lets any descendant of
// VidyaMainShell switch to a different tab without unwinding through
// callbacks. Aurora's analogue is MainScaffoldScope; this is the Vidya
// equivalent, scoped to the VidyaShellTab enum instead of an int.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaMainShellScope extends InheritedWidget {
  final VidyaShellTab activeTab;
  final void Function(VidyaShellTab tab) switchTo;

  const VidyaMainShellScope({
    super.key,
    required super.child,
    required this.activeTab,
    required this.switchTo,
  });

  static VidyaMainShellScope? of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<VidyaMainShellScope>();
  }

  @override
  bool updateShouldNotify(VidyaMainShellScope old) =>
      old.activeTab != activeTab;
}
