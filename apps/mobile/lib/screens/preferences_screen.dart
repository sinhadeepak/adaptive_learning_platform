import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../aurora/widgets/widgets.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../quiz/content_language_helper.dart';
import '../widgets/alp_card.dart';
import 'onboarding/welcome_screen.dart';

/// Edit preferences: language + daily-goal minutes. Wired to PATCH /profile/preferences.
class PreferencesScreen extends StatefulWidget {
  const PreferencesScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends State<PreferencesScreen> {
  String _language = 'en';
  String _contentLanguage = 'en';
  int _dailyGoal = 60;
  bool _saving = false;
  bool _savingContentLang = false;
  bool _loading = true;
  String? _success;
  String? _error;

  static const _languages = [
    ('en', 'English'),
    ('hi', 'Hindi (हिंदी)'),
    ('hinglish', 'Hinglish'),
  ];

  /// Options for Question language — matches backend contentLanguage enum.
  static const _contentLanguages = [
    ('en', 'English'),
    ('hi', 'हिन्दी'),
    ('ta', 'தமிழ்'),
    ('te', 'తెలుగు'),
    ('bn', 'বাংলা'),
    ('mr', 'मराठी'),
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
      _contentLanguage = p.contentLanguage;
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

  /// Patches only { contentLanguage } — separate call, independent of App Language.
  Future<void> _saveContentLanguage(String lang) async {
    setState(() {
      _savingContentLang = true;
      _error = null;
    });
    try {
      final updated = await widget.api.updateContentLanguage(lang);
      if (!mounted) return;
      if (updated == null) {
        setState(() => _error = 'Could not save question language.');
      } else {
        // Invalidate the in-memory cache so the new language is used on next session start.
        resetContentLanguageCache();
        _contentLanguage = lang;
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Could not save question language: $e');
    } finally {
      if (mounted) setState(() => _savingContentLang = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuroraScaffold(
      appBar: AuroraAppBar(title: 'Study Preferences', backgroundColor: AlpColors.bgSurface1),
      body: _loading
          ? const Center(child: AuroraSpinner(size: 32))
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
              children: [
                AlpCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'APP LANGUAGE',
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
                            title: Text(opt.$2, style: const TextStyle()),
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
                        'QUESTION LANGUAGE',
                        style: TextStyle(
                          color: AlpColors.textMuted,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Questions will be delivered in this language when a translation is available. Independent of your app language.',
                        style: TextStyle(color: AlpColors.textFaint, fontSize: 11),
                      ),
                      const SizedBox(height: 8),
                      ..._contentLanguages.map((opt) => RadioListTile<String>(
                            value: opt.$1,
                            groupValue: _contentLanguage,
                            onChanged: _savingContentLang
                                ? null
                                : (v) {
                                    final lang = v ?? 'en';
                                    setState(() => _contentLanguage = lang);
                                    _saveContentLanguage(lang);
                                  },
                            activeColor: AlpColors.colorAi,
                            title: Text(opt.$2, style: const TextStyle()),
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                          ),),
                      if (_savingContentLang)
                        const Padding(
                          padding: EdgeInsets.only(top: 6),
                          child: Text(
                            'Saving…',
                            style: TextStyle(color: AlpColors.textFaint, fontSize: 11),
                          ),
                        ),
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
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text(
                      _saving ? 'Saving…' : 'Save Preferences',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                if (kDebugMode) ...[
                  const SizedBox(height: 24),
                  AlpCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'DEBUG',
                          style: TextStyle(
                            color: AlpColors.textMuted,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Visible in debug builds only — stripped from release.',
                          style: TextStyle(color: AlpColors.textFaint, fontSize: 11),
                        ),
                        const SizedBox(height: 12),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: const Text(
                            'Preview onboarding flow',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: const Text(
                            'Step through Welcome → Exam → Language → Target → Goal '
                            'without touching server-side onboarding state.',
                            style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
                          ),
                          trailing: const Icon(
                            Icons.chevron_right,
                            color: AlpColors.textMuted,
                          ),
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => WelcomeScreen(
                                  onContinue: () =>
                                      Navigator.of(context).pop(),
                                ),
                                fullscreenDialog: true,
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}
