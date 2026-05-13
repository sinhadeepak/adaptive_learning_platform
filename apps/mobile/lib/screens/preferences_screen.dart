import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../widgets/alp_card.dart';

/// Edit preferences: language + daily-goal minutes. Wired to PATCH /profile/preferences.
class PreferencesScreen extends StatefulWidget {
  const PreferencesScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends State<PreferencesScreen> {
  String _language = 'en';
  int _dailyGoal = 60;
  bool _saving = false;
  bool _loading = true;
  String? _success;
  String? _error;

  static const _languages = [
    ('en', 'English'),
    ('hi', 'Hindi (हिंदी)'),
    ('hinglish', 'Hinglish'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await widget.api.getProfile();
    if (!mounted) return;
    if (p != null) {
      _language = p.language;
      _dailyGoal = p.dailyGoalMinutes ?? 60;
    }
    setState(() => _loading = false);
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });
    try {
      final updated = await widget.api.updatePreferences(
        language: _language,
        dailyGoalMinutes: _dailyGoal,
      );
      if (!mounted) return;
      if (updated == null) {
        setState(() {
          _error = 'Could not save preferences.';
          _saving = false;
        });
        return;
      }
      setState(() {
        _success = 'Preferences saved.';
        _saving = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Save failed: $e';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(title: const Text('Study Preferences'), backgroundColor: AlpColors.bgSurface1),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AlpColors.colorAi))
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
              children: [
                AlpCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'LANGUAGE',
                        style: TextStyle(
                          color: AlpColors.textMuted,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ..._languages.map((opt) => RadioListTile<String>(
                            value: opt.$1,
                            groupValue: _language,
                            onChanged: (v) => setState(() => _language = v ?? 'en'),
                            activeColor: AlpColors.colorAi,
                            title: Text(opt.$2, style: const TextStyle(color: AlpColors.textPrimary)),
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                          ),),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                AlpCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'DAILY GOAL (MINUTES)',
                        style: TextStyle(
                          color: AlpColors.textMuted,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '$_dailyGoal min / day',
                        style: const TextStyle(
                          color: AlpColors.textPrimary,
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Slider(
                        value: _dailyGoal.toDouble(),
                        min: 15,
                        max: 240,
                        divisions: (240 - 15) ~/ 15,
                        activeColor: AlpColors.colorAi,
                        inactiveColor: AlpColors.bgSurface3,
                        label: '$_dailyGoal min',
                        onChanged: (v) => setState(() => _dailyGoal = v.round()),
                      ),
                      const Text(
                        'Range: 15 min – 4 hours. Tracks against the live study-minutes telemetry.',
                        style: TextStyle(color: AlpColors.textFaint, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(_error!, style: const TextStyle(color: AlpColors.colorRed)),
                  ),
                if (_success != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(_success!, style: const TextStyle(color: AlpColors.colorGreen)),
                  ),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AlpColors.colorBlue,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text(
                      _saving ? 'Saving…' : 'Save Preferences',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
