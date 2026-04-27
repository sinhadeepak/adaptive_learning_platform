import 'dart:math' as math;

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';
import '../widgets/alp_card.dart';
import '../widgets/home_cards.dart';
import '../widgets/inbox_bell.dart';

/// Home dashboard — readiness ring, streak, quick actions, top subjects.
/// Mirrors docs/ui/02_MobileApp/16_home.html.
class HomeTab extends StatefulWidget {
  const HomeTab({super.key, required this.api, required this.auth, required this.onJump});
  final ApiClient api;
  final AuthClient auth;
  final ValueChanged<int> onJump;

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  Readiness? _readiness;
  Streak? _streak;
  List<TopicMastery>? _mastery;
  UserProfile? _profile;
  int _todayMinutes = 0;
  int _todaySessions = 0;
  List<SessionHistoryRow> _inProgress = const [];
  Map<String, String> _topicTitles = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final user = widget.auth.user;
    if (user == null) return;
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        widget.api.readiness(user.id),
        widget.api.streak(user.id),
        widget.api.mastery(user.id),
        widget.api.getProfile(),
        widget.api.dailyActivity(user.id, days: 1),
        widget.api.sessionHistory(user.id, limit: 20),
      ]);
      final readiness = results[0] as Readiness;
      final streak = results[1] as Streak;
      final mastery = results[2] as List<TopicMastery>;
      final profile = results[3] as UserProfile?;
      final activity = results[4] as List<DailyActivity>;
      final history = results[5] as List<SessionHistoryRow>;
      final inProgress = history.where((r) => r.status == 'IN_PROGRESS').toList();
      // Today's row may not exist if the student hasn't studied yet; fall to 0.
      final todayKey = DateTime.now();
      final today = activity.firstWhere(
        (a) => a.date.year == todayKey.year &&
            a.date.month == todayKey.month &&
            a.date.day == todayKey.day,
        orElse: () => DailyActivity(
          date: DateTime(todayKey.year, todayKey.month, todayKey.day),
          sessions: 0,
          questions: 0,
          minutes: 0,
        ),
      );
      // Hydrate titles for the top topics + any in-progress sessions so the
      // resume card can render a real topic name.
      final titles = <String, String>{};
      final top = [...mastery]..sort((a, b) => b.ewa.compareTo(a.ewa));
      final wantTopics = <String>{
        ...top.take(6).map((m) => m.topicId),
        ...inProgress.map((r) => r.topicId),
      };
      for (final id in wantTopics) {
        try {
          final t = await widget.api.topic(id);
          if (t != null) titles[id] = t.title;
        } catch (_) {/* keep going */}
      }
      if (!mounted) return;
      setState(() {
        _readiness = readiness;
        _streak = streak;
        _mastery = mastery;
        _profile = profile;
        _todayMinutes = today.minutes;
        _todaySessions = today.sessions;
        _inProgress = inProgress;
        _topicTitles = titles;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user;
    final firstName = user?.firstName ?? 'there';
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    final readinessPct = _readiness == null ? 0 : (_readiness!.score * 100).round();

    return RefreshIndicator(
      onRefresh: _refresh,
      backgroundColor: AlpColors.bgSurface2,
      color: AlpColors.colorAi,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          // Greeting + inbox bell
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$greeting 🌅', style: const TextStyle(color: AlpColors.textMuted, fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(
                      firstName,
                      style: const TextStyle(
                        color: AlpColors.textPrimary,
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              InboxBellButton(api: widget.api, auth: widget.auth),
            ],
          ),
          const SizedBox(height: 16),

          // Readiness hero card
          AlpCard(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF1A1B3A), Color(0xFF20273E)],
            ),
            borderColor: const Color(0xFF2A3050),
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                _ReadinessRing(pct: readinessPct.toDouble(), size: 80),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'NEET READINESS',
                        style: TextStyle(
                          color: AlpColors.textMuted,
                          fontSize: 11,
                          letterSpacing: 0.8,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _loading ? '—' : readinessPct.toStringAsFixed(1),
                        style: const TextStyle(
                          color: AlpColors.colorAi,
                          fontSize: 36,
                          fontWeight: FontWeight.w700,
                          height: 1,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _readiness == null
                            ? 'Take a quiz to seed your readiness'
                            : '${_readiness!.nTopics} topics tracked',
                        style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Streak-in-danger nudge — last_active_date is yesterday and the
          // streak is alive; surfaces only on this exact day-1-gap window so
          // it doesn't appear when already practiced today (gap=0) or when
          // the streak has already broken (gap>1).
          if (_streak != null && _streak!.current > 0 && _isStreakInDanger(_streak!)) ...[
            const SizedBox(height: 12),
            _StreakDangerCard(
              streak: _streak!,
              onStart: () => widget.onJump(2), // Practice tab
            ),
          ],

          // Resume card — surfaces any IN_PROGRESS sessions so the student
          // can pick up where they left off without hunting through History.
          if (_inProgress.isNotEmpty) ...[
            const SizedBox(height: 12),
            _ResumeCard(
              row: _inProgress.first,
              topicTitle: _topicTitles[_inProgress.first.topicId],
              extraCount: _inProgress.length - 1,
              onResume: () => _resume(_inProgress.first),
            ),
          ],

          // Streak card
          if (_streak != null && _streak!.current > 0) ...[
            const SizedBox(height: 12),
            _StreakCard(streak: _streak!),
          ],

          // Daily goal — only when the student has set a goal in onboarding
          // or Preferences. We render real today-minutes from analytics and
          // refresh on pull-to-refresh.
          if (_profile?.dailyGoalMinutes != null && _profile!.dailyGoalMinutes! > 0) ...[
            const SizedBox(height: 12),
            _DailyGoalCard(
              goalMinutes: _profile!.dailyGoalMinutes!,
              minutesToday: _todayMinutes,
              sessionsToday: _todaySessions,
            ),
          ],

          // ── Predicted AIR (compact) — taps through to Rank tab ─────
          const SizedBox(height: 12),
          HomeRankCompactCard(
            api: widget.api,
            auth: widget.auth,
            onJumpToRank: () => widget.onJump(3),
          ),

          // ── Photo Doubt CTA ────────────────────────────────────────
          const SizedBox(height: 12),
          HomePhotoDoubtCard(api: widget.api),

          // ── Guided Next Steps (3 ranked AI actions) ────────────────
          const AlpSectionHeading('Guided Next Steps'),
          GuidedNextStepsCard(api: widget.api, auth: widget.auth),

          // ── 7-day Study Plan trigger ───────────────────────────────
          const SizedBox(height: 12),
          StudyPlanCard(api: widget.api, auth: widget.auth),

          // ── Cross-topic weakness diagnosis (auto-hides until enough data) ─
          const SizedBox(height: 12),
          WeaknessDiagnosisCard(api: widget.api, auth: widget.auth),

          // Quick actions (kept as direct nav)
          const AlpSectionHeading('Quick Actions'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.6,
            children: [
              _QuickAction(
                icon: Icons.bolt_rounded,
                accent: AlpColors.colorBlue,
                title: 'Adaptive Practice',
                subtitle: 'AI-powered',
                onTap: () => widget.onJump(2),
              ),
              _QuickAction(
                icon: Icons.description_outlined,
                accent: AlpColors.colorPurple,
                title: 'Mock Test',
                subtitle: 'Full length',
                onTap: () => widget.onJump(2),
              ),
              _QuickAction(
                icon: Icons.show_chart_rounded,
                accent: AlpColors.colorGreen,
                title: 'My Progress',
                subtitle: 'Analytics',
                onTap: () => widget.onJump(1),
              ),
              _QuickAction(
                icon: Icons.chat_bubble_outline,
                accent: AlpColors.colorAi,
                title: 'Ask Doubt',
                subtitle: 'Get help',
                onTap: () => widget.onJump(4),
              ),
            ],
          ),

          // Subjects
          AlpSectionHeading(
            'Subjects',
            trailing: TextButton(
              onPressed: () => widget.onJump(1),
              child: const Text('Details ›', style: TextStyle(color: AlpColors.colorAi, fontSize: 12)),
            ),
          ),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator(color: AlpColors.colorAi)),
            )
          else if (_mastery == null || _mastery!.isEmpty)
            const AlpCard(
              child: Text(
                'No mastery data yet — complete a quiz to start tracking subjects.',
                style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
              ),
            )
          else
            ..._mastery!
                .where((m) => _topicTitles.containsKey(m.topicId))
                .take(4)
                .map((m) => _SubjectRow(
                      title: _topicTitles[m.topicId] ?? 'Topic',
                      ewa: m.ewa,
                      n: m.n,
                      onTap: () => _startTopic(m.topicId),
                    )),
        ],
      ),
    );
  }

  Future<void> _resume(SessionHistoryRow row) async {
    final client = QuizClient(auth: widget.auth);
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => QuizScreen(client: client, sessionId: row.sessionId, api: widget.api),
    ));
    if (mounted) _refresh();
  }

  Future<void> _startTopic(String topicId) async {
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final client = QuizClient(auth: widget.auth);
      final session = await client.start(topicId: topicId, userId: user.id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: session.sessionId, api: widget.api),
      ));
      if (mounted) _refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not start: $e')),
        );
      }
    }
  }
}

