// VidyaMoreScreen — Phase 3e v1. Minimal More tab with profile header,
// Aurora-shell rollback toggle (surfaces vidya.use_aurora_shell as a
// UI switch), and Sign out. Full settings/profile editing lives in
// Phase 3e.full.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../api/api_client.dart';
import '../../api/assignments.dart';
import '../../auth/auth_client.dart';
import '../../screens/assignments_screen.dart';
import '../../screens/bookmarks_screen.dart';
import '../../screens/doubts_tab.dart';
import '../../screens/edit_profile_screen.dart';
import '../../screens/history_screen.dart';
import '../../screens/inbox_screen.dart';
import '../../screens/notification_preferences_screen.dart';
import '../aurora_route.dart';
import '../theme_mode_notifier.dart';

class VidyaMoreScreen extends StatefulWidget {
  final AuthClient auth;
  final VoidCallback onSignOut;
  // Optional — when supplied, a THEME section appears with a 3-way
  // segmented control. Hidden otherwise so unit-level tests that
  // don't care about theme management don't need to wire it up.
  final VidyaThemeModeNotifier? themeMode;

  const VidyaMoreScreen({
    super.key,
    required this.auth,
    required this.onSignOut,
    this.themeMode,
  });

  @override
  State<VidyaMoreScreen> createState() => _VidyaMoreScreenState();
}

class _VidyaMoreScreenState extends State<VidyaMoreScreen> {
  static const _storage = FlutterSecureStorage();
  static const _useAuroraShellKey = 'vidya.use_aurora_shell';

  bool _useAuroraShell = false;
  // Phase 3e.full slice — language preference. Bootstraps from
  // getProfile(); flips trigger api.updatePreferences and update local
  // state for the segmented control. Hot-switching app UI strings to
  // Hindi is out of scope until an l10n system lands; the snackbar
  // tells the user to restart.
  VidyaLang _lang = VidyaLang.en;
  bool _savingLang = false;

  @override
  void initState() {
    super.initState();
    _loadFlag();
    _loadLanguage();
    widget.themeMode?.addListener(_onThemeChanged);
  }

  Future<void> _loadLanguage() async {
    try {
      final api = ApiClient(widget.auth);
      final profile = await api.getProfile();
      if (!mounted) return;
      if (profile?.language == 'hi') {
        setState(() => _lang = VidyaLang.hi);
      }
    } catch (_) {
      // best-effort — leave default 'en'
    }
  }

