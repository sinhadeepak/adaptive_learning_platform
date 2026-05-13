// Exam dashboard — the hub a student lands on after tapping an exam
// card on Home. Bundles every exam-scoped action in one place so the
// student doesn't have to hunt across tabs:
//   • Start Adaptive Practice (auto-picks weakest in-exam topic)
//   • Start Mock Test          (uses the exam's blueprint)
//   • Browse Topics            (scoped subject → topic picker)
//   • Analysis                 (mastery bars filtered to this exam)
//   • Quick links              (history, bookmarks)
//
// Replaces the previous behaviour where tapping an exam card jumped to
// the global Progress tab — leaving the student wondering "where do I
// start?".

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';
import '../widgets/alp_card.dart';
import '../widgets/analytics_cards.dart';
import '../widgets/home_cards.dart';
import 'bookmarks_screen.dart';
import 'history_screen.dart';
import 'main_scaffold.dart';
import 'mock_test_screen.dart';
import 'persona.dart';

class ExamDashboardScreen extends StatefulWidget {
  const ExamDashboardScreen({
    super.key,
    required this.api,
    required this.auth,
    required this.examId,
    required this.examCode,
    required this.examName,
    this.examSubtitle,
    this.targetDate,
  });

  final ApiClient api;
  final AuthClient auth;
  final String examId;
  final String examCode;
  final String examName;
  final String? examSubtitle;
  final DateTime? targetDate;

  @override
  State<ExamDashboardScreen> createState() => _ExamDashboardScreenState();
}

class _ExamDashboardScreenState extends State<ExamDashboardScreen> {
  bool _loading = true;
  bool _starting = false;
  Readiness? _readiness;
  List<Subject> _subjects = const [];
  // topicId → (title, subjectName) — built once for fast lookups.
  final Map<String, ({String title, String subjectName})> _topicMeta = {};
  // mastery rows filtered to this exam's topic IDs only.
  List<TopicMastery> _examMastery = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final results = await Future.wait([
        widget.api.readiness(user.id, scope: widget.examCode),
        widget.api.subjectsForExam(widget.examId),
        widget.api.mastery(user.id),
      ]);
      final readiness = results[0] as Readiness;
      final subjects = results[1] as List<Subject>;
      final mastery = results[2] as List<TopicMastery>;

      // Hydrate topics for every subject — needed both for the picker
      // sheet and for filtering mastery to in-exam topics only.
      final meta = <String, ({String title, String subjectName})>{};
      for (final s in subjects) {
        try {
          final topics = await widget.api.topicsForSubject(s.id);
          for (final t in topics) {
            meta[t.id] = (title: t.title, subjectName: s.name);
          }
        } catch (_) {/* skip subject on error */}
      }
      final inExamMastery = mastery
          .where((m) => meta.containsKey(m.topicId))
          .toList()
        ..sort((a, b) => a.ewa.compareTo(b.ewa));

