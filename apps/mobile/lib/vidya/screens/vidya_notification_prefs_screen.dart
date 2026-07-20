// VidyaNotificationPrefsScreen — Phase D. Native per-type notification mute
// toggles (replaces the Aurora NotificationPreferencesScreen). A switch ON
// = enabled; OFF = muted (prefs[type] == false). Persists each toggle via
// ApiClient.updateNotificationPrefs (/profile/notification-prefs).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaNotificationPrefsScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaNotificationPrefsScreen({super.key, required this.auth});

  @override
  State<VidyaNotificationPrefsScreen> createState() =>
      _VidyaNotificationPrefsScreenState();
}

class _VidyaNotificationPrefsScreenState
    extends State<VidyaNotificationPrefsScreen> {
  static const List<({String id, String label, String description})> _kinds = [
    (
      id: 'quiz.completed',
      label: 'Practice results',
      description: 'Bell ping when a practice session is scored.',
    ),
    (
      id: 'mock.completed',
      label: 'Mock test results',
      description: 'Bell ping when a mock test is scored, with projected rank.',
    ),
    (
      id: 'streak.milestone',
      label: 'Streak milestones',
      description: '3 / 7 / 14 / 30 / 60 / 100 / 365-day streak hits.',
    ),
    (
      id: 'streak.broken',
      label: 'Streak reset',
      description: 'When you return after missing a day and the streak resets.',
    ),
    (
      id: 'goal.reached',
      label: 'Daily goal hit',
      description: "When the day's study minutes cross your goal.",
    ),
    (
      id: 'doubt.answered',
      label: 'Doubt replies',
      description:
          'When an expert or AI tutor replies to a thread you started.',
    ),
    (
      id: 'achievement.unlocked',
      label: 'Achievements',
      description: 'Bell ping the first time you unlock a new badge.',
    ),
    (
      id: 'assignment.new',
      label: 'New assignments',
      description: 'Bell ping when your educator publishes a new assignment.',
    ),
  ];

  bool _loading = true;
  Map<String, bool> _prefs = const {};
  String? _busyType;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await ApiClient(widget.auth).getProfile();
      if (!mounted) return;
      setState(() {
        _prefs = Map<String, bool>.from(p?.notificationPrefs ?? const {});
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Muted when explicitly set to false; default (absent) = enabled.
  bool _enabled(String type) => _prefs[type] != false;

  Future<void> _toggle(String type) async {
    final nowEnabled = !_enabled(type);
    setState(() {
      _busyType = type;
      _prefs = {..._prefs, type: nowEnabled};
    });
    final updated = await ApiClient(widget.auth)
        .updateNotificationPrefs({type: nowEnabled});
    if (!mounted) return;
    setState(() {
      if (updated != null) {
        _prefs = Map<String, bool>.from(updated.notificationPrefs);
      }
      _busyType = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Notification preferences',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              children: [
                Text(
                  'Choose which bell notifications you receive.',
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 13,
                    color: v.ink2,
                  ),
                ),
                const SizedBox(height: 16),
                for (final k in _kinds) ...[
                  _PrefRow(
                    label: k.label,
                    description: k.description,
                    enabled: _enabled(k.id),
                    busy: _busyType == k.id,
                    onChanged: (_) => _toggle(k.id),
                  ),
                  const SizedBox(height: 10),
                ],
              ],
            ),
    );
  }
}

class _PrefRow extends StatelessWidget {
  final String label;
  final String description;
  final bool enabled;
  final bool busy;
  final ValueChanged<bool> onChanged;
  const _PrefRow({
    required this.label,
    required this.description,
    required this.enabled,
    required this.busy,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    description,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 12,
                      color: v.ink3,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Switch(
              value: enabled,
              onChanged: busy ? null : onChanged,
            ),
          ],
        ),
      ),
    );
  }
}
