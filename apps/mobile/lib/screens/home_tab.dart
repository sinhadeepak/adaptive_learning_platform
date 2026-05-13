import 'dart:math' as math;

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/marketplace.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';
import '../widgets/alp_card.dart';
import '../widgets/daily_plan_card.dart';
import '../widgets/analytics_cards.dart';
import '../widgets/inbox_bell.dart';
import 'persona.dart';
import 'diagnostic_screen.dart';
import 'exam_dashboard_screen.dart';
import 'marketplace/courses_screen.dart';
import 'marketplace/my_bookings_screen.dart';
import 'marketplace/my_purchases_screen.dart';
import 'marketplace/tutors_screen.dart';
import 'onboarding/exam_select_screen.dart' show ExamSelectScreen;

/// Home dashboard — readiness ring, streak, quick actions, top subjects.
/// Mirrors docs/ui/02_MobileApp/16_home.html.
class HomeTab extends StatefulWidget {
  const HomeTab(
      {super.key, required this.api, required this.auth, required this.onJump,});
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
  Map<String, Exam> _examsMeta = const {};
  // Topic IDs belonging to the user's active (= first) exam. Used to
  // filter Resume / Subjects / mastery so a UPSC student never sees
  // "Light & Sound" (CBSE Class 8) on the home dashboard.
  Set<String> _activeExamTopics = const {};
  bool _loading = true;

  String? get _activeExamId =>
      (_profile?.exams.isNotEmpty == true) ? _profile!.exams.first.examId : null;
  String? get _activeExamCode =>
      _activeExamId != null ? _examsMeta[_activeExamId!]?.code : null;
  Persona get _persona => personaForExamCode(_activeExamCode);

  // True when the user has nothing meaningful on their dashboard yet —
  // no completed sessions, no active streak, no in-progress quiz.
  // Triggers the "diagnostic" cold-start hero.
  bool get _isBrandNew {
    final hasMastery = (_mastery ?? const []).any((m) => m.n > 0);
    final hasStreak = (_streak?.current ?? 0) > 0;
    final hasInProgress = _filteredInProgress().isNotEmpty;
    return !_loading && !hasMastery && !hasStreak && !hasInProgress;
  }

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
      final inProgress =
          history.where((r) => r.status == 'IN_PROGRESS').toList();
      // Today's row may not exist if the student hasn't studied yet; fall to 0.
      final todayKey = DateTime.now();
      final today = activity.firstWhere(
        (a) =>
            a.date.year == todayKey.year &&
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
      // Catalog exam metadata — feeds the "My exams & courses" cards so we
      // can render real names + subtitles instead of raw exam IDs.
      var examsMeta = <String, Exam>{};
      if (profile?.exams.isNotEmpty ?? false) {
        try {
          final all = await widget.api.exams();
          examsMeta = {for (final e in all) e.id: e};
        } catch (_) {/* keep going — cards just fall back to "Exam" */}
      }
      // Build the set of topic IDs that belong to the user's active
      // (= first) exam. We use this to filter Resume practice + Subjects
      // mastery rows so cross-exam topics don't pollute the home tab.
      // If anything fails along the way, fall back to an empty set —
      // the UI gracefully degrades to "no in-exam mastery yet" rather
      // than crashing.
      var activeExamTopics = <String>{};
      final activeExamId =
          (profile?.exams.isNotEmpty ?? false) ? profile!.exams.first.examId : null;
      if (activeExamId != null) {
        try {
          final subjects = await widget.api.subjectsForExam(activeExamId);
          for (final s in subjects) {
            try {
              final ts = await widget.api.topicsForSubject(s.id);
              activeExamTopics.addAll(ts.map((t) => t.id));
            } catch (_) {/* skip subject on error */}
          }
        } catch (_) {/* fall through to empty set */}
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
        _examsMeta = examsMeta;
        _activeExamTopics = activeExamTopics;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  // Returns in-progress sessions narrowed to the active exam. When the
  // active-exam topic set hasn't loaded yet (cold start) we let the
  // unfiltered list through so the user isn't blocked from resuming a
  // session they obviously care about.
  List<SessionHistoryRow> _filteredInProgress() {
    if (_activeExamTopics.isEmpty) return _inProgress;
    return _inProgress
        .where((r) => _activeExamTopics.contains(r.topicId))
        .toList();
  }

  // Resolves the readiness card eyebrow to the user's currently
  // selected primary exam (first in profile.exams). Falls back to a
  // neutral label so a UPSC student never sees "NEET READINESS".
  String _primaryReadinessLabel() {
    final list = _profile?.exams ?? const <UserExam>[];
    if (list.isEmpty) return 'YOUR READINESS';
    final code = _examsMeta[list.first.examId]?.code;
    if (code == null || code.isEmpty) return 'YOUR READINESS';
    return '${code.replaceAll('_', ' ')} READINESS';
  }

  void _openExamDashboard(UserExam ue) {
    final meta = _examsMeta[ue.examId];
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ExamDashboardScreen(
        api: widget.api,
        auth: widget.auth,
        examId: ue.examId,
        examCode: meta?.code ?? '',
        examName: meta?.name ?? 'Exam',
        examSubtitle: meta?.subtitle,
        targetDate: ue.targetDate,
      ),
    ),).then((_) {
      // When the user backs out of the dashboard, refresh so streak /
      // mastery / readiness reflect any practice they did.
      if (mounted) _refresh();
    });
  }