class _ReadinessRing extends StatelessWidget {
  const _ReadinessRing({required this.pct, this.size = 80});
  final double pct;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: CustomPaint(painter: _RingPainter(pct: pct)),
          ),
          Text(
            pct.toStringAsFixed(0),
            style: const TextStyle(
              color: AlpColors.textPrimary,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.pct});
  final double pct;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = 8.0;
    final rect = Rect.fromLTWH(stroke / 2, stroke / 2, size.width - stroke, size.height - stroke);
    final track = Paint()
      ..color = AlpColors.bgSurface3
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    final progress = Paint()
      ..shader = const LinearGradient(
        colors: [AlpColors.colorAi, Color(0xFF7B68EE)],
      ).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = stroke;
    canvas.drawArc(rect, 0, 2 * math.pi, false, track);
    canvas.drawArc(rect, -math.pi / 2, 2 * math.pi * (pct / 100).clamp(0, 1), false, progress);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.pct != pct;
}

bool _isStreakInDanger(Streak s) {
  final lastIso = s.lastActiveDate;
  if (lastIso == null) return false;
  try {
    final last = DateTime.parse(lastIso);
    final now = DateTime.now();
    final lastMid = DateTime(last.year, last.month, last.day);
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(lastMid).inDays;
    return diff == 1; // exactly one day gap → at risk today
  } catch (_) {
    return false;
  }
}

