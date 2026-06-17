import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

import '../api/api_client.dart';
import '../aurora/widgets/widgets.dart';
import '../auth/auth_client.dart';
import 'home_tab.dart';
import 'practice_tab.dart';
import 'progress_tab.dart';
import 'rank_tab.dart';
import 'doubts_tab.dart';
import 'persona.dart';
import 'profile_tab.dart';

/// Main app shell after login. Five-tab bottom nav (Home / Progress /
/// Practice / Rank / Profile) plus a sixth Doubts surface reachable from
/// Home and from the Practice menu. Mirrors the dock in docs/ui/02_MobileApp.
class MainScaffold extends StatefulWidget {
  const MainScaffold({super.key, required this.auth, required this.onSignOut});
  final AuthClient auth;
  final VoidCallback onSignOut;

  @override
  State<MainScaffold> createState() => _MainScaffoldState();
}

class _MainScaffoldState extends State<MainScaffold> {
  int _index = 0;
  late final ApiClient _api = ApiClient(widget.auth);
  String? _avatarUrl;
  // Persona + earned-rank flag drive dock visibility. We keep all six
  // tabs in the IndexedStack so existing onJump(N) calls (PracticeTab=2,
  // ProgressTab=1, RankTab=3 …) stay stable; the dock just hides the
  // Rank button when it shouldn't be shown.
  LegacyAudience _persona = LegacyAudience.junior;
  bool _hasAnySession = false;
  // Active exam code passed down to surfaces that previously hardcoded
  // "NEET" — Practice tab's Adaptive card pill, etc.
  String? _activeExamCode;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    // Three signals load in parallel: avatar (for the dock thumb),
    // profile (to know the active exam → persona), and mastery (to
    // know whether any session exists → "earned" Rank tab).
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final results = await Future.wait([
        _api.getProfile(),
        _api.exams(),
        _api.mastery(user.id),
      ]);
      final profile = results[0] as UserProfile?;
      final exams = results[1] as List<Exam>;
      final mastery = results[2] as List<TopicMastery>;
      if (!mounted) return;

      String? activeCode;
      if (profile != null && profile.exams.isNotEmpty) {
        final activeId = profile.exams.first.examId;
        activeCode = exams
            .where((e) => e.id == activeId)
            .map((e) => e.code)
            .firstOrNull;
      }
      setState(() {
        _avatarUrl = profile?.avatarUrl;
        _persona = legacyAudienceForExamCode(activeCode);
        _hasAnySession = mastery.any((m) => m.n > 0);
        _activeExamCode = activeCode;
      });
    } catch (_) {
      // Fall through with defaults — junior persona, dock hides Rank.
      // Better to be conservative than crash on cold start.
    }
  }

  Future<void> _loadAvatar() async {
    final p = await _api.getProfile();
    if (!mounted) return;
    setState(() => _avatarUrl = p?.avatarUrl);
  }

  void _switchTo(int i) {
    setState(() => _index = i);
    // Returning to the Profile tab is the natural moment for the user to
    // change their avatar; refresh the bottom-nav thumb after they leave.
    if (i != 5 && _index == 5) _loadAvatar();
  }

  @override
  Widget build(BuildContext context) {
    final tabs = <Widget>[
      HomeTab(api: _api, auth: widget.auth, onJump: _switchTo),
      ProgressTab(api: _api, auth: widget.auth),
      PracticeTab(
          api: _api,
          auth: widget.auth,
          persona: _persona,
          activeExamCode: _activeExamCode,),
      RankTab(api: _api, auth: widget.auth),
      DoubtsTab(api: _api, auth: widget.auth),
      ProfileTab(api: _api, auth: widget.auth, onSignOut: widget.onSignOut),
    ];
    final showRank = shouldShowRankTab(
      audience: _persona,
      hasAnySession: _hasAnySession,
    );
    return MainScaffoldScope(
      switchToTab: _switchTo,
      activeTabIndex: _index,
      child: AuroraScaffold(
        body: IndexedStack(index: _index, children: tabs),
        bottomNav: _BottomNav(
          index: _index,
          avatarUrl: _avatarUrl,
          showRank: showRank,
          onChanged: (i) {
            // Coming back from Profile? Refresh avatar in case it changed.
            if (_index == 5 && i != 5) _loadAvatar();
            setState(() => _index = i);
          },
        ),
      ),
    );
  }
}