  // Brand-new user taps "Start your check / Run diagnostic" — push
  // the dedicated DiagnosticScreen instead of dropping them into the
  // generic Practice tab. If they haven't picked an exam yet, route
  // them to the exam picker first; the diagnostic kicks off after
  // they finish onboarding.
  Future<void> _startDiagnostic() async {
    if (_activeExamId == null) {
      // No exam selected — push the picker, then auto-refresh; the
      // user can re-tap the hero once they have an exam.
      await _addExam();
      return;
    }
    final id = _activeExamId!;
    final meta = _examsMeta[id];
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => DiagnosticScreen(
        api: widget.api,
        auth: widget.auth,
        examId: id,
        examCode: meta?.code ?? '',
        examName: meta?.name ?? 'Exam',
        examSubtitle: meta?.subtitle,
        targetDate: _profile?.exams.first.targetDate,
      ),
    ),);
    if (mounted) _refresh();
  }

  Future<void> _addExam() async {
    // Reuse the onboarding ExamSelectScreen as a standalone "add exam"
    // sheet. onContinue pops back to home; we then refresh so the new
    // card shows up without the user having to pull-to-refresh.
    final added = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (ctx) => ExamSelectScreen(
          auth: widget.auth,
          onContinue: () => Navigator.of(ctx).pop(true),
        ),
      ),
    );
    if (added == true) {
      await _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user;
    final firstName = user?.firstName ?? 'there';
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Good morning'
        : hour < 17
            ? 'Good afternoon'
            : 'Good evening';
    final readinessPct =
        _readiness == null ? 0 : (_readiness!.score * 100).round();

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
                    Text('$greeting 🌅',
                        style: const TextStyle(
                            color: AlpColors.textMuted, fontSize: 13,),),
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
                      Text(
                        _primaryReadinessLabel(),
                        style: const TextStyle(
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
                        style: const TextStyle(
                            color: AlpColors.textMuted, fontSize: 11,),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ── My exams & courses ─────────────────────────────────────
          // Mirrors the web Home's zone-2 "My exams & courses" panel so
          // the student can swap exam context, set a target date, or
          // browse the marketplace right from the home screen.
          const SizedBox(height: 16),
          AlpSectionHeading(
            'My exams & courses',
            trailing: TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) =>
                    CoursesScreen(client: MarketplaceClient(widget.auth)),
              ),),
              child: const Text('Browse courses ›',
                  style: TextStyle(color: AlpColors.colorAi, fontSize: 12),),
            ),
          ),
          _MyExamsRow(
            exams: _profile?.exams ?? const [],
            examsMeta: _examsMeta,
            readinessPct:
                _readiness == null ? 0 : (_readiness!.score * 100).round(),
            onOpenExam: _openExamDashboard,
            onAdd: _addExam,
          ),

          // ── 2.5) Today's Plan (Phase B3 — IGS). Sits above the
          //          legacy "Today" card during the shadow-mode
          //          rollout; once IGS owns the home decision-reducer
          //          slot, the old Today card moves to the per-exam
          //          dashboard.
          if (_activeExamId != null) ...[
            const SizedBox(height: 12),
            DailyPlanCard(auth: widget.auth, examId: _activeExamId!),
          ],

          // ── 3) Today — exactly ONE prioritized card so the user is
          //       never staring at a wall of nudges. Priority order:
          //       streak-in-danger > resume in-exam practice > daily
          //       goal > active streak > friendly empty-state CTA.
          //       Everything we used to stack here (Photo Doubt,
          //       Guided Next Steps, Study Plan, Weakness, Predicted
          //       AIR, Subject mastery rows) now lives on the per-exam
          //       dashboard so this screen stays calm.
          const SizedBox(height: 16),
          ..._buildTodayCard(),

          // Sprint A2 — insights snapshot just below "Today" so it
          // appears once the user has enough activity. Self-hides when
          // the snapshot endpoint returns nothing meaningful.
          const SizedBox(height: 12),
          InsightsSnapshotCard(auth: widget.auth),

          // ── 4) Explore — marketplace surfaces. Practice / Mocks /
          //       Doubts / Progress already live in the bottom dock,
          //       so this row is reserved for things the dock can't
          //       reach at one tap.
          const SizedBox(height: 16),
          const AlpSectionHeading('Explore'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.6,
            children: [
              _QuickAction(
                icon: Icons.menu_book,
                accent: AlpColors.colorPurple,
                title: 'Courses',
                subtitle: 'Self-paced',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) =>
                      CoursesScreen(client: MarketplaceClient(widget.auth)),
                ),),
              ),
              _QuickAction(
                icon: Icons.person_search,
                accent: AlpColors.colorBlue,
                title: 'Find a tutor',
                subtitle: 'Live 1:1',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) =>
                      TutorsScreen(client: MarketplaceClient(widget.auth)),
                ),),
              ),
              _QuickAction(
                icon: Icons.shopping_bag,
                accent: AlpColors.colorAmber,
                title: 'My purchases',
                subtitle: 'Owned courses',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) =>
                      MyPurchasesScreen(client: MarketplaceClient(widget.auth)),
                ),),
              ),
              _QuickAction(
                icon: Icons.calendar_today,
                accent: AlpColors.colorGreen,
                title: 'My bookings',
                subtitle: 'Sessions',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) =>
                      MyBookingsScreen(client: MarketplaceClient(widget.auth)),
                ),),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // Build the single "Today" card by priority. Returns a list because
  // a couple of states surface a small section heading too.
  List<Widget> _buildTodayCard() {
    final s = _streak;
    final inProgress = _filteredInProgress();
    final goalMin = _profile?.dailyGoalMinutes ?? 0;

    // 1) Streak in danger — most urgent.
    if (s != null && s.current > 0 && isStreakInDanger(s)) {
      return [
        const AlpSectionHeading('Today'),
        _StreakDangerCard(streak: s, onStart: () => widget.onJump(2)),
      ];
    }
    // 2) Resume an in-exam session.
    if (inProgress.isNotEmpty) {
      return [
        const AlpSectionHeading('Today'),
        _ResumeCard(
          row: inProgress.first,
          topicTitle: _topicTitles[inProgress.first.topicId],
          extraCount: inProgress.length - 1,
          onResume: () => _resume(inProgress.first),
        ),
      ];
    }
    // 3) Daily-goal progress (if set in Preferences).
    if (goalMin > 0) {
      return [
        const AlpSectionHeading('Today'),
        _DailyGoalCard(
          goalMinutes: goalMin,
          minutesToday: _todayMinutes,
          sessionsToday: _todaySessions,
        ),
      ];
    }
    // 4) Active streak (no resume / no goal yet).
    if (s != null && s.current > 0) {
      return [
        const AlpSectionHeading('Today'),
        _StreakCard(streak: s),
      ];
    }
    // 5) Cold-start diagnostic hero — replaces the entire "Today"
    //    section when the user has zero history. Larger, persona-
    //    framed (junior = "quick check"; senior = "calibration"),
    //    and includes a micro-explainer of what the diagnostic does
    //    so the student isn't confused about what they're starting.
    final isJunior = _persona.isJunior;
    return [
      const AlpSectionHeading('Start here'),
      AlpCard(
        onTap: _startDiagnostic,
        padding: const EdgeInsets.all(20),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1A2540), Color(0xFF221E45)],
        ),
        borderColor: AlpColors.colorAi.withValues(alpha: 0.40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AlpColors.colorAi.withValues(alpha: 0.20),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.auto_awesome,
                      color: AlpColors.colorAi, size: 22,),
                ),
                const Spacer(),
                const AlpPill(
                    label: '◈ ~5 minutes', color: AlpColors.colorAi,),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              isJunior
                  ? 'Take a quick 5-question check'
                  : 'Run your 5-question diagnostic',
              style: const TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,),
            ),
            const SizedBox(height: 6),
            Text(
              isJunior
                  ? "We'll see what you already know and which topics need a little more practice. No pressure — your answers don't go anywhere except into your study plan."
                  : 'The IRT engine needs ~5 answered questions to seed an honest readiness score. Without it, every other stat in the app is zero or noise.',
              style: const TextStyle(
                  color: AlpColors.textSecondary,
                  fontSize: 13,
                  height: 1.45,),
            ),
            const SizedBox(height: 14),
            // Three steps so the student knows what comes after.
            ..._diagnosticSteps(isJunior).map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 6, right: 8),
                        child: Icon(Icons.check_circle_outline,
                            color: AlpColors.colorAi, size: 14,),
                      ),
                      Expanded(
                        child: Text(
                          s,
                          style: const TextStyle(
                              color: AlpColors.textSecondary,
                              fontSize: 12,
                              height: 1.4,),
                        ),
                      ),
                    ],
                  ),
                ),),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _startDiagnostic,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AlpColors.colorAi,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),),
                ),
                child: Text(
                  isJunior ? 'Start the check ▶' : 'Run diagnostic ▶',
                  style: const TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 14,),
                ),
              ),
            ),
          ],
        ),
      ),
    ];
  }

  // Persona-aware copy for the three diagnostic-step bullets.
  List<String> _diagnosticSteps(bool isJunior) {
    if (isJunior) {
      return const [
        'Answer 5 questions across the topics you’ve been studying.',
        'Get a friendly readiness score — green if you’re on track, amber if a topic needs another look.',
        'Your study plan updates automatically with what to do next.',
      ];
    }
    return const [
      'Answer 5 IRT-calibrated items across your active exam.',
      'Readiness score + per-topic ability θ are seeded from this round.',
      'Mock blueprint, weakness diagnosis and AIR projection unlock once seeded.',
    ];
  }

  Future<void> _resume(SessionHistoryRow row) async {
    final client = QuizClient(auth: widget.auth);
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) =>
          QuizScreen(client: client, sessionId: row.sessionId, api: widget.api),
    ),);
    if (mounted) _refresh();
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
    final rect = Rect.fromLTWH(
        stroke / 2, stroke / 2, size.width - stroke, size.height - stroke,);
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
    canvas.drawArc(rect, -math.pi / 2, 2 * math.pi * (pct / 100).clamp(0, 1),
        false, progress,);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.pct != pct;
}

