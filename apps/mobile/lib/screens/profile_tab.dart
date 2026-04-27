import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../widgets/activity_heatmap.dart';
import '../widgets/alp_card.dart';
import 'bookmarks_screen.dart';
import 'change_password_screen.dart';
import 'edit_profile_screen.dart';
import 'history_screen.dart';
import 'notification_preferences_screen.dart';
import 'preferences_screen.dart';

/// Profile + settings. User identity, account links, study preferences,
/// sign-out. Mirrors docs/ui/02_MobileApp/21_profile-settings.html.
class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key, required this.api, required this.auth, required this.onSignOut});
  final ApiClient api;
  final AuthClient auth;
  final VoidCallback onSignOut;

  @override
  State<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<ProfileTab> {
  String? _avatarUrl;
  bool _avatarBusy = false;
  List<Achievement> _achievements = const [];

  @override
  void initState() {
    super.initState();
    _loadAvatar();
    _loadAchievements();
  }

  Future<void> _loadAvatar() async {
    final p = await widget.api.getProfile();
    if (!mounted) return;
    setState(() => _avatarUrl = p?.avatarUrl);
  }

  Future<void> _loadAchievements() async {
    final list = await widget.api.achievements();
    if (!mounted) return;
    setState(() => _achievements = list);
  }

  Future<void> _pickAvatar() async {
    if (_avatarBusy) return;
    final picker = ImagePicker();
    final img = await picker.pickImage(
      source: ImageSource.gallery,
      // Cap dimensions client-side so the resulting base64 stays under
      // the backend's 400KB cap. JPEG @ 0.85 from a 256-edge image is
      // typically ~25-50KB.
      maxWidth: 256,
      maxHeight: 256,
      imageQuality: 85,
    );
    if (img == null || !mounted) return;
    setState(() => _avatarBusy = true);
    try {
      final bytes = await img.readAsBytes();
      final mime = (img.mimeType ?? 'image/jpeg').toLowerCase();
      final dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      final updated = await widget.api.setAvatar(dataUrl);
      if (updated != null && mounted) setState(() => _avatarUrl = updated.avatarUrl);
    } finally {
      if (mounted) setState(() => _avatarBusy = false);
    }
  }

  Future<void> _clearAvatar() async {
    if (_avatarBusy) return;
    setState(() => _avatarBusy = true);
    final ok = await widget.api.removeAvatar();
    if (ok && mounted) setState(() => _avatarUrl = null);
    if (mounted) setState(() => _avatarBusy = false);
  }

  ApiClient get api => widget.api;
  AuthClient get auth => widget.auth;
  VoidCallback get onSignOut => widget.onSignOut;

  List<Widget> _buildLockedBadges() {
    const all = <({String kind, String label, String icon})>[
      (kind: 'first_session', label: 'First session', icon: '🎯'),
      (kind: 'streak_3', label: '3-day streak', icon: '🔥'),
      (kind: 'daily_goal_first', label: 'Daily goal hit', icon: '✓'),
      (kind: 'mock_first', label: 'First mock test', icon: '🎓'),
      (kind: 'sessions_10', label: '10 sessions', icon: '📚'),
      (kind: 'streak_7', label: '7-day streak', icon: '🔥'),
      (kind: 'questions_50', label: '50 questions answered', icon: '❓'),
      (kind: 'mocks_5', label: '5 mock tests', icon: '🎓'),
      (kind: 'sessions_50', label: '50 sessions', icon: '📚'),
      (kind: 'streak_14', label: '14-day streak', icon: '🔥'),
      (kind: 'questions_250', label: '250 questions answered', icon: '❓'),
      (kind: 'streak_30', label: '30-day streak', icon: '🔥'),
    ];
    final earned = _achievements.map((a) => a.kind).toSet();
    final locked = all.where((b) => !earned.contains(b.kind)).take(4).toList();
    if (locked.isEmpty) return const [];
    return [
      const SizedBox(height: 14),
      const Text(
        'UP NEXT',
        style: TextStyle(
          color: AlpColors.textMuted,
          fontSize: 10,
          letterSpacing: 0.6,
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: locked
            .map((b) => Opacity(
                  opacity: 0.55,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: AlpColors.bgSurface1,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: AlpColors.borderDefault,
                        style: BorderStyle.solid,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(b.icon, style: const TextStyle(fontSize: 14)),
                        const SizedBox(width: 6),
                        Text(
                          b.label,
                          style: const TextStyle(
                            color: AlpColors.textMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ))
            .toList(),
      ),
    ];
  }

  Widget _buildBadge(Achievement a) {
    final days = a.payload['days'];
    String icon;
    String label;
    Color tone;
    if (a.kind.startsWith('streak_') && days is num) {
      icon = '🔥';
      label = '${days.toInt()}-day streak';
      tone = AlpColors.colorAmber;
    } else if (a.kind == 'first_session') {
      icon = '🎯';
      label = 'First session';
      tone = AlpColors.colorBlue;
    } else if (a.kind == 'daily_goal_first') {
      icon = '✓';
      label = 'Daily goal hit';
      tone = AlpColors.colorGreen;
    } else if (a.kind == 'mock_first') {
      icon = '🎓';
      label = 'First mock test';
      tone = AlpColors.colorPurple;
    } else if (a.kind.startsWith('mocks_')) {
      final n = int.tryParse(a.kind.substring('mocks_'.length)) ?? 0;
      icon = '🎓';
      label = '$n mock tests';
      tone = AlpColors.colorPurple;
    } else if (a.kind.startsWith('sessions_')) {
      final n = int.tryParse(a.kind.substring('sessions_'.length)) ?? 0;
      icon = '📚';
      label = '$n sessions';
      tone = AlpColors.colorGreen;
    } else if (a.kind.startsWith('questions_')) {
      final n = int.tryParse(a.kind.substring('questions_'.length)) ?? 0;
      icon = '❓';
      label = '$n questions answered';
      tone = AlpColors.colorBlue;
    } else {
      icon = '🏆';
      label = a.kind.replaceAll('_', ' ');
      tone = AlpColors.colorBlue;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.withValues(alpha: 0.40)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(icon, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: AlpColors.textPrimary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = auth.user;
    final name = user == null ? 'Guest' : '${user.firstName} ${user.lastName}'.trim();
    final email = user?.email ?? '';
    final initial = (user?.firstName.isNotEmpty ?? false) ? user!.firstName[0].toUpperCase() : '?';

    final joined = _formatJoined();

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_loadAvatar(), _loadAchievements()]);
      },
      color: AlpColors.colorAi,
      backgroundColor: AlpColors.bgSurface2,
      child: ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        // Centered avatar + identity stack matching the design.
        const SizedBox(height: 8),
        Center(
          child: GestureDetector(
            onTap: _avatarBusy ? null : _pickAvatar,
            onLongPress: _avatarUrl == null || _avatarBusy ? null : _clearAvatar,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    image: _avatarUrl != null
                        ? DecorationImage(
                            image: MemoryImage(
                              base64Decode(
                                _avatarUrl!.split(',').last,
                              ),
                            ),
                            fit: BoxFit.cover,
                          )
                        : null,
                    gradient: _avatarUrl == null
                        ? const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFFF5A623), Color(0xFFF43F5E)],
                          )
                        : null,
                    boxShadow: [
                      BoxShadow(
                        color: AlpColors.colorAmber.withValues(alpha: 0.30),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: _avatarUrl == null
                      ? Center(
                          child: Text(
                            initial,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 42,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        )
                      : null,
                ),
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: AlpColors.colorBlue,
                      shape: BoxShape.circle,
                      border: Border.all(color: AlpColors.bgBase, width: 2),
                    ),
                    child: Icon(
                      _avatarBusy
                          ? Icons.hourglass_empty
                          : (_avatarUrl == null ? Icons.add_a_photo : Icons.edit),
                      color: Colors.white,
                      size: 14,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_avatarUrl != null) ...[
          const SizedBox(height: 6),
          Center(
            child: Text(
              'Tap to change · long-press to remove',
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
            ),
          ),
        ],
        const SizedBox(height: 14),
        Center(
          child: Text(
            name.isEmpty ? 'Student' : name,
            style: const TextStyle(color: AlpColors.textPrimary, fontSize: 20, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(height: 4),
        Center(
          child: Text(
            '$email · NEET 2027 · Joined $joined',
            style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
          ),
        ),
        const SizedBox(height: 12),
        Center(
          child: Wrap(
            spacing: 6,
            children: const [
              AlpPill(label: 'PREMIUM', color: AlpColors.colorGreen),
              AlpPill(label: '🔥 14-day streak', color: AlpColors.colorAmber),
              AlpPill(label: 'Top 12%', color: AlpColors.colorPurple),
            ],
          ),
        ),
        const SizedBox(height: 20),

        AlpCard(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'ACHIEVEMENTS · ${_achievements.length}',
                style: const TextStyle(
                  color: AlpColors.textMuted,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              if (_achievements.isNotEmpty)
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _achievements.map(_buildBadge).toList(),
                )
              else
                const Text(
                  'No badges yet — start practicing to unlock the first one.',
                  style: TextStyle(color: AlpColors.textMuted, fontSize: 13, height: 1.4),
                ),
              ..._buildLockedBadges(),
            ],
          ),
        ),
        const SizedBox(height: 12),

        if (user != null) ...[
          AlpCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'ACTIVITY · LAST 30 DAYS',
                  style: TextStyle(
                    color: AlpColors.textMuted,
                    fontSize: 11,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 10),
                ActivityHeatmap(api: api, userId: user.id),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        _SettingsGroup(
          title: 'ACCOUNT',
          rows: [
            _SettingsRow(
              icon: Icons.person_outline,
              title: 'Edit Profile',
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => EditProfileScreen(api: api, auth: auth),
              )),
            ),
            _SettingsRow(
              icon: Icons.lock_outline,
              title: 'Change Password',
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => ChangePasswordScreen(auth: auth),
              )),
            ),
            _SettingsRow(
              icon: Icons.language,
              title: 'Language',
              trailing: 'Tap to change',
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => PreferencesScreen(api: api),
              )),
            ),
          ],
        ),
        const SizedBox(height: 12),

        _SettingsGroup(
          title: 'STUDY',
          rows: [
            _SettingsRow(
              icon: Icons.bookmark_outline,
              title: 'Saved Questions',
              trailing: 'View',
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => BookmarksScreen(api: api, auth: auth),
              )),
            ),
            _SettingsRow(
              icon: Icons.history,
              title: 'Practice History',
              trailing: 'View',
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => HistoryScreen(api: api, auth: auth),
              )),
            ),
            _SettingsRow(
              icon: Icons.flag_outlined,
              title: 'Target Exam',
              trailing: 'NEET 2027',
              onTap: () => _placeholder(context, 'Target exam'),
            ),
            _SettingsRow(
              icon: Icons.timer_outlined,
              title: 'Daily Goal',
              trailing: 'Tap to edit',
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => PreferencesScreen(api: api),
              )),
            ),
            _SettingsRow(
              icon: Icons.cloud_off_outlined,
              title: 'Offline Mode',
              trailingWidget: Switch(value: false, onChanged: (_) => _placeholder(context, 'Offline mode')),
            ),
          ],
        ),
        const SizedBox(height: 12),

        _SettingsGroup(
          title: 'APP',
          rows: [
            _SettingsRow(
              icon: Icons.notifications_outlined,
              title: 'Notifications',
              trailing: 'Edit',
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => NotificationPreferencesScreen(api: api),
              )),
            ),
            _SettingsRow(icon: Icons.help_outline, title: 'Help & Support', onTap: () => _placeholder(context, 'Help')),
            _SettingsRow(icon: Icons.info_outline, title: 'About', trailing: 'v0.1.0', onTap: () => _placeholder(context, 'About')),
          ],
        ),

        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: onSignOut,
            icon: const Icon(Icons.logout, color: AlpColors.colorRed),
            label: const Text('Sign Out', style: TextStyle(color: AlpColors.colorRed)),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AlpColors.colorRed),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ),
      ],
      ),
    );
  }

  void _placeholder(BuildContext context, String name) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$name — coming in next mobile pass'),
        backgroundColor: AlpColors.bgSurface3,
      ),
    );
  }

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  String _formatJoined() {
    final now = DateTime.now();
    return '${_months[now.month - 1]} ${now.year}';
  }
}

class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.title, required this.rows});
  final String title;
  final List<_SettingsRow> rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 0, 8),
          child: Text(
            title,
            style: const TextStyle(
              color: AlpColors.textMuted,
              fontSize: 11,
              letterSpacing: 0.8,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        AlpCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                rows[i],
                if (i < rows.length - 1)
                  const Divider(height: 1, color: AlpColors.borderDefault),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.title,
    this.trailing,
    this.trailingWidget,
    this.onTap,
  });
  final IconData icon;
  final String title;
  final String? trailing;
  final Widget? trailingWidget;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Icon(icon, color: AlpColors.colorAi, size: 20),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(color: AlpColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ),
              if (trailing != null)
                Text(trailing!, style: const TextStyle(color: AlpColors.textMuted, fontSize: 12)),
              if (trailingWidget != null) trailingWidget!,
              if (trailing == null && trailingWidget == null && onTap != null)
                const Icon(Icons.chevron_right, color: AlpColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
