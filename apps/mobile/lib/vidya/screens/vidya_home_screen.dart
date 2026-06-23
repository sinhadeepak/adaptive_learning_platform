// VidyaHomeScreen — Phase 4 rich home (web/design parity).
//
// Layout (per the design mockup): greeting + bell/avatar, a multi-exam
// switcher (the student is often enrolled in several exams), a per-exam
// READINESS hero + band, an AI NEXT BEST ACTION (real guided-next-steps),
// the streak/today/mocks stat row, and a real TODAY'S PLAN checklist
// driven by the IGS today-plan endpoint.
//
// All data is per the *active* exam. The selection persists in secure
// storage so it survives app restarts. Every endpoint degrades
// independently — a failure renders a fallback for that card and lets
// the rest of the screen render.
//
// Deliberately omitted: the readiness *trend* sparkline + "+N this week"
// + θ readout shown in the web/design — those are hardcoded mocks on web
// and have no per-user history endpoint yet, so we show the real score +
// band instead of fabricating a trend.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../igs/igs_client.dart';
import '../../quiz/quiz_client.dart';
import '../shell/vidya_main_shell_scope.dart';
import 'vidya_practice_result_screen.dart';
import 'vidya_practice_session_screen.dart';

/// One enrolled exam, joined from profile.exams (id + targetDate) and the
/// catalog (code + name).
class _ExamRef {
  final String examId;
  final String code;
  final String name;
  const _ExamRef(
      {required this.examId, required this.code, required this.name});
}

class VidyaHomeScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaHomeScreen({super.key, required this.auth});

  @override
  State<VidyaHomeScreen> createState() => _VidyaHomeScreenState();
}

class _VidyaHomeScreenState extends State<VidyaHomeScreen> {
  static const int _scoreScale = 900;
  static const int _todayGoalQuestions = 5;
  static const _storage = FlutterSecureStorage();
  static const _activeExamKey = 'vidya.active_exam_id';

  bool _loading = true;
  String _firstName = 'there';
  int _unreadCount = 0;
  List<_ExamRef> _exams = const [];
  String? _activeExamId;

  // Per-exam data (reloaded on exam switch).
  bool _examLoading = false;
  _ExamData? _exam;
  // Local-only completion state for today's plan (no backend tracking yet).
  final Set<int> _donePlanItems = <int>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

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
    final profile = await _safe(() => api.getProfile());
    final catalog = await _safe(() => api.exams()) ?? const <Exam>[];
    final unread = await _safe(() => api.inboxUnreadCount(user.id)) ?? 0;

    // Join enrolled exams with catalog to get code + name.
    final byId = {for (final e in catalog) e.id: e};
    final exams = <_ExamRef>[
      for (final ue in profile?.exams ?? const <UserExam>[])
        if (byId[ue.examId] != null)
          _ExamRef(
            examId: ue.examId,
            code: byId[ue.examId]!.code,
            name: byId[ue.examId]!.name,
          ),
    ];

    final stored = await _safe(() => _storage.read(key: _activeExamKey));
    final active = exams.any((e) => e.examId == stored)
        ? stored
        : (exams.isNotEmpty ? exams.first.examId : null);