/// InheritedWidget that lets any descendant — including pushed screens
/// that have been Navigator.of(...).pushed on top of the dock — switch
/// to a different bottom-nav tab. Sprint 3 introduced this primitive so
/// the Predicted-AIR card on the Exam Dashboard can deep-link into the
/// Rank tab without having to first pop all the way back to Home.
///
/// Usage from any descendant:
///   MainScaffoldScope.of(context)?.switchToTab(3); // jumps to Rank
class MainScaffoldScope extends InheritedWidget {
  const MainScaffoldScope({
    super.key,
    required super.child,
    required this.switchToTab,
    required this.activeTabIndex,
  });

  final void Function(int index) switchToTab;
  final int activeTabIndex;

  static MainScaffoldScope? of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<MainScaffoldScope>();
  }

  @override
  bool updateShouldNotify(MainScaffoldScope old) =>
      old.activeTabIndex != activeTabIndex;
}

extension on Iterable<String> {
  String? get firstOrNull => isEmpty ? null : first;
}

class _BottomNav extends StatelessWidget {
  const _BottomNav({
    required this.index,
    required this.onChanged,
    required this.showRank,
    this.avatarUrl,
  });
  final int index;
  final ValueChanged<int> onChanged;
  final String? avatarUrl;
  final bool showRank;

  @override
  Widget build(BuildContext context) {
    final items = <_NavItem>[
      _NavItem(icon: Icons.home_filled, label: 'Home', index: 0),
      _NavItem(icon: Icons.bar_chart_rounded, label: 'Progress', index: 1),
      _NavItem(icon: Icons.bolt_rounded, label: 'Practice', index: 2, isCenter: true),
      if (showRank)
        _NavItem(icon: Icons.emoji_events_outlined, label: 'Rank', index: 3),
      _NavItem(icon: Icons.chat_bubble_outline, label: 'Doubts', index: 4),
      _NavItem(icon: Icons.person_outline, label: 'Profile', index: 5),
    ];
    return Container(
      decoration: const BoxDecoration(
        color: AlpColors.bgSurface1,
        border: Border(top: BorderSide(color: AlpColors.borderDefault, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 68,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: items
                .map((it) => _NavButton(
                      item: it,
                      active: index == it.index,
                      avatarUrl: it.index == 5 ? avatarUrl : null,
                      onTap: () => onChanged(it.index),
                    ),)
                .toList(),
          ),
        ),
      ),
    );
  }
}

class _NavItem {
  _NavItem({required this.icon, required this.label, required this.index, this.isCenter = false});
  final IconData icon;
  final String label;
  final int index;
  final bool isCenter;
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.item,
    required this.active,
    required this.onTap,
    this.avatarUrl,
  });
  final _NavItem item;
  final bool active;
  final VoidCallback onTap;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    if (item.isCenter) {
      // The Practice button is the AI-accent action sticking up from the dock.
      return InkResponse(
        onTap: onTap,
        radius: 32,
        child: Container(
          width: 50,
          height: 50,
          margin: const EdgeInsets.only(bottom: 6),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AlpColors.colorBlue, Color(0xFF7B68EE)],
            ),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: AlpColors.colorBlue.withValues(alpha: 0.35),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 24),
        ),
      );
    }
    final color = active ? AlpColors.colorAi : AlpColors.textMuted;
    return InkResponse(
      onTap: onTap,
      radius: 28,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (avatarUrl != null && avatarUrl!.isNotEmpty)
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                image: DecorationImage(
                  image: MemoryImage(
                    base64Decode(avatarUrl!.split(',').last),
                  ),
                  fit: BoxFit.cover,
                ),
                border: Border.all(
                  color: active ? AlpColors.colorAi : AlpColors.borderDefault,
                  width: 1.5,
                ),
              ),
            )
          else
            Icon(item.icon, color: color, size: 22),
          const SizedBox(height: 2),
          Text(
            item.label,
            style: TextStyle(
              fontSize: 10,
              color: color,
              fontWeight: active ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}
