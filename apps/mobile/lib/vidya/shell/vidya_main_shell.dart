// VidyaMainShell — post-auth shell. Holds an IndexedStack of the 5
// Vidya tabs (Home + 4 placeholders) and wires VidyaBottomNav. The
// active tab is mirrored into VidyaMainShellScope so descendants can
// call switchTo(VidyaShellTab) without callback wiring.
//
// Phase 3a: Home is a minimal stub (greeting card). Study / Practice /
// Insights are "Coming soon" placeholders pointing at Aurora as a
// stopgap. More carries the Sign out action so users can leave the
// app even before Phase 3e ships the real More tab.
//
// Deliberately has NO Timer.periodic — so pumpAndSettle() works in
// tests. The Aurora InboxBell pattern (60s notification poll) lands
// in Phase 3a.1 with a Stream/ValueNotifier construction instead.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';
import '../screens/vidya_home_screen.dart';
import '../screens/vidya_more_screen.dart';
import '../screens/vidya_study_screen.dart';
import '../screens/vidya_tab_placeholders.dart';
import 'vidya_main_shell_scope.dart';

class VidyaMainShell extends StatefulWidget {
  final AuthClient auth;
  final VoidCallback onSignOut;
  final VidyaShellTab initialTab;

  const VidyaMainShell({
    super.key,
    required this.auth,
    required this.onSignOut,
    this.initialTab = VidyaShellTab.home,
  });

  @override
  State<VidyaMainShell> createState() => _VidyaMainShellState();
}

class _VidyaMainShellState extends State<VidyaMainShell> {
  late VidyaShellTab _active = widget.initialTab;

  void _switchTo(VidyaShellTab t) => setState(() => _active = t);

  @override
  Widget build(BuildContext context) {
    final tabs = <Widget>[
      Container(
        key: const Key('vidya.shell.home'),
        child: VidyaHomeScreen(auth: widget.auth),
      ),
      Container(
        key: const Key('vidya.shell.study'),
        child: VidyaStudyScreen(auth: widget.auth),
      ),
      Container(
        key: const Key('vidya.shell.practice'),
        child: const VidyaPracticeTabPlaceholder(),
      ),
      Container(
        key: const Key('vidya.shell.insights'),
        child: const VidyaInsightsTabPlaceholder(),
      ),
      Container(
        key: const Key('vidya.shell.more'),
        child: VidyaMoreScreen(
          auth: widget.auth,
          onSignOut: widget.onSignOut,
        ),
      ),
    ];
    return VidyaMainShellScope(
      activeTab: _active,
      switchTo: _switchTo,
      child: VidyaScaffold(
        body: IndexedStack(index: _active.index, children: tabs),
        bottomNavigationBar: VidyaBottomNav(
          active: _active,
          onTap: _switchTo,
        ),
      ),
    );
  }
}