      if (!mounted) return;
      setState(() {
        _readiness = readiness;
        _subjects = subjects;
        _topicMeta
          ..clear()
          ..addAll(meta);
        _examMastery = inExamMastery;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  int? _daysUntil() {
    final d = widget.targetDate;
    if (d == null) return null;
    final today = DateTime.now();
    final t = DateTime(today.year, today.month, today.day);
    final dd = DateTime(d.year, d.month, d.day);
    final diff = dd.difference(t).inDays;
    return diff < 0 ? 0 : diff;
  }

  Future<void> _startAdaptive() async {
    if (_starting) return;
    final user = widget.auth.user;
    if (user == null) return;

    // Pick the weakest in-exam topic if mastery data exists; otherwise
    // fall back to the first topic of the first subject so the student
    // can still get started on a fresh account.
    String? topicId;
    if (_examMastery.isNotEmpty) {
      topicId = _examMastery.first.topicId;
    } else if (_topicMeta.isNotEmpty) {
      topicId = _topicMeta.keys.first;
    }
    if (topicId == null) {
      _toast('No topics available for this exam yet.');
      return;
    }

    setState(() => _starting = true);
    try {
      final client = QuizClient(auth: widget.auth);
      final session = await client.start(topicId: topicId, userId: user.id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(
            client: client, sessionId: session.sessionId, api: widget.api,),
      ),);
      // Refresh mastery / readiness when the student returns from the
      // quiz so the dashboard reflects what just happened.
      if (mounted) await _load();
    } catch (e) {
      _toast('Could not start: $e');
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<void> _startMock() async {
    if (_starting) return;
    final user = widget.auth.user;
    if (user == null) return;
    setState(() => _starting = true);
    try {
      final plan = await widget.api
          .mockPlan(userId: user.id, examCode: widget.examCode);
      if (!mounted) return;
      if (plan.error != null) {
        _toast(plan.message ?? 'Could not build mock');
        return;
      }
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => MockTestScreen(api: widget.api, plan: plan),
      ),);
      if (mounted) await _load();
    } catch (e) {
      _toast('Mock failed: $e');
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<void> _pickTopic() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AlpColors.bgSurface1,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _ScopedTopicPicker(
        api: widget.api,
        subjects: _subjects,
      ),
    );
    if (picked == null || !mounted) return;
    final user = widget.auth.user;
    if (user == null) return;
    setState(() => _starting = true);
    try {
      final client = QuizClient(auth: widget.auth);
      final session = await client.start(topicId: picked, userId: user.id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(
            client: client, sessionId: session.sessionId, api: widget.api,),
      ),);
      if (mounted) await _load();
    } catch (e) {
      _toast('Could not start: $e');
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final pct = _readiness == null ? 0 : (_readiness!.score * 100).round();
    final days = _daysUntil();
    final hasMastery = _examMastery.isNotEmpty;
    final weakest = hasMastery ? _examMastery.first : null;
    final strongest = hasMastery
        ? (_examMastery.toList()..sort((a, b) => b.ewa.compareTo(a.ewa))).first
        : null;

    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(
        backgroundColor: AlpColors.bgBase,
        title: Text(widget.examName),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        backgroundColor: AlpColors.bgSurface2,
        color: AlpColors.colorAi,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: AlpColors.colorAi))
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                children: [
                  // ── Hero: readiness + countdown ─────────────────────
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
                        _MiniRing(pct: pct.toDouble()),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.examSubtitle ?? widget.examCode,
                                style: const TextStyle(
                                    color: AlpColors.textMuted,
                                    fontSize: 11,
                                    letterSpacing: 0.8,
                                    fontWeight: FontWeight.w600,),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '$pct% ready',
                                style: const TextStyle(
                                    color: AlpColors.colorAi,
                                    fontSize: 24,
                                    fontWeight: FontWeight.w700,
                                    height: 1,),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                days != null
                                    ? '$days day${days == 1 ? "" : "s"} to target'
                                    : (_readiness == null
                                        ? 'Take a quiz to seed readiness'
                                        : '${_readiness!.nTopics} topics tracked'),
                                style: const TextStyle(
                                    color: AlpColors.textMuted, fontSize: 12,),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Primary CTA: Adaptive Practice ──────────────────
                  _ActionCard(
                    icon: Icons.bolt_rounded,
                    accent: AlpColors.colorBlue,
                    badge: 'AI-POWERED',
                    title: 'Start Adaptive Practice',
                    subtitle: weakest != null
                        ? 'Begin with ${_topicMeta[weakest.topicId]?.title ?? "your weakest topic"} — IRT engine adjusts difficulty live.'
                        : 'Calibrate your level. The IRT engine seeds difficulty after the first session.',
                    cta: _starting ? 'Starting…' : 'Start now ▶',
                    onTap: _starting ? null : _startAdaptive,
                  ),
                  const SizedBox(height: 12),

                  // ── Mock Test (persona-aware copy) ─────────────────
                  // Junior CBSE student: "Practice test" / "Timed test"
                  // — competitive-exam vocabulary like "blueprint" /
                  // "AIR" is intimidating. Senior keeps the full
                  // exam-day framing.
                  () {
                    final p = personaForExamCode(widget.examCode);
                    return _ActionCard(
                      icon: Icons.emoji_events_outlined,
                      accent: AlpColors.colorAmber,
                      badge: p.isJunior ? 'TIMED TEST' : 'EXAM-DAY MODE',
                      title: p.isJunior
                          ? 'Take a Practice Test'
                          : 'Take a Mock Test',
                      subtitle: p.isJunior
                          ? 'Timed chapter-style test. See where you stand and which topics need a second look.'
                          : 'Full ${widget.examCode} blueprint — timed, scored, with projected percentile + AIR.',
                      cta: _starting ? 'Building…' : 'Start now ▶',
                      onTap: _starting ? null : _startMock,
                    );
                  }(),
                  const SizedBox(height: 12),

                  // ── Topic Quiz ──────────────────────────────────────
                  _ActionCard(
                    icon: Icons.menu_book_outlined,
                    accent: AlpColors.colorPurple,
                    badge: 'TOPIC FOCUS',
                    title: 'Practice a specific topic',
                    subtitle:
                        'Pick a subject and chapter to drill targeted weakness.',
                    cta: 'Browse topics →',
                    onTap: _pickTopic,
                  ),

                  // ── AI Insights ─────────────────────────────────────
                  // Moved here from Home as part of the Sprint-3 home
                  // simplification — these cards are exam-scoped, so
                  // they belong on the exam-specific dashboard rather
                  // than polluting the global home.
                  const SizedBox(height: 24),
                  const AlpSectionHeading('AI insights'),
                  // Sprint 3 — Predicted-AIR card for senior personas
                  // only (juniors don't get a meaningful rank
                  // projection from the IRT engine yet). Cross-tab
                  // navigation now works via MainScaffoldScope so the
                  // "View full trajectory" tap deep-links into the
                  // Rank tab instead of dead-ending on the dashboard.
                  if (personaForExamCode(widget.examCode).isSenior) ...[
                    HomeRankCompactCard(
                      api: widget.api,
                      auth: widget.auth,
                      onJumpToRank: () =>
                          MainScaffoldScope.of(context)?.switchToTab(3),
                    ),
                    const SizedBox(height: 12),
                  ],
                  HomePhotoDoubtCard(api: widget.api),
                  const SizedBox(height: 12),
                  GuidedNextStepsCard(
                    api: widget.api,
                    auth: widget.auth,
                    examCode: widget.examCode,
                  ),
                  const SizedBox(height: 12),
                  StudyPlanCard(
                    api: widget.api,
                    auth: widget.auth,
                    examCode: widget.examCode,
                  ),
                  const SizedBox(height: 12),
                  WeaknessDiagnosisCard(
                    api: widget.api,
                    auth: widget.auth,
                    examCode: widget.examCode,
                  ),
                  // Sprint A2 — student analytics surfacing. Each card
                  // self-hides when the underlying signal is too thin
                  // so a brand-new account doesn't see a wall of
                  // "0 items" placeholders.
                  const SizedBox(height: 12),
                  RevisionQueueCard(
                    auth: widget.auth,
                    onTapTopic: (topicId) async {
                      final user = widget.auth.user;
                      if (user == null) return;
                      try {
                        final client = QuizClient(auth: widget.auth);
                        final session = await client.start(
                            topicId: topicId, userId: user.id);
                        if (!mounted) return;
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => QuizScreen(
                                client: client,
                                sessionId: session.sessionId,
                                api: widget.api),
                          ),
                        );
                      } catch (_) {/* swallow — user can retry */}
                    },
                  ),
                  const SizedBox(height: 12),
                  ConceptMasteryCard(auth: widget.auth),
                  const SizedBox(height: 12),
                  ErrorPatternsCard(auth: widget.auth),

