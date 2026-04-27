import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../widgets/alp_card.dart';

/// Per-type mute toggles. Server-side filter: producers consult the user's
/// prefs (via /internal/profile) before posting to the inbox, so a muted
/// type never lands in the bell.
class NotificationPreferencesScreen extends StatefulWidget {
  const NotificationPreferencesScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<NotificationPreferencesScreen> createState() =>
      _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState
    extends State<NotificationPreferencesScreen> {
  bool _loading = true;
  Map<String, bool> _prefs = const {};
  String? _busyType;

  static const List<({String id, String label, String description})> _kinds = [
    (
      id: 'quiz.completed',
      label: 'Practice results',
      description: 'Bell ping when a practice session is scored.',
    ),
    (
      id: 'mock.completed',
      label: 'Mock test results',
      description: 'Bell ping when an AI mock test is scored, with projected AIR.',
    ),
    (
      id: 'streak.milestone',
      label: 'Streak milestones',
      description: '🔥 3 / 7 / 14 / 30 / 60 / 100 / 365-day streak hits.',
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
      description: 'When an expert or AI tutor replies to a thread you started.',
    ),
    (
      id: 'achievement.unlocked',
      label: 'Achievements',
      description: 'Bell ping the first time you unlock a new badge.',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await widget.api.getProfile();
    if (!mounted) return;
    setState(() {
      _prefs = Map<String, bool>.from(p?.notificationPrefs ?? const {});
      _loading = false;
    });
  }

  bool _isMuted(String type) => _prefs[type] == false;

  Future<void> _toggle(String type) async {
    if (_busyType != null) return;
    final wantMuted = !_isMuted(type) ? false : true;
    setState(() {
      _busyType = type;
      _prefs = {..._prefs, type: wantMuted};
    });
    final updated = await widget.api.updateNotificationPrefs({type: wantMuted});
    if (!mounted) return;
    setState(() {
      _busyType = null;
      if (updated != null) {
        _prefs = Map<String, bool>.from(updated.notificationPrefs);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(
        title: const Text('Notifications'),
        backgroundColor: AlpColors.bgSurface1,
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: AlpColors.colorAi))
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  const Padding(
                    padding: EdgeInsets.only(bottom: 12, left: 4),
                    child: Text(
                      "Mute the categories you don't want pinging your inbox bell. "
                      'Changes take effect for future events; already-delivered '
                      "notifications stay in your inbox until you mark them read.",
                      style: TextStyle(color: AlpColors.textMuted, fontSize: 13, height: 1.45),
                    ),
                  ),
                  for (final kind in _kinds) ...[
                    AlpCard(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  kind.label,
                                  style: const TextStyle(
                                    color: AlpColors.textPrimary,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  kind.description,
                                  style: const TextStyle(
                                    color: AlpColors.textMuted,
                                    fontSize: 12,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Switch(
                            value: !_isMuted(kind.id),
                            onChanged:
                                _busyType != null ? null : (_) => _toggle(kind.id),
                            activeThumbColor: AlpColors.colorBlue,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ],
              ),
      ),
    );
  }
}