  Future<void> _setLanguage(VidyaLang next) async {
    if (next == _lang || _savingLang) return;
    setState(() {
      _lang = next;
      _savingLang = true;
    });
    try {
      final api = ApiClient(widget.auth);
      await api.updatePreferences(
        language: next == VidyaLang.hi ? 'hi' : 'en',
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Restart app to apply.')),
      );
    } catch (_) {
      if (mounted) {
        // Roll back on failure.
        setState(
          () => _lang = next == VidyaLang.hi ? VidyaLang.en : VidyaLang.hi,
        );
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't save. Try again.")),
        );
      }
    } finally {
      if (mounted) setState(() => _savingLang = false);
    }
  }

  @override
  void dispose() {
    widget.themeMode?.removeListener(_onThemeChanged);
    super.dispose();
  }

  void _onThemeChanged() {
    if (mounted) setState(() {});
  }

  /// Pushes an Aurora-built screen wrapped in [AuroraRoute] so it gets
  /// its own Aurora MaterialApp (theme + persona + density) — the
  /// sanctioned way to mount legacy Aurora screens from the Vidya shell
  /// without editing them (see vidya_root_app.dart).
  void _openAurora(Widget Function(BuildContext) builder) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AuroraRoute(builder: builder),
      ),
    );
  }

  Future<void> _loadFlag() async {
    final v = await _storage.read(key: _useAuroraShellKey);
    if (!mounted) return;
    setState(() => _useAuroraShell = v == 'true');
  }

  Future<void> _toggleAuroraShell(bool next) async {
    await _storage.write(
      key: _useAuroraShellKey,
      value: next ? 'true' : 'false',
    );
    if (!mounted) return;
    setState(() => _useAuroraShell = next);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Restart app to apply.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final user = widget.auth.user;
    final firstName = user?.firstName ?? 'There';
    final email = user?.email ?? '';
    final initial =
        firstName.isNotEmpty ? firstName.substring(0, 1).toUpperCase() : '?';

    // SingleChildScrollView (not ListView) so every section builds
    // eagerly — the hub is short and this keeps off-screen settings
    // controls reachable (theme/language/sign-out) without lazy-build
    // gaps. Section list grew with the engagement hub (Phase 3).
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'MORE',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 11,
              color: v.ink3,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 16),
          _ProfileHeaderCard(
            initial: initial,
            firstName: firstName,
            email: email,
          ),
          const SizedBox(height: 24),
          _Section(
            eyebrow: 'ACTIVITY',
            child: _NavGroup(
              rows: [
                _NavRow(
                  icon: Icons.bookmark_outline,
                  label: 'Bookmarks',
                  onTap: () => _openAurora(
                    (_) => BookmarksScreen(
                      api: ApiClient(widget.auth),
                      auth: widget.auth,
                    ),
                  ),
                ),
                _NavRow(
                  icon: Icons.history,
                  label: 'History',
                  onTap: () => _openAurora(
                    (_) => HistoryScreen(
                      api: ApiClient(widget.auth),
                      auth: widget.auth,
                    ),
                  ),
                ),
                _NavRow(
                  icon: Icons.notifications_none,
                  label: 'Notifications',
                  onTap: () => _openAurora(
                    (_) => InboxScreen(
                      api: ApiClient(widget.auth),
                      auth: widget.auth,
                    ),
                  ),
                ),
                _NavRow(
                  icon: Icons.help_outline,
                  label: 'Doubts & AI tutor',
                  onTap: () => _openAurora(
                    (_) => DoubtsTab(
                      api: ApiClient(widget.auth),
                      auth: widget.auth,
                    ),
                  ),
                ),
                _NavRow(
                  icon: Icons.assignment_outlined,
                  label: 'Assignments',
                  onTap: () => _openAurora(
                    (_) => AssignmentsScreen(
                      client: AssignmentsClient(widget.auth),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (widget.themeMode != null) ...[
            _Section(
              eyebrow: 'THEME',
              child: _ThemePickerCard(
                notifier: widget.themeMode!,
                accent: v.accent,
                ink: v.ink,
                ink3: v.ink3,
              ),
            ),
            const SizedBox(height: 16),
          ],
          _Section(
            eyebrow: 'LANGUAGE',
            child: VidyaCard(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: VidyaLangToggle(
                  value: _lang,
                  onChanged: _setLanguage,
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _Section(
            eyebrow: 'DEVELOPER',
            child: VidyaCard(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Use Aurora shell',
                            style: TextStyle(
                              fontFamily: VidyaFonts.ui,
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                              color: v.ink,
                            ),
                          ),
                        ),
                        Switch(
                          value: _useAuroraShell,
                          onChanged: _toggleAuroraShell,
                          activeThumbColor: v.accent,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Switches the post-auth shell back to the legacy '
                      'Aurora bottom-nav. Restart app to apply.',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 12,
                        color: v.ink3,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _Section(
            eyebrow: 'ACCOUNT',
            child: _NavGroup(
              rows: [
                _NavRow(
                  icon: Icons.person_outline,
                  label: 'Edit profile',
                  onTap: () => _openAurora(
                    (_) => EditProfileScreen(
                      api: ApiClient(widget.auth),
                      auth: widget.auth,
                    ),
                  ),
                ),
                _NavRow(
                  icon: Icons.tune,
                  label: 'Notification preferences',
                  onTap: () => _openAurora(
                    (_) => NotificationPreferencesScreen(
                      api: ApiClient(widget.auth),
                    ),
                  ),
                ),
                _NavRow(
                  icon: Icons.logout,
                  label: 'Sign out',
                  onTap: widget.onSignOut,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A card grouping several [_NavRow]s with hairline separators between
/// them — the standard Vidya list-section visual.
class _NavGroup extends StatelessWidget {
  final List<_NavRow> rows;
  const _NavGroup({required this.rows});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i != rows.length - 1)
              Divider(
                height: 1,
                thickness: 1,
                indent: 52,
                color: v.ink3.withValues(alpha: 0.12),
              ),
          ],
        ],
      ),
    );
  }
}

/// A single tappable navigation row: leading icon, label, trailing
/// chevron. Used by the More hub to reach the engagement/account screens.
class _NavRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _NavRow({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: v.ink2),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: v.ink,
                ),
              ),
            ),
            Icon(Icons.chevron_right, color: v.ink3, size: 22),
          ],
        ),
      ),
    );
  }
}

class _ProfileHeaderCard extends StatelessWidget {
  final String initial;
  final String firstName;
  final String email;
  const _ProfileHeaderCard({
    required this.initial,
    required this.firstName,
    required this.email,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            VidyaAvatar(initials: initial, size: 48),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    firstName,
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 20,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    email,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      color: v.ink3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String eyebrow;
  final Widget child;
  const _Section({required this.eyebrow, required this.child});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow,
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 10,
            color: v.ink3,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

class _ThemePickerCard extends StatelessWidget {
  final VidyaThemeModeNotifier notifier;
  final Color accent;
  final Color ink;
  final Color ink3;
  const _ThemePickerCard({
    required this.notifier,
    required this.accent,
    required this.ink,
    required this.ink3,
  });

  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Row(
          children: [
            Expanded(
              child: _ThemeOption(
                label: 'Light',
                selected: notifier.mode == ThemeMode.light,
                onTap: () => notifier.setMode(ThemeMode.light),
                accent: accent,
                ink: ink,
                ink3: ink3,
              ),
            ),
            Expanded(
              child: _ThemeOption(
                label: 'Dark',
                selected: notifier.mode == ThemeMode.dark,
                onTap: () => notifier.setMode(ThemeMode.dark),
                accent: accent,
                ink: ink,
                ink3: ink3,
              ),
            ),
            Expanded(
              child: _ThemeOption(
                label: 'System',
                selected: notifier.mode == ThemeMode.system,
                onTap: () => notifier.setMode(ThemeMode.system),
                accent: accent,
                ink: ink,
                ink3: ink3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ThemeOption extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color accent;
  final Color ink;
  final Color ink3;
  const _ThemeOption({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.accent,
    required this.ink,
    required this.ink3,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: 0.12) : null,
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 14,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? accent : ink3,
          ),
        ),
      ),
    );
  }
}