                  // ── Analysis ────────────────────────────────────────
                  const SizedBox(height: 24),
                  const AlpSectionHeading('Your analysis'),
                  if (!hasMastery)
                    AlpCard(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          const Icon(Icons.insights_outlined,
                              color: AlpColors.textMuted, size: 22,),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Text(
                              'No analysis yet. Finish a practice round and we\'ll show your strongest and weakest topics here.',
                              style: TextStyle(
                                  color: AlpColors.textMuted,
                                  fontSize: 13,
                                  height: 1.4,),
                            ),
                          ),
                        ],
                      ),
                    )
                  else ...[
                    Row(
                      children: [
                        Expanded(
                          child: _StatTile(
                            label: 'STRONGEST',
                            value:
                                '${(strongest!.ewa * 100).round()}%',
                            sub: _topicMeta[strongest.topicId]?.title ?? '—',
                            tone: AlpColors.colorGreen,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _StatTile(
                            label: 'WEAKEST',
                            value: '${(weakest!.ewa * 100).round()}%',
                            sub: _topicMeta[weakest.topicId]?.title ?? '—',
                            tone: AlpColors.colorRed,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ..._examMastery.take(6).map((m) => _MasteryRow(
                          title: _topicMeta[m.topicId]?.title ??
                              'Topic ${m.topicId.substring(0, 8)}',
                          subject: _topicMeta[m.topicId]?.subjectName ?? '',
                          ewa: m.ewa,
                          n: m.n,
                        ),),
                  ],

                  // ── Quick links ─────────────────────────────────────
                  const SizedBox(height: 24),
                  const AlpSectionHeading('Quick links'),
                  Row(
                    children: [
                      Expanded(
                          child: _QuickLink(
                              icon: Icons.history_rounded,
                              label: 'History',
                              onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                      builder: (_) => HistoryScreen(
                                          api: widget.api,
                                          auth: widget.auth,),),),),),
                      const SizedBox(width: 10),
                      Expanded(
                          child: _QuickLink(
                              icon: Icons.bookmark_outline,
                              label: 'Bookmarks',
                              onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                      builder: (_) => BookmarksScreen(
                                          api: widget.api,
                                          auth: widget.auth,),),),),),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Sub-widgets
// ──────────────────────────────────────────────────────────────────────

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.accent,
    required this.badge,
    required this.title,
    required this.subtitle,
    required this.cta,
    required this.onTap,
  });
  final IconData icon;
  final Color accent;
  final String badge;
  final String title;
  final String subtitle;
  final String cta;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      borderColor: accent.withValues(alpha: 0.30),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: accent, size: 22),
              ),
              const Spacer(),
              AlpPill(label: badge, color: accent),
            ],
          ),
          const SizedBox(height: 12),
          Text(title,
              style: const TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,),),
          const SizedBox(height: 4),
          Text(subtitle,
              style: const TextStyle(
                  color: AlpColors.textSecondary,
                  fontSize: 13,
                  height: 1.4,),),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(cta,
                style: TextStyle(
                    color: accent,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,),),
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile(
      {required this.label,
      required this.value,
      required this.sub,
      required this.tone,});
  final String label;
  final String value;
  final String sub;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  color: AlpColors.textMuted,
                  fontSize: 10,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w600,),),
          const SizedBox(height: 4),
          Text(value,
              style: TextStyle(
                  color: tone,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  height: 1,),),
          const SizedBox(height: 4),
          Text(sub,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: AlpColors.textMuted, fontSize: 11,),),
        ],
      ),
    );
  }
}