class _StreakDangerCard extends StatelessWidget {
  const _StreakDangerCard({required this.streak, required this.onStart});
  final Streak streak;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF2C1F12), Color(0xFF3A2A18)],
      ),
      borderColor: AlpColors.colorAmber.withValues(alpha: 0.40),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          const Text('🔥', style: TextStyle(fontSize: 28)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Don't lose your ${streak.current}-day streak",
                  style: const TextStyle(
                    color: AlpColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Practice today — even one quick session counts.',
                  style: TextStyle(color: AlpColors.textMuted, fontSize: 12, height: 1.3),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: onStart,
            style: ElevatedButton.styleFrom(
              backgroundColor: AlpColors.colorAmber,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text(
              'Start',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _ResumeCard extends StatelessWidget {
  const _ResumeCard({
    required this.row,
    required this.onResume,
    this.topicTitle,
    this.extraCount = 0,
  });
  final SessionHistoryRow row;
  final String? topicTitle;
  final int extraCount;
  final VoidCallback onResume;

  @override
  Widget build(BuildContext context) {
    final remaining = (row.targetCount - row.servedCount).clamp(0, 1 << 30);
    return AlpCard(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF1A2540), Color(0xFF1F2C4A)],
      ),
      borderColor: AlpColors.colorAi.withValues(alpha: 0.30),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.replay_circle_filled, color: AlpColors.colorAi, size: 22),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Resume practice',
                  style: TextStyle(
                    color: AlpColors.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (extraCount > 0)
                AlpPill(label: '+$extraCount more', color: AlpColors.colorAmber),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            topicTitle ?? 'Topic #${row.topicId.substring(0, 8)}',
            style: const TextStyle(color: AlpColors.textPrimary, fontSize: 14),
          ),
          const SizedBox(height: 4),
          Text(
            '$remaining question${remaining == 1 ? '' : 's'} left · ${row.correctCount}/${row.servedCount} correct so far',
            style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onResume,
              icon: const Icon(Icons.play_arrow_rounded, size: 18),
              label: const Text('Continue', style: TextStyle(fontWeight: FontWeight.w700)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AlpColors.colorAi,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DailyGoalCard extends StatelessWidget {
  const _DailyGoalCard({
    required this.goalMinutes,
    required this.minutesToday,
    required this.sessionsToday,
  });
  final int goalMinutes;
  final int minutesToday;
  final int sessionsToday;

  @override
  Widget build(BuildContext context) {
    final pct = (minutesToday / goalMinutes).clamp(0.0, 1.0);
    final met = pct >= 1.0;
    final tone = met
        ? AlpColors.colorGreen
        : pct >= 0.4
            ? AlpColors.colorBlue
            : AlpColors.colorAmber;
    final remaining = (goalMinutes - minutesToday).clamp(0, 1 << 30);
    return AlpCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                "TODAY'S GOAL",
                style: TextStyle(
                  color: AlpColors.textMuted,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              AlpPill(
                label: '${(pct * 100).round()}%',
                color: tone,
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 10,
              backgroundColor: AlpColors.bgSurface3,
              valueColor: AlwaysStoppedAnimation<Color>(tone),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '$minutesToday / $goalMinutes min',
                style: const TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                met
                    ? '✓ Goal reached — $sessionsToday session${sessionsToday == 1 ? '' : 's'} today'
                    : '$remaining min to go · $sessionsToday session${sessionsToday == 1 ? '' : 's'}',
                style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StreakCard extends StatelessWidget {
  const _StreakCard({required this.streak});
  final Streak streak;

  @override
  Widget build(BuildContext context) {
    final days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    final today = DateTime.now().weekday - 1; // 0 = Mon
    return AlpCard(
      gradient: const LinearGradient(
        colors: [Color(0xFF2C1F12), Color(0xFF1F1810)],
      ),
      borderColor: const Color(0xFF4A2F18),
      child: Column(
        children: [
          Row(
            children: [
              Text(
                '${streak.current}',
                style: const TextStyle(
                  color: AlpColors.colorAmber,
                  fontSize: 38,
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'day streak · Best: ${streak.longest}',
                      style: const TextStyle(color: AlpColors.textSecondary, fontSize: 13),
                    ),
                  ],
                ),
              ),
              const Text('🔥', style: TextStyle(fontSize: 28)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(7, (i) {
              final past = i < today;
              final isToday = i == today;
              return Container(
                width: 32,
                height: 36,
                decoration: BoxDecoration(
                  color: isToday
                      ? AlpColors.colorAmber
                      : past
                          ? AlpColors.colorAmber.withValues(alpha: 0.20)
                          : AlpColors.bgSurface3,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Center(
                  child: Text(
                    past ? '✓' : days[i],
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isToday ? AlpColors.bgBase : AlpColors.textSecondary,
                    ),
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.accent,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final Color accent;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: accent, size: 20),
          ),
          const Spacer(),
          Text(
            title,
            style: const TextStyle(
              color: AlpColors.textPrimary,
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  const _SubjectRow({required this.title, required this.ewa, required this.n, required this.onTap});
  final String title;
  final double ewa;
  final int n;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final pct = (ewa * 100).round();
    final tone = ewa >= 0.7
        ? AlpColors.colorGreen
        : ewa >= 0.4
            ? AlpColors.colorBlue
            : AlpColors.colorRed;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AlpCard(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      color: AlpColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Text(
                  '$pct%',
                  style: TextStyle(color: tone, fontSize: 14, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                minHeight: 4,
                value: ewa.clamp(0, 1),
                backgroundColor: AlpColors.bgSurface3,
                valueColor: AlwaysStoppedAnimation<Color>(tone),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '$n session${n == 1 ? '' : 's'}',
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