bool isStreakInDanger(Streak s) {
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
                  style: TextStyle(
                      color: AlpColors.textMuted, fontSize: 12, height: 1.3,),
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
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),),
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
              const Icon(Icons.replay_circle_filled,
                  color: AlpColors.colorAi, size: 22,),
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
                AlpPill(
                    label: '+$extraCount more', color: AlpColors.colorAmber,),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            topicTitle ?? 'Topic #${row.topicId.substring(0, 8)}',
            style: const TextStyle(color: AlpColors.textPrimary, fontSize: 14),
          ),
          const SizedBox(height: 4),
          Text(
            // Sprint 1 honesty pass — when servedCount is 0 the
            // session hasn't actually scored anything yet, so showing
            // "0/0 correct so far" was confusing. Now we just say
            // "Just started" until at least one answer lands.
            row.servedCount == 0
                ? '$remaining question${remaining == 1 ? '' : 's'} left · Just started'
                : '$remaining question${remaining == 1 ? '' : 's'} left · ${row.correctCount}/${row.servedCount} correct so far',
            style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onResume,
              icon: const Icon(Icons.play_arrow_rounded, size: 18),
              label: const Text('Continue',
                  style: TextStyle(fontWeight: FontWeight.w700),),
              style: ElevatedButton.styleFrom(
                backgroundColor: AlpColors.colorAi,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),),
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
                style:
                    const TextStyle(color: AlpColors.textMuted, fontSize: 12),
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
                      style: const TextStyle(
                          color: AlpColors.textSecondary, fontSize: 13,),
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
              // Sprint 1 honesty pass — show ✓ only for days actually
              // covered by the current streak window. Was previously
              // showing ✓ for *every* past day this week, so a 4-day
              // streak rendered 6 checks. Sunday today-cell now uses
              // the same "today + in-streak" treatment as the others
              // for visual consistency.
              final isToday = i == today;
              final inStreakWindow =
                  streak.current > 0 && i > today - streak.current && i <= today;
              final past = i < today;
              final shouldTick = past && inStreakWindow;
              final shouldHighlightToday = isToday && inStreakWindow;
              return Container(
                width: 32,
                height: 36,
                decoration: BoxDecoration(
                  color: shouldHighlightToday
                      ? AlpColors.colorAmber
                      : shouldTick
                          ? AlpColors.colorAmber.withValues(alpha: 0.20)
                          : AlpColors.bgSurface3,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Center(
                  child: Text(
                    shouldTick ? '✓' : days[i],
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: shouldHighlightToday
                          ? AlpColors.bgBase
                          : AlpColors.textSecondary,
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

class _MyExamsRow extends StatelessWidget {
  const _MyExamsRow({
    required this.exams,
    required this.examsMeta,
    required this.readinessPct,
    required this.onOpenExam,
    required this.onAdd,
  });

  final List<UserExam> exams;
  final Map<String, Exam> examsMeta;
  final int readinessPct;
  final ValueChanged<UserExam> onOpenExam;
  final VoidCallback onAdd;

  static int? _daysUntil(DateTime? d) {
    if (d == null) return null;
    final today = DateTime.now();
    final t = DateTime(today.year, today.month, today.day);
    final dd = DateTime(d.year, d.month, d.day);
    final diff = dd.difference(t).inDays;
    return diff < 0 ? 0 : diff;
  }

  @override
  Widget build(BuildContext context) {
    if (exams.isEmpty) {
      // Empty state — single full-width "Pick your exam" card.
      return AlpCard(
        onTap: onAdd,
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AlpColors.colorAi.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.add_rounded,
                  color: AlpColors.colorAi, size: 22,),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Pick your exam or course',
                      style: TextStyle(
                          color: AlpColors.textPrimary,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,),),
                  SizedBox(height: 2),
                  Text(
                      'JEE · NEET · UPSC · CBSE · CAT — choose what to prep for',
                      style:
                          TextStyle(color: AlpColors.textMuted, fontSize: 12),),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: AlpColors.textMuted, size: 20,),
          ],
        ),
      );
    }

    return SizedBox(
      height: 130,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: exams.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (ctx, i) {
          if (i == exams.length) {
            return _AddExamTile(onTap: onAdd);
          }
          final e = exams[i];
          final meta = examsMeta[e.examId];
          final days = _daysUntil(e.targetDate);
          return _ExamTile(
            name: meta?.name ?? 'Exam',
            subtitle: meta?.subtitle ?? '—',
            daysRemaining: days,
            readinessPct: readinessPct,
            onTap: () => onOpenExam(e),
          );
        },
      ),
    );
  }
}

