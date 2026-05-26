// VidyaHomeScreen — Phase 3a.1 implements slide-7 content (greeting +
// READINESS card + NEXT SESSION card + stats row). Each endpoint
// degrades independently: a failure renders '—' for that card and lets
// the rest of the screen continue.
//
// Deliberately has no Timer.periodic. The InboxBell-style notification
// poll lands later via Stream/ValueNotifier so pumpAndSettle() keeps
// working in tests.
//
// Phase 3a.2 will add: 12-week readiness sparkline, TODAY checklist,
// avatar + bell in the header, skeleton placeholders.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../shell/vidya_main_shell_scope.dart';

class VidyaHomeScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaHomeScreen({super.key, required this.auth});

  @override
  State<VidyaHomeScreen> createState() => _VidyaHomeScreenState();
}

class _VidyaHomeScreenState extends State<VidyaHomeScreen> {
  // The score scale on slide 7. Underlying readiness is 0..1.
  static const int _scoreScale = 900;
  // TODAY shows "questions today / goal". 5 is a v1 placeholder until
  // UserProfile.dailyGoal{Minutes,Questions} settles in Phase 3a.2.
  static const int _todayGoalQuestions = 5;

  bool _loading = true;
  _HomeData? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  // Per-future best-effort wrapper — Dart 3's Future.catchError requires
  // the handler return the future's type (e.g. non-nullable Readiness),
  // so a try/await/catch around each call is the cleanest way to widen
  // to nullable on failure.
  Future<T?> _safe<T>(Future<T> Function() fetch) async {
    try {
      return await fetch();
    } catch (_) {
      return null;
    }
  }

  Future<void> _load() async {
    final user = widget.auth.user;
    if (user == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    final api = ApiClient(widget.auth);
    final results = await Future.wait<Object?>([
      _safe<UserProfile?>(() => api.getProfile()),
      _safe<Readiness>(() => api.readiness(user.id)),
      _safe<Streak>(() => api.streak(user.id)),
      _safe<List<DailyActivity>>(() => api.dailyActivity(user.id, days: 1)),
      _safe<List<MockAttemptRow>>(() => api.mockAttempts()),
    ]);
    if (!mounted) return;
    final profile = results[0] as UserProfile?;
    final readiness = results[1] as Readiness?;
    final streak = results[2] as Streak?;
    final daily = (results[3] as List<DailyActivity>?) ?? const [];
    final mocks = (results[4] as List<MockAttemptRow>?) ?? const [];
    setState(() {
      _data = _HomeData(
        firstName: profile?.firstName ?? user.firstName,
        readinessScore: readiness?.score,
        streakDays: streak?.current,
        questionsToday: daily.fold<int>(0, (sum, d) => sum + d.questions),
        mockCount: mocks.length,
      );
      _loading = false;
    });
  }

  String _todayEyebrow() {
    final now = DateTime.now();
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const months = [
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    ];
    return '${days[now.weekday - 1]} · ${months[now.month - 1]} ${now.day}';
  }

  void _startPractice() {
    VidyaMainShellScope.of(context)?.switchTo(VidyaShellTab.practice);
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final d = _data;
    if (d == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            "We couldn't load your home yet. Sign out and back in if this persists.",
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontSize: 14,
              color: v.ink2,
            ),
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        Text(
          _todayEyebrow(),
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Hi, ${d.firstName}.',
          style: TextStyle(
            fontFamily: VidyaFonts.display,
            fontSize: 32,
            fontWeight: FontWeight.w500,
            color: v.ink,
            height: 1.1,
          ),
        ),
        const SizedBox(height: 20),
        _ReadinessCard(score: d.readinessScore, scale: _scoreScale),
        const SizedBox(height: 12),
        _NextSessionCard(onStart: _startPractice),
        const SizedBox(height: 12),
        _StatsRow(
          streakDays: d.streakDays,
          questionsToday: d.questionsToday,
          mockCount: d.mockCount,
          todayGoal: _todayGoalQuestions,
        ),
      ],
    );
  }
}

class _HomeData {
  final String firstName;
  final double? readinessScore;
  final int? streakDays;
  final int? questionsToday;
  final int? mockCount;
  const _HomeData({
    required this.firstName,
    this.readinessScore,
    this.streakDays,
    this.questionsToday,
    this.mockCount,
  });
}

class _ReadinessCard extends StatelessWidget {
  final double? score;
  final int scale;
  const _ReadinessCard({required this.score, required this.scale});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final scaled = score == null ? '—' : (score! * scale).round().toString();
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'READINESS',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  '$scaled / $scale',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 36,
                    fontWeight: FontWeight.w600,
                    color: v.ink,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _NextSessionCard extends StatelessWidget {
  final VoidCallback onStart;
  const _NextSessionCard({required this.onStart});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'NEXT SESSION',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Take a quick practice session',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 20,
                fontWeight: FontWeight.w500,
                color: v.ink,
                height: 1.25,
              ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: 'Start practice',
              onPressed: onStart,
              size: VidyaButtonSize.md,
            ),
          ],
        ),
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  final int? streakDays;
  final int? questionsToday;
  final int? mockCount;
  final int todayGoal;
  const _StatsRow({
    required this.streakDays,
    required this.questionsToday,
    required this.mockCount,
    required this.todayGoal,
  });

  String _orDash(int? v, String suffix) =>
      v == null ? '—' : (suffix.isEmpty ? '$v' : '$v$suffix');

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatTile(label: 'STREAK', value: _orDash(streakDays, ' d'))),
        const SizedBox(width: 8),
        Expanded(
          child: _StatTile(
            label: 'TODAY',
            value: questionsToday == null
                ? '—'
                : '$questionsToday / $todayGoal',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(child: _StatTile(label: 'MOCKS', value: _orDash(mockCount, ''))),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  const _StatTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                color: v.ink3,
                letterSpacing: 1.4,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: v.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