class _MasteryRow extends StatelessWidget {
  const _MasteryRow(
      {required this.title,
      required this.subject,
      required this.ewa,
      required this.n,});
  final String title;
  final String subject;
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
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: AlpColors.textPrimary,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,),),
                      const SizedBox(height: 2),
                      Text('$subject · $n session${n == 1 ? "" : "s"}',
                          style: const TextStyle(
                              color: AlpColors.textMuted, fontSize: 11,),),
                    ],
                  ),
                ),
                Text('$pct%',
                    style: TextStyle(
                        color: tone,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,),),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: ewa.clamp(0.0, 1.0),
                minHeight: 4,
                backgroundColor: AlpColors.bgSurface3,
                valueColor: AlwaysStoppedAnimation(tone),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickLink extends StatelessWidget {
  const _QuickLink(
      {required this.icon, required this.label, required this.onTap,});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Icon(icon, color: AlpColors.colorAi, size: 20),
          const SizedBox(width: 10),
          Text(label,
              style: const TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,),),
          const Spacer(),
          const Icon(Icons.chevron_right,
              color: AlpColors.textMuted, size: 18,),
        ],
      ),
    );
  }
}

class _MiniRing extends StatelessWidget {
  const _MiniRing({required this.pct});
  final double pct;
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 64,
      height: 64,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 64,
            height: 64,
            child: CircularProgressIndicator(
              value: (pct / 100).clamp(0.0, 1.0),
              strokeWidth: 6,
              backgroundColor: AlpColors.bgSurface3,
              valueColor: AlwaysStoppedAnimation(
                pct >= 60
                    ? AlpColors.colorGreen
                    : pct >= 30
                        ? AlpColors.colorBlue
                        : AlpColors.colorRed,
              ),
            ),
          ),
          Text('${pct.round()}',
              style: const TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,),),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Topic picker scoped to one exam — Subject list → Topic list → return.