    if (!mounted) return;
    setState(() {
      _firstName = profile?.firstName ?? user.firstName;
      _unreadCount = unread;
      _exams = exams;
      _activeExamId = active;
      _loading = false;
    });
    if (active != null) {
      await _loadExamData(exams.firstWhere((e) => e.examId == active));
    }
  }

  Future<void> _loadExamData(_ExamRef exam) async {
    final user = widget.auth.user;
    if (user == null) return;
    setState(() => _examLoading = true);
    final api = ApiClient(widget.auth);
    final igs = IGSClient(widget.auth);

    final results = await Future.wait<Object?>([
      _safe<Readiness>(() => api.readiness(user.id, scope: exam.code)),
      _safe<Streak>(() => api.streak(user.id)),
      _safe<List<DailyActivity>>(() => api.dailyActivity(user.id, days: 84)),
      _safe<List<MockAttemptRow>>(() => api.mockAttempts()),
      _safe<GuidedNextSteps>(
          () => api.guidedNextSteps(user.id, examCode: exam.code)),
      _safe<TodayPlan?>(() => igs.fetchTodayPlan(user.id, exam.examId)),
      _safe<Map<String, String>>(() => _topicTitles(api, exam.examId)),
    ]);
    if (!mounted) return;
    final guided = results[4] as GuidedNextSteps?;
    final activity = _activityFrom(
      (results[2] as List<DailyActivity>?) ?? const [],
    );
    setState(() {
      _exam = _ExamData(
        readinessScore: (results[0] as Readiness?)?.score,
        streakDays: (results[1] as Streak?)?.current,
        questionsToday: activity.today,
        activitySeries: activity.series,
        mockCount: ((results[3] as List<MockAttemptRow>?) ?? const []).length,
        nextStep:
            (guided?.steps.isNotEmpty ?? false) ? guided!.steps.first : null,
        plan: results[5] as TodayPlan?,
        topicTitles: (results[6] as Map<String, String>?) ?? const {},
      );
      _donePlanItems.clear();
      _examLoading = false;
    });
  }

  /// Turn the daily-activity rows into a contiguous last-84-day series of
  /// questions/day (missing days → 0), plus today's count. Real data; the
  /// home renders this as an activity sparkline (no fabricated readiness
  /// trend).
  ({int today, List<int> series}) _activityFrom(List<DailyActivity> daily) {
    String key(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final byDay = {for (final d in daily) key(d.date): d.questions};
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    const span = 84;
    final series = <int>[
      for (var i = span - 1; i >= 0; i--)
        byDay[key(today.subtract(Duration(days: i)))] ?? 0,
    ];
    return (today: byDay[key(today)] ?? 0, series: series);
  }

  /// Best-effort topicId → title map for the exam, so plan / next-step
  /// items can show human names. Degrades to {} (items fall back to a
  /// readable action kind).
  Future<Map<String, String>> _topicTitles(ApiClient api, String examId) async {
    final subjects = await api.subjectsForExam(examId);
    final lists =
        await Future.wait(subjects.map((s) => api.topicsForSubject(s.id)));
    final out = <String, String>{};
    for (final topics in lists) {
      for (final t in topics) {
        out[t.id] = t.title;
      }
    }
    return out;
  }

  Future<void> _selectExam(String examId) async {
    if (examId == _activeExamId) return;
    await _storage.write(key: _activeExamKey, value: examId);
    setState(() {
      _activeExamId = examId;
      _exam = null;
    });
    await _loadExamData(_exams.firstWhere((e) => e.examId == examId));
  }

  void _goToPractice() =>
      VidyaMainShellScope.of(context)?.switchTo(VidyaShellTab.practice);

  /// Launch a focused practice session on a specific topic (used by the
  /// next-best-action CTA). Falls back to the Practice tab if no topic.
  void _startTopic(String? topicId) {
    final userId = widget.auth.user?.id ?? '';
    if (topicId == null || topicId.isEmpty || userId.isEmpty) {
      _goToPractice();
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VidyaPracticeSessionScreen(
          client: QuizClient(auth: widget.auth),
          topicId: topicId,
          userId: userId,
          onCompleted: (sessionId) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute<void>(
                builder: (_) => VidyaPracticeResultScreen(
                  client: QuizClient(auth: widget.auth),
                  sessionId: sessionId,
                  onDone: () => Navigator.of(context).pop(),
                ),
              ),
            );
          },
          onBack: () => Navigator.of(context).pop(),
        ),
      ),
    );
  }

  String _todayEyebrow() {
    final now = DateTime.now();
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];
    return '${days[now.weekday - 1]} · ${months[now.month - 1]} ${now.day}';
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    if (_loading) return const _HomeSkeleton();

    final initial =
        _firstName.isNotEmpty ? _firstName.substring(0, 1).toUpperCase() : '?';
    _ExamRef? activeExam;
    for (final e in _exams) {
      if (e.examId == _activeExamId) {
        activeExam = e;
        break;
      }
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        // Header.
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
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
                    'Hi, $_firstName.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 32,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                      height: 1.1,
                    ),
                  ),
                ],
              ),
            ),
            VidyaBellButton(
              unreadCount: _unreadCount,
              onTap: () =>
                  VidyaMainShellScope.of(context)?.switchTo(VidyaShellTab.more),
            ),
            const SizedBox(width: 8),
            VidyaAvatar(initials: initial, size: 40),
          ],
        ),
        const SizedBox(height: 16),

        // Exam switcher (only when enrolled in 2+ exams).
        if (_exams.length >= 2) ...[
          _ExamSwitcher(
            exams: _exams,
            activeExamId: _activeExamId,
            onSelect: _selectExam,
          ),
          const SizedBox(height: 16),
        ],

        if (_exams.isEmpty)
          _NoExamCard(onPickExam: _goToPractice)
        else ...[
          _ReadinessHero(
            examName: activeExam?.name ?? 'Readiness',
            score: _exam?.readinessScore,
            scale: _scoreScale,
            loading: _examLoading,
            activitySeries: _exam?.activitySeries ?? const [],
          ),
          const SizedBox(height: 12),
          _NextBestActionCard(
            step: _exam?.nextStep,
            loading: _examLoading,
            onStart: () => _startTopic(_exam?.nextStep?.topicId),
          ),
          const SizedBox(height: 12),
          _StatsRow(
            streakDays: _exam?.streakDays,
            questionsToday: _exam?.questionsToday,
            mockCount: _exam?.mockCount,
            todayGoal: _todayGoalQuestions,
          ),
          const SizedBox(height: 12),
          _TodayPlanCard(
            plan: _exam?.plan,
            topicTitles: _exam?.topicTitles ?? const {},
            done: _donePlanItems,
            loading: _examLoading,
            onToggle: (i) => setState(() {
              _donePlanItems.contains(i)
                  ? _donePlanItems.remove(i)
                  : _donePlanItems.add(i);
            }),
          ),
        ],
      ],
    );
  }
}

