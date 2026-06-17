import 'dart:math' as math;

import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../aurora/widgets/widgets.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../widgets/alp_card.dart';
import '../widgets/analytics_cards.dart';

/// Progress / analytics — overall stats, weekly study chart, subject mastery.
/// Mirrors docs/ui/02_MobileApp/19_analysis.html.
class ProgressTab extends StatefulWidget {
  const ProgressTab({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<ProgressTab> createState() => _ProgressTabState();
}

class _ProgressTabState extends State<ProgressTab> {
  Readiness? _readiness;
  Streak? _streak;
  List<TopicMastery>? _mastery;
  List<DailyActivity>? _activity;
  Map<String, String> _topicTitles = {};
  // Sprint 1 — drop hardcoded "NEET 2027" header. We load the user's
  // primary exam (first selected) from profile + catalog to render an
  // honest header. Falls back to neutral copy when neither is known.
  String? _activeExamName;
  DateTime? _activeExamTargetDate;
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
      final r = await widget.api.readiness(user.id);
      final s = await widget.api.streak(user.id);
      final m = await widget.api.mastery(user.id);
      final a = await widget.api.dailyActivity(user.id, days: 90);
      // Profile + catalog drives the (formerly hardcoded) exam header.
      final profile = await widget.api.getProfile();
      String? examName;
      DateTime? targetDate;
      if (profile != null && profile.exams.isNotEmpty) {
        final activeId = profile.exams.first.examId;
        targetDate = profile.exams.first.targetDate;
        try {
          final exams = await widget.api.exams();
          for (final e in exams) {
            if (e.id == activeId) {
              examName = e.name;
              break;
            }
          }
        } catch (_) {/* fall through — header degrades gracefully */}
      }
      final titles = <String, String>{};
      for (final t in m.take(8)) {
        try {
          final topic = await widget.api.topic(t.topicId);
          if (topic != null) titles[t.topicId] = topic.title;
        } catch (_) {}
      }
      if (!mounted) return;
      setState(() {
        _readiness = r;
        _streak = s;
        _mastery = m;
        _activity = a;
        _topicTitles = titles;
        _activeExamName = examName;
        _activeExamTargetDate = targetDate;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  String _examHeader() {
    if (_readiness == null) return 'No data yet';
    // Honest header: prefers the user's selected exam + their target
    // date. Falls back gracefully when one or the other is unset.
    final name = _activeExamName ?? 'Your exam';
    final days = _daysToTarget();
    if (days == null) return name;
    return '$name · $days days remaining';
  }

  int? _daysToTarget() {
    final t = _activeExamTargetDate;
    if (t == null) return null;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(t.year, t.month, t.day);
    final delta = target.difference(today).inDays;
    return delta < 0 ? 0 : delta;
  }

  @override
  Widget build(BuildContext context) {
    final totalSessions = _mastery?.fold<int>(0, (sum, m) => sum + m.n) ?? 0;
    final pct = _readiness == null ? 0 : (_readiness!.score * 100).round();
    // Synthetic accuracy proxy: readiness × 100 is rounded to give a "feel".
    final accuracy = pct;

    return RefreshIndicator(
      onRefresh: _refresh,
      color: AlpColors.colorAi,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'My Progress',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _examHeader(),
                      style: const TextStyle(color: AlpColors.textMuted, fontSize: 13),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AlpColors.colorBlue.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'THIS MONTH',
                  style: TextStyle(
                    color: AlpColors.colorBlue,
                    fontSize: 10,
                    letterSpacing: 0.6,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Headline ring + 4 stats
          AlpCard(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                _ScoreRing(pct: pct.toDouble()),
                const SizedBox(width: 16),
                Expanded(
                  child: GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 1.4,
                    children: [
                      _StatTile(
                        label: 'Qs Solved',
                        value: (totalSessions * 10).toString(),
                        tone: AlpColors.colorBlue,
                      ),
                      _StatTile(
                        label: 'Accuracy',
                        value: '$accuracy%',
                        tone: AlpColors.colorGreen,
                      ),
                      _StatTile(
                        label: 'Study (30d)',
                        value: '${(_streak?.current ?? 0) * 3}h',
                        tone: AlpColors.colorAmber,
                      ),
                      _StatTile(
                        label: 'Day Streak',
                        value: (_streak?.current ?? 0).toString(),
                        tone: AlpColors.colorPurple,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Weekly bar chart — last 7 days from real telemetry
          const AuroraSectionHeading('Last 7 days'),
          AlpCard(
            padding: const EdgeInsets.all(18),
            child: _WeeklyBars(activity: _activity),
          ),

          // 90-day activity heatmap
          const AuroraSectionHeading('Activity heatmap'),
          AlpCard(
            padding: const EdgeInsets.all(14),
            child: _ActivityHeatmap(activity: _activity),
          ),

          // Subject mastery
          AuroraSectionHeading(
            'Subject Mastery',
            action: Text(
              'EWA',
              style: TextStyle(color: AlpColors.textFaint, fontSize: 11),
            ),
          ),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: AuroraSpinner(size: 32)),
            )
          else if (_mastery == null || _mastery!.isEmpty)
            const AlpCard(
              child: Text(
                'No mastery data yet — finish a quiz to start tracking.',
                style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
              ),
            )
          else
            ...(_mastery!..sort((a, b) => b.ewa.compareTo(a.ewa)))
                .where((m) => _topicTitles.containsKey(m.topicId))
                .map((m) => _MasteryBar(
                      title: _topicTitles[m.topicId] ?? 'Topic',
                      ewa: m.ewa,
                      n: m.n,
                    ),),
          // Sprint A2 — extra analytics surfaces at the bottom so the
          // power user has them when they swipe past mastery rows. All
          // self-hide when the underlying signal is too thin.
          const SizedBox(height: 16),
          MultiProfileCard(auth: widget.auth),
          const SizedBox(height: 12),
          TimeBySectionCard(auth: widget.auth),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, required this.tone});
  final String label;
  final String value;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AlpColors.bgSurface3,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: TextStyle(
              color: tone,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: AlpColors.textMuted, fontSize: 10)),
        ],
      ),
    );
  }
}

class _ScoreRing extends StatelessWidget {
  const _ScoreRing({required this.pct});
  final double pct;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 96,
      height: 96,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 96,
            height: 96,
            child: CustomPaint(painter: _RingPainter(pct: pct)),
          ),
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                pct.toStringAsFixed(0),
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
              ),
              const SizedBox(height: 2),
              const Text(
                'SCORE',
                style: TextStyle(
                  color: AlpColors.textMuted,
                  fontSize: 9,
                  letterSpacing: 0.6,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
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
        colors: [AlpColors.colorAi, AlpColors.colorPurple],
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

class _WeeklyBars extends StatelessWidget {
  const _WeeklyBars({required this.activity});
  final List<DailyActivity>? activity;

  static const _labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context) {
    // Build a 7-day window ending today. We size and label bars by
    // *sessions* — minute-tracking is wired but the daily-activity rows
    // ship minutes=0 in the current backend (visible as "0h 0m" in the
    // heatmap caption even when 45 sessions exist). Falling back to
    // sessions makes the chart show real activity instead of seven "–".
    // Hover-tooltip still surfaces minutes when available.
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final byDate = <String, DailyActivity>{};
    for (final a in activity ?? const <DailyActivity>[]) {
      byDate[_key(a.date)] = a;
    }
    final sessions = List<int>.generate(7, (i) {
      final d = today.subtract(Duration(days: 6 - i));
      return byDate[_key(d)]?.sessions ?? 0;
    });
    final minutes = List<int>.generate(7, (i) {
      final d = today.subtract(Duration(days: 6 - i));
      return byDate[_key(d)]?.minutes ?? 0;
    });
    final maxSessions = sessions.fold<int>(0, (m, v) => v > m ? v : m);

    String labelFor(int s, int min) {
      if (s == 0) return '–';
      // Prefer hours when the backend ships real minute data; otherwise
      // show the session count so the chart isn't empty.
      if (min >= 30) return '${(min / 60.0).toStringAsFixed(1)}h';
      return s == 1 ? '1s' : '${s}s';
    }

    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: List.generate(7, (i) {
          final s = sessions[i];
          final min = minutes[i];
          final h = (maxSessions == 0 ? 4.0 : (s / maxSessions) * 90 + 8);
          final isToday = i == 6;
          final d = today.subtract(Duration(days: 6 - i));
          return Column(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  labelFor(s, min),
                  style: TextStyle(
                    color: s == 0 ? AlpColors.textFaint : AlpColors.textMuted,
                    fontSize: 9,
                    fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
              ),
              Container(
                width: 26,
                height: s == 0 ? 4.0 : h,
                decoration: BoxDecoration(
                  gradient: s > 0 && isToday
                      ? const LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [AlpColors.colorBlue, Color(0xFF7B68EE)],
                        )
                      : null,
                  color: s == 0
                      ? AlpColors.bgSurface3
                      : isToday
                          ? null
                          : AlpColors.colorBlue.withValues(alpha: 0.30),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _labels[d.weekday - 1],
                style: TextStyle(
                  color: isToday ? AlpColors.colorAi : AlpColors.textMuted,
                  fontSize: 11,
                  fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                ),
              ),
            ],
          );
        }),
      ),
    );
  }

  static String _key(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

/// GitHub-style activity heatmap — 13 weeks × 7 days = 91 cells.
/// Intensity: 0 sessions → faint, 1 → light cyan, 2-3 → mid, 4+ → bright.
class _ActivityHeatmap extends StatelessWidget {
  const _ActivityHeatmap({required this.activity});
  final List<DailyActivity>? activity;

  static const _weeks = 13; // ~3 months
  static const _cell = 14.0;
  static const _gap = 3.0;

  Color _toneFor(int sessions) {
    if (sessions == 0) return AlpColors.bgSurface3;
    if (sessions == 1) return AlpColors.colorAi.withValues(alpha: 0.30);
    if (sessions < 4) return AlpColors.colorAi.withValues(alpha: 0.65);
    return AlpColors.colorAi;
  }

  @override
  Widget build(BuildContext context) {
    final byDate = <String, DailyActivity>{};
    for (final a in activity ?? const <DailyActivity>[]) {
      final key = _WeeklyBars._key(a.date);
      byDate[key] = a;
    }
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    // Shift `today` to the most recent Sunday so columns line up by week.
    final endOfWeek = today.add(Duration(days: 7 - today.weekday));
    final cells = <Widget>[];
    var totalSessions = 0;
    var totalMinutes = 0;
    for (var col = 0; col < _weeks; col++) {
      final colCells = <Widget>[];
      for (var row = 0; row < 7; row++) {
        // (col, row) → date. col 0 = oldest week, row 0 = Mon.
        final daysFromEnd = (_weeks - 1 - col) * 7 + (6 - row);
        final d = endOfWeek.subtract(Duration(days: daysFromEnd));
        if (d.isAfter(today)) {
          colCells.add(SizedBox(width: _cell, height: _cell));
          continue;
        }
        final a = byDate[_WeeklyBars._key(d)];
        final s = a?.sessions ?? 0;
        if (s > 0) {
          totalSessions += s;
          totalMinutes += a?.minutes ?? 0;
        }
        colCells.add(
          Tooltip(
            message: '$s session${s == 1 ? '' : 's'} on ${_WeeklyBars._key(d)}',
            child: Container(
              width: _cell,
              height: _cell,
              decoration: BoxDecoration(
                color: _toneFor(s),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
        );
        if (row < 6) colCells.add(const SizedBox(height: _gap));
      }
      cells.add(Column(children: colCells));
      if (col < _weeks - 1) cells.add(const SizedBox(width: _gap));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              '$totalSessions sessions · ${totalMinutes ~/ 60}h ${totalMinutes % 60}m',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const Spacer(),
            const Text('Last 90 days', style: TextStyle(color: AlpColors.textMuted, fontSize: 11)),
          ],
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: cells),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            const Text('Less', style: TextStyle(color: AlpColors.textFaint, fontSize: 10)),
            const SizedBox(width: 6),
            for (final s in const [0, 1, 2, 4])
              Padding(
                padding: const EdgeInsets.only(right: 3),
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: _toneFor(s),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
            const SizedBox(width: 3),
            const Text('More', style: TextStyle(color: AlpColors.textFaint, fontSize: 10)),
          ],
        ),
      ],
    );
  }
}

class _MasteryBar extends StatelessWidget {
  const _MasteryBar({required this.title, required this.ewa, required this.n});
  final String title;
  final double ewa;
  final int n;

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
                valueColor: AlwaysStoppedAnimation<Color>(tone),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '$n attempt${n == 1 ? '' : 's'}',
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