class _ExamTile extends StatelessWidget {
  const _ExamTile({
    required this.name,
    required this.subtitle,
    required this.daysRemaining,
    required this.readinessPct,
    required this.onTap,
  });
  final String name;
  final String subtitle;
  final int? daysRemaining;
  final int readinessPct;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final onTrack = readinessPct >= 60;
    final pillColor =
        onTrack ? AlpColors.colorGreen : AlpColors.colorAmber;
    final barColor = readinessPct >= 60
        ? AlpColors.colorGreen
        : readinessPct >= 30
            ? AlpColors.colorBlue
            : AlpColors.colorRed;
    return SizedBox(
      width: 220,
      child: AlpCard(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: AlpColors.textPrimary,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,),),
                      const SizedBox(height: 2),
                      Text(subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: AlpColors.textMuted, fontSize: 11,),),
                    ],
                  ),
                ),
                Text('$readinessPct%',
                    style: TextStyle(
                        color: barColor,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,),),
              ],
            ),
            const Spacer(),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (readinessPct / 100).clamp(0.0, 1.0),
                minHeight: 4,
                backgroundColor: AlpColors.bgSurface3,
                valueColor: AlwaysStoppedAnimation(barColor),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    daysRemaining != null
                        ? '$daysRemaining day${daysRemaining == 1 ? "" : "s"} left'
                        : 'No target date',
                    style: const TextStyle(
                        color: AlpColors.textMuted, fontSize: 11,),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 2,),
                  decoration: BoxDecoration(
                    color: pillColor.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    onTrack ? 'On track' : 'Needs focus',
                    style: TextStyle(
                        color: pillColor,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,),
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

class _AddExamTile extends StatelessWidget {
  const _AddExamTile({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: AlpCard(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AlpColors.colorAi.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.add_rounded,
                  color: AlpColors.colorAi, size: 22,),
            ),
            const SizedBox(height: 10),
            const Text('Add exam or course',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: AlpColors.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,),),
            const SizedBox(height: 2),
            const Text('JEE · NEET · UPSC · CBSE',
                textAlign: TextAlign.center,
                style: TextStyle(color: AlpColors.textMuted, fontSize: 10),),
          ],
        ),
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