class _ExamData {
  final double? readinessScore;
  final int? streakDays;
  final int? questionsToday;
  final int? mockCount;
  final GuidedStep? nextStep;
  final TodayPlan? plan;
  final Map<String, String> topicTitles;
  final List<int> activitySeries;
  const _ExamData({
    this.readinessScore,
    this.streakDays,
    this.questionsToday,
    this.mockCount,
    this.nextStep,
    this.plan,
    this.topicTitles = const {},
    this.activitySeries = const [],
  });
}

// ─── Exam switcher ──────────────────────────────────────────────────

class _ExamSwitcher extends StatelessWidget {
  final List<_ExamRef> exams;
  final String? activeExamId;
  final ValueChanged<String> onSelect;
  const _ExamSwitcher({
    required this.exams,
    required this.activeExamId,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return SizedBox(
      height: 34,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: exams.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) {
          final e = exams[i];
          final selected = e.examId == activeExamId;
          return GestureDetector(
            onTap: () => onSelect(e.examId),
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: selected ? v.accent : v.ink3.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                e.name,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : v.ink2,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Readiness hero ─────────────────────────────────────────────────

({String label, Color tone}) _bandFor(double? score, VidyaThemeData v) {
  if (score == null) return (label: 'Not enough data yet', tone: v.ink3);
  if (score >= 0.70) return (label: 'Approaching target', tone: v.good);
  if (score >= 0.55) return (label: 'On track', tone: v.info);
  if (score >= 0.40) return (label: 'Behind pace', tone: v.warn);
  return (label: 'Building foundations', tone: v.bad);
}

class _ReadinessHero extends StatelessWidget {
  final String examName;
  final double? score;
  final int scale;
  final bool loading;
  final List<int> activitySeries;
  const _ReadinessHero({
    required this.examName,
    required this.score,
    required this.scale,
    required this.loading,
    this.activitySeries = const [],
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final scaled = score == null ? '—' : (score! * scale).round().toString();
    final band = _bandFor(score, v);
    return VidyaCard(
      tone: VidyaCardTone.accent,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${examName.toUpperCase()} · READINESS',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.4,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  scaled,
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 52,
                    fontWeight: FontWeight.w600,
                    color: v.ink,
                    height: 1,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '/ $scale',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 20,
                    color: v.ink3,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: band.tone.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                loading ? 'Updating…' : band.label,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: band.tone,
                ),
              ),
            ),
            if (activitySeries.any((q) => q > 0)) ...[
              const SizedBox(height: 16),
              Text(
                'ACTIVITY · LAST 12 WEEKS',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 9,
                  color: v.ink3,
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 40,
                child: _ActivitySparkline(
                  series: activitySeries,
                  color: v.accent,
                  trackColor: v.ink3.withValues(alpha: 0.18),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Lightweight bars sparkline of questions/day (real daily-activity).
/// Not a readiness trend — labelled as activity. Bars are normalised to
/// the series max so a quiet week still reads.
class _ActivitySparkline extends StatelessWidget {
  final List<int> series;
  final Color color;
  final Color trackColor;
  const _ActivitySparkline({
    required this.series,
    required this.color,
    required this.trackColor,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.infinite,
      painter: _SparkPainter(series, color, trackColor),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<int> series;
  final Color color;
  final Color trackColor;
  _SparkPainter(this.series, this.color, this.trackColor);

  @override
  void paint(Canvas canvas, Size size) {
    if (series.isEmpty) return;
    final maxV = series.reduce((a, b) => a > b ? a : b);
    final n = series.length;
    const gap = 1.0;
    final barW = (size.width - gap * (n - 1)) / n;
    final base = Paint()..color = trackColor;
    final fill = Paint()..color = color;
    for (var i = 0; i < n; i++) {
      final x = i * (barW + gap);
      // Baseline track so empty days still show a faint tick.
      final trackRect = Rect.fromLTWH(x, size.height - 2, barW, 2);
      canvas.drawRRect(
        RRect.fromRectAndRadius(trackRect, const Radius.circular(1)),
        base,
      );
      if (maxV <= 0 || series[i] <= 0) continue;
      final h = (series[i] / maxV) * size.height;
      final rect = Rect.fromLTWH(x, size.height - h, barW, h);
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(1)),
        fill,
      );
    }
  }

  @override
  bool shouldRepaint(_SparkPainter old) =>
      old.series != series || old.color != color;
}

// ─── Next best action ───────────────────────────────────────────────

class _NextBestActionCard extends StatelessWidget {
  final GuidedStep? step;
  final bool loading;
  final VoidCallback onStart;
  const _NextBestActionCard({
    required this.step,
    required this.loading,
    required this.onStart,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final title = step?.topicTitle.isNotEmpty == true
        ? step!.topicTitle
        : 'Take a quick practice session';
    final why = step?.why ?? '';
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'NEXT BEST ACTION',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              title,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 20,
                fontWeight: FontWeight.w500,
                color: v.ink,
                height: 1.25,
              ),
            ),
            if (why.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                why,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink2,
                  height: 1.35,
                ),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                VidyaButton(
                  label: 'Start practice',
                  onPressed: loading ? null : onStart,
                  size: VidyaButtonSize.md,
                ),
                if (step != null) ...[
                  const SizedBox(width: 12),
                  Text(
                    '~${step!.estMinutes} min',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 12,
                      color: v.ink3,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Today's plan ───────────────────────────────────────────────────

String _actionKindLabel(String kind) {
  switch (kind.toUpperCase()) {
    case 'PRACTICE':
      return 'Practice';
    case 'MOCK':
    case 'MOCK_BLUEPRINT':
      return 'Mock test';
    case 'REVISION':
    case 'REVISE':
      return 'Revision';
    case 'READING':
    case 'READ':
      return 'Reading';
    default:
      final l = kind.toLowerCase().replaceAll('_', ' ');
      return l.isEmpty ? 'Session' : '${l[0].toUpperCase()}${l.substring(1)}';
  }
}

class _TodayPlanCard extends StatelessWidget {
  final TodayPlan? plan;
  final Map<String, String> topicTitles;
  final Set<int> done;
  final bool loading;
  final ValueChanged<int> onToggle;
  const _TodayPlanCard({
    required this.plan,
    required this.topicTitles,
    required this.done,
    required this.loading,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final actions = plan?.actions ?? const <IGSAction>[];
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  "TODAY'S PLAN",
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 11,
                    color: v.ink3,
                    letterSpacing: 1.5,
                  ),
                ),
                const Spacer(),
                if (actions.isNotEmpty)
                  Text(
                    '${done.length}/${actions.length} done',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      color: v.ink3,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (loading)
              Text(
                'Building your plan…',
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink3,
                ),
              )
            else if (actions.isEmpty)
              Text(
                'No plan for today yet — start a practice session and your '
                'plan will fill in.',
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink2,
                  height: 1.4,
                ),
              )
            else
              for (var i = 0; i < actions.length; i++)
                _PlanRow(
                  label: _labelFor(actions[i]),
                  minutes: actions[i].expectedMinutes,
                  checked: done.contains(i),
                  onTap: () => onToggle(i),
                ),
          ],
        ),
      ),
    );
  }

  String _labelFor(IGSAction a) {
    final title = a.conceptId != null ? topicTitles[a.conceptId] : null;
    final kind = _actionKindLabel(a.actionKind);
    if (title != null && title.isNotEmpty) return '$kind · $title';
    if (a.questionCount != null && a.questionCount! > 0) {
      return '$kind · ${a.questionCount} Qs';
    }
    return kind;
  }
}

class _PlanRow extends StatelessWidget {
  final String label;
  final int minutes;
  final bool checked;
  final VoidCallback onTap;
  const _PlanRow({
    required this.label,
    required this.minutes,
    required this.checked,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(
              checked ? Icons.check_circle : Icons.radio_button_unchecked,
              size: 22,
              color: checked ? v.good : v.ink3,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 15,
                  color: checked ? v.ink3 : v.ink,
                  decoration: checked ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
            Text(
              '$minutes min',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 12,
                color: v.ink3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Stats row (unchanged behaviour) ────────────────────────────────

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
        Expanded(
            child:
                _StatTile(label: 'STREAK', value: _orDash(streakDays, ' d'))),
        const SizedBox(width: 8),
        Expanded(
          child: _StatTile(
            label: 'TODAY',
            value:
                questionsToday == null ? '—' : '$questionsToday / $todayGoal',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
            child: _StatTile(label: 'MOCKS', value: _orDash(mockCount, ''))),
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

// ─── No-exam + skeleton states ──────────────────────────────────────

class _NoExamCard extends StatelessWidget {
  final VoidCallback onPickExam;
  const _NoExamCard({required this.onPickExam});

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
              'No exam selected yet',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 20,
                fontWeight: FontWeight.w500,
                color: v.ink,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Pick an exam in onboarding to see your readiness and a '
              'personalised plan.',
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 13,
                color: v.ink2,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: 'Start practising',
              onPressed: onPickExam,
              size: VidyaButtonSize.md,
            ),
          ],
        ),
      ),
    );
  }
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  VidyaSkeletonBlock(width: 90, height: 12),
                  SizedBox(height: 10),
                  VidyaSkeletonBlock(width: 220, height: 28),
                ],
              ),
            ),
            VidyaSkeletonBlock(
              width: 44,
              height: 44,
              borderRadius: BorderRadius.all(Radius.circular(22)),
            ),
            SizedBox(width: 8),
            VidyaSkeletonBlock(
              width: 40,
              height: 40,
              borderRadius: BorderRadius.all(Radius.circular(20)),
            ),
          ],
        ),
        const SizedBox(height: 20),
        const _SkeletonCard(children: [
          VidyaSkeletonBlock(width: 140, height: 10),
          SizedBox(height: 12),
          VidyaSkeletonBlock(width: 180, height: 48),
        ]),
        const SizedBox(height: 12),
        const _SkeletonCard(children: [
          VidyaSkeletonBlock(width: 120, height: 10),
          SizedBox(height: 8),
          VidyaSkeletonBlock(width: 220, height: 20),
          SizedBox(height: 12),
          VidyaSkeletonBlock(width: 120, height: 36),
        ]),
        const SizedBox(height: 12),
        Row(
          children: const [
            Expanded(child: _SkeletonStat()),
            SizedBox(width: 8),
            Expanded(child: _SkeletonStat()),
            SizedBox(width: 8),
            Expanded(child: _SkeletonStat()),
          ],
        ),
      ],
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  final List<Widget> children;
  const _SkeletonCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children,
        ),
      ),
    );
  }
}

class _SkeletonStat extends StatelessWidget {
  const _SkeletonStat();

  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            VidyaSkeletonBlock(width: 50, height: 8),
            SizedBox(height: 8),
            VidyaSkeletonBlock(width: 60, height: 20),
          ],
        ),
      ),
    );
  }
}