// ──────────────────────────────────────────────────────────────────────

class _ScopedTopicPicker extends StatefulWidget {
  const _ScopedTopicPicker({required this.api, required this.subjects});
  final ApiClient api;
  final List<Subject> subjects;

  @override
  State<_ScopedTopicPicker> createState() => _ScopedTopicPickerState();
}

class _ScopedTopicPickerState extends State<_ScopedTopicPicker> {
  Subject? _selectedSubject;
  List<Topic> _topics = const [];
  bool _loading = false;

  Future<void> _pickSubject(Subject s) async {
    setState(() {
      _selectedSubject = s;
      _loading = true;
    });
    try {
      final ts = await widget.api.topicsForSubject(s.id);
      if (!mounted) return;
      setState(() => _topics = ts);
    } catch (_) {
      if (!mounted) return;
      setState(() => _topics = const []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: mq.size.height * 0.78),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                if (_selectedSubject != null)
                  IconButton(
                    icon: const Icon(Icons.arrow_back,
                        color: AlpColors.textPrimary,),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () => setState(() {
                      _selectedSubject = null;
                      _topics = const [];
                    }),
                  ),
                if (_selectedSubject != null) const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _selectedSubject?.name ?? 'Pick a subject',
                    style: const TextStyle(
                        color: AlpColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: AlpColors.textMuted),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Flexible(
              child: _selectedSubject == null
                  ? ListView.separated(
                      shrinkWrap: true,
                      itemCount: widget.subjects.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (ctx, i) {
                        final s = widget.subjects[i];
                        return _PickerRow(
                          title: s.name,
                          subtitle:
                              '${s.topicCount} topic${s.topicCount == 1 ? "" : "s"}',
                          onTap: () => _pickSubject(s),
                        );
                      },
                    )
                  : _loading
                      ? const Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(
                              child: CircularProgressIndicator(
                                  color: AlpColors.colorAi,),),
                        )
                      : _topics.isEmpty
                          ? const Padding(
                              padding: EdgeInsets.all(24),
                              child: Text(
                                  'No topics in this subject yet.',
                                  style: TextStyle(
                                      color: AlpColors.textMuted,),),
                            )
                          : ListView.separated(
                              shrinkWrap: true,
                              itemCount: _topics.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 8),
                              itemBuilder: (ctx, i) {
                                final t = _topics[i];
                                return _PickerRow(
                                  title: t.title,
                                  subtitle:
                                      '${t.questionCount} question${t.questionCount == 1 ? "" : "s"}',
                                  onTap: () =>
                                      Navigator.of(context).pop(t.id),
                                );
                              },
                            ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  const _PickerRow(
      {required this.title, required this.subtitle, required this.onTap,});
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        color: AlpColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,),),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: const TextStyle(
                        color: AlpColors.textMuted, fontSize: 12,),),
              ],
            ),
          ),
          const Icon(Icons.chevron_right,
              color: AlpColors.textMuted, size: 18,),
        ],
      ),
    );
  }
}
