// VidyaInsightsScreen — Phase 3d v1. Mastery bucket summary derived
// client-side from /analytics/mastery. Named per-topic breakdowns,
// Weekly Story carousel, and time-spent trends are deferred to
// Phase 3d.full.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../insights/insights_client.dart';
import '../../screens/concept_profile_screen.dart';
import '../../screens/diagnostic_deep_dive_screen.dart';
import '../aurora_route.dart';
import '../state/active_exam_notifier.dart';
import '../widgets/vidya_exam_switcher.dart';
import 'vidya_analysis_screen.dart';
import 'vidya_catalog_screen.dart';
import 'vidya_revision_screen.dart';
import 'vidya_syllabus_coverage_screen.dart';
import 'vidya_topic_detail_screen.dart';

class VidyaInsightsScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaInsightsScreen({super.key, required this.auth});

  @override
  State<VidyaInsightsScreen> createState() => _VidyaInsightsScreenState();
}

enum _InsightsState { loading, loaded, empty, error }

class _InsightsData {
  final int strong;
  final int developing;
  final int weak;
  final int notStarted;
  final int totalAttempted;
  // Phase 3d.full v1 — named topics under "FOCUS ON". Topics with EWA
  // in (0, 0.70), weakest first, up to 3. Empty when no qualifying
  // topics OR the topic-catalog fetch failed (degraded silently).
  final List<_FocusTopic> focusOn;

  const _InsightsData({
    required this.strong,
    required this.developing,
    required this.weak,
    required this.notStarted,
    required this.totalAttempted,
    this.focusOn = const [],
  });

  factory _InsightsData.fromMastery(
    List<TopicMastery> rows, {
    Map<String, Topic> topicsById = const {},
  }) {
    var strong = 0, developing = 0, weak = 0, notStarted = 0;
    for (final r in rows) {
      if (r.ewa >= 0.70) {
        strong++;
      } else if (r.ewa >= 0.40) {
        developing++;
      } else if (r.ewa > 0) {
        weak++;
      } else {
        notStarted++;
      }
    }
    // Build FOCUS ON list — only attempted topics not yet STRONG.
    final candidates = [
      for (final r in rows)
        if (r.ewa > 0 && r.ewa < 0.70 && topicsById.containsKey(r.topicId))
          _FocusTopic(topic: topicsById[r.topicId]!, ewa: r.ewa),
    ]..sort((a, b) => a.ewa.compareTo(b.ewa));
    return _InsightsData(
      strong: strong,
      developing: developing,
      weak: weak,
      notStarted: notStarted,
      totalAttempted: strong + developing + weak,
      focusOn: candidates.take(3).toList(growable: false),
    );
  }
}

class _FocusTopic {
  final Topic topic;
  final double ewa;
  const _FocusTopic({required this.topic, required this.ewa});
}

class _VidyaInsightsScreenState extends State<VidyaInsightsScreen> {
  _InsightsState _state = _InsightsState.loading;
  _InsightsData? _data;
  // Phase 4 — structured 3-zone snapshot (state / meaning / action).
  // Best-effort: null when the aggregator is unavailable; the bucket
  // grid + Dig-deeper still render without it.
  InsightsSnapshot? _snapshot;

  // Active-exam spine: the FOCUS-ON topic catalog and the Syllabus link are
  // exam-scoped, so reload when the student switches exam.
  VidyaActiveExamNotifier? _examNotifier;
  String? _loadedExamId;
  bool _didInitialLoad = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final n = VidyaActiveExam.of(context);
    if (!identical(n, _examNotifier)) {
      _examNotifier?.removeListener(_onActiveExamChanged);
      _examNotifier = n;
      _examNotifier?.addListener(_onActiveExamChanged);
    }
    if (!_didInitialLoad) {
      _didInitialLoad = true;
      _load();
    }
  }

  @override
  void dispose() {
    _examNotifier?.removeListener(_onActiveExamChanged);
    super.dispose();
  }

  void _onActiveExamChanged() {
    final n = _examNotifier;
    if (n == null || n.loading) return;
    if (n.active?.examId != _loadedExamId) _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    _loadedExamId = _examNotifier?.active?.examId;
    setState(() => _state = _InsightsState.loading);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _InsightsState.empty);
      return;
    }
    try {
      final api = ApiClient(widget.auth);
      final rows = await api.mastery(user.id);
      if (!mounted) return;
      if (rows.isEmpty) {
        setState(() => _state = _InsightsState.empty);
        return;
      }
      // Phase 3d.full v1 — also resolve topicId → Topic so the
      // FOCUS ON section can show topic names. Failures here degrade
      // silently: the bucket grid renders even without names.
      final topicsById = await _resolveTopicsCatalog(api);
      if (!mounted) return;
      setState(() {
        _data = _InsightsData.fromMastery(rows, topicsById: topicsById);
        _state = _InsightsState.loaded;
      });
      // Zones 2/3 — fetch the structured snapshot after the bucket grid
      // is already on screen. Failure degrades silently (zones omitted).
      try {
        final snap =
            await InsightsClient(auth: widget.auth).fetchSnapshot(user.id);
        if (mounted) setState(() => _snapshot = snap);
      } catch (_) {
        // aggregator unavailable — leave zones 2/3 hidden
      }
    } catch (_) {
      if (mounted) setState(() => _state = _InsightsState.error);
    }
  }

  Future<Map<String, Topic>> _resolveTopicsCatalog(ApiClient api) async {
    try {
      // Scope to the app-wide active exam so FOCUS-ON shows that exam's
      // topics (not always the primary exam's).
      final examId = _examNotifier?.active?.examId;
      if (examId == null) return const {};
      final subjects = await api.subjectsForExam(examId);
      if (subjects.isEmpty) return const {};
      // Parallel fan-out: one topicsForSubject call per subject.
      final topicLists = await Future.wait(
        subjects.map((s) => api.topicsForSubject(s.id)),
      );
      final result = <String, Topic>{};
      for (final topics in topicLists) {
        for (final t in topics) {
          result[t.id] = t;
        }
      }
      return result;
    } catch (_) {
      return const {};
    }
  }

  void _onFocusTopicTap(_FocusTopic t) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) =>
          VidyaTopicDetailScreen(auth: widget.auth, topic: t.topic, ewa: t.ewa),
    ));
  }

  /// Pushes an Aurora-built analytics screen wrapped in [AuroraRoute] so
  /// it renders under its own Aurora MaterialApp — the same shim the More
  /// hub uses to mount legacy screens from the Vidya shell.
  void _openAurora(Widget Function(BuildContext) builder) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AuroraRoute(builder: builder),
      ),
    );
  }

  void _openRevision() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VidyaRevisionScreen(auth: widget.auth),
      ),
    );
  }

  /// Zones 2 (What this means) and 3 (What to do), rendered from the
  /// structured insights snapshot. Mirrors web Insights.tsx zones.
  List<Widget> _buildZones(InsightsSnapshot s, VidyaThemeData v) {
    final weak = s.weakConcepts.length;
    final decay = s.decayAlerts.length;
    final critical = s.decayAlerts
        .where((c) => c.decaySeverity == DecaySeverity.critical)
        .length;
    return [
      const SizedBox(height: 24),
      _ZoneHeader(label: 'WHAT THIS MEANS'),
      const SizedBox(height: 12),
      _ZoneCard(
        rows: [
          if (weak > 0)
            _ZoneRow(
              icon: Icons.trending_down,
              tone: v.bad,
              title: '$weak weak concept${weak == 1 ? '' : 's'}',
              detail: 'Mastery is below 40% — prioritise these.',
            ),
          if (decay > 0)
            _ZoneRow(
              icon: Icons.schedule,
              tone: v.warn,
              title: '$decay topic${decay == 1 ? '' : 's'} fading'
                  '${critical > 0 ? '  ·  $critical critical' : ''}',
              detail: 'Knowledge is decaying since your last review.',
            ),
          if (weak == 0 && decay == 0)
            _ZoneRow(
              icon: Icons.check_circle_outline,
              tone: v.good,
              title: 'Nothing flagged',
              detail: 'No weak or decaying concepts right now.',
            ),
        ],
      ),
      const SizedBox(height: 24),
      _ZoneHeader(label: 'WHAT TO DO'),
      const SizedBox(height: 12),
      _ZoneCard(
        rows: [
          _ZoneRow(
            icon: s.missionsTodayPending ? Icons.flag : Icons.flag_outlined,
            tone: s.missionsTodayPending ? v.accent : v.ink3,
            title: s.missionsTodayPending
                ? "Today's mission is pending"
                : "Today's mission is done",
            detail: s.missionsTodayPending
                ? 'Finish your daily plan to keep your streak.'
                : "Nice — you've completed today's plan.",
          ),
          _ZoneRow(
            icon: Icons.event_repeat,
            tone: s.revisionDueToday > 0 ? v.accent : v.ink3,
            title: s.revisionDueToday > 0
                ? '${s.revisionDueToday} topic${s.revisionDueToday == 1 ? '' : 's'} due for revision'
                : 'No revision due today',
            detail: s.revisionDueToday > 0
                ? 'Start your spaced-repetition queue.'
                : 'Your spaced-repetition queue is clear.',
            onTap: s.revisionDueToday > 0 ? _openRevision : null,
          ),
        ],
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    switch (_state) {
      case _InsightsState.loading:
        return const _InsightsSkeleton();
      case _InsightsState.empty:
        return _EmptyState(v: v);
      case _InsightsState.error:
        return _ErrorState(onRetry: _load, v: v);
      case _InsightsState.loaded:
        final d = _data!;
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'INSIGHTS',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      color: v.ink3,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
                VidyaExamPill(
                  onAddExam: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => VidyaCatalogScreen(
                        auth: widget.auth,
                        onExamAdded: () => _examNotifier?.refresh(),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Where you stand.',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 32,
                fontWeight: FontWeight.w500,
                color: v.ink,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '${d.totalAttempted} topics attempted',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.4,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _BucketTile(
                    label: 'STRONG',
                    count: d.strong,
                    accent: v.good,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _BucketTile(
                    label: 'DEVELOPING',
                    count: d.developing,
                    accent: v.info,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _BucketTile(
                    label: 'WEAK',
                    count: d.weak,
                    accent: v.bad,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _BucketTile(
                    label: 'NOT STARTED',
                    count: d.notStarted,
                    accent: v.ink3,
                  ),
                ),
              ],
            ),
            if (d.focusOn.isNotEmpty) ...[
              const SizedBox(height: 24),
              Text(
                'FOCUS ON',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: v.ink3,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${d.focusOn.length} ${d.focusOn.length == 1 ? "topic" : "topics"} to work on',
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink2,
                ),
              ),
              const SizedBox(height: 12),
              for (final t in d.focusOn) ...[
                _FocusCard(
                  topic: t,
                  onTap: () => _onFocusTopicTap(t),
                ),
                const SizedBox(height: 10),
              ],
            ],
            if (_snapshot != null) ..._buildZones(_snapshot!, v),
            const SizedBox(height: 24),
            Text(
              'DIG DEEPER',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            _DeepDiveRow(
              icon: Icons.event_repeat,
              label: 'Revision',
              sublabel: 'Spaced-repetition topics due for review',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => VidyaRevisionScreen(auth: widget.auth),
                ),
              ),
            ),
            const SizedBox(height: 10),
            _DeepDiveRow(
              icon: Icons.insights_outlined,
              label: 'My Analysis',
              sublabel: 'Dimension fluency, weakest concepts & calibration',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => VidyaAnalysisScreen(auth: widget.auth),
                ),
              ),
            ),
            const SizedBox(height: 10),
            _DeepDiveRow(
              icon: Icons.radar,
              label: 'Concept Profile',
              sublabel: 'Multi-parameter mastery per concept',
              onTap: () {
                final userId = widget.auth.user?.id ?? '';
                _openAurora(
                  (_) =>
                      ConceptProfileScreen(userId: userId, auth: widget.auth),
                );
              },
            ),
            const SizedBox(height: 10),
            _DeepDiveRow(
              icon: Icons.account_tree_outlined,
              label: 'Diagnostic Deep-Dive',
              sublabel: 'Trace a weakness to its root cause',
              onTap: () {
                final userId = widget.auth.user?.id ?? '';
                _openAurora(
                  (_) => DiagnosticDeepDiveScreen(
                    userId: userId,
                    auth: widget.auth,
                  ),
                );
              },
            ),
            const SizedBox(height: 10),
            _DeepDiveRow(
              icon: Icons.fact_check_outlined,
              label: 'Syllabus Coverage',
              sublabel: 'Chapter-by-chapter coverage across the syllabus',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => VidyaSyllabusCoverageScreen(
                    auth: widget.auth,
                    examId: _examNotifier?.active?.examId ?? '',
                  ),
                ),
              ),
            ),
          ],
        );
    }
  }
}

/// A tappable "dig deeper" row linking to a richer analytics surface:
/// leading icon, label + sublabel, trailing chevron. Mirrors web's
/// Insights → Phase-5 deep-link pattern (ADR-0020).
class _DeepDiveRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String sublabel;
  final VoidCallback onTap;
  const _DeepDiveRow({
    required this.icon,
    required this.label,
    required this.sublabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(icon, size: 22, color: v.accent),
            const SizedBox(width: 14),
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
                    sublabel,
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
            Icon(Icons.chevron_right, color: v.ink3, size: 22),
          ],
        ),
      ),
    );
  }
}

/// Small mono eyebrow above an insights zone.
class _ZoneHeader extends StatelessWidget {
  final String label;
  const _ZoneHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Text(
      label,
      style: TextStyle(
        fontFamily: VidyaFonts.mono,
        fontSize: 11,
        color: v.ink3,
        letterSpacing: 1.4,
      ),
    );
  }
}

/// A card stacking zone rows with hairline separators.
class _ZoneCard extends StatelessWidget {
  final List<_ZoneRow> rows;
  const _ZoneCard({required this.rows});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i != rows.length - 1)
              Divider(
                height: 1,
                thickness: 1,
                indent: 48,
                color: v.ink3.withValues(alpha: 0.12),
              ),
          ],
        ],
      ),
    );
  }
}

/// A single insights-zone row: toned icon + title + one-line detail,
/// optionally tappable (e.g. revision → revision queue).
class _ZoneRow extends StatelessWidget {
  final IconData icon;
  final Color tone;
  final String title;
  final String detail;
  final VoidCallback? onTap;
  const _ZoneRow({
    required this.icon,
    required this.tone,
    required this.title,
    required this.detail,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: tone),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    detail,
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
            if (onTap != null)
              Icon(Icons.chevron_right, color: v.ink3, size: 22),
          ],
        ),
      ),
    );
  }
}

class _BucketTile extends StatelessWidget {
  final String label;
  final int count;
  final Color accent;
  const _BucketTile({
    required this.label,
    required this.count,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: accent,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      color: v.ink3,
                      letterSpacing: 1.2,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '$count',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 24,
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

class _EmptyState extends StatelessWidget {
  final VidyaThemeData v;
  const _EmptyState({required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'NO DATA YET',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 10,
                    color: v.ink3,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'No mastery data yet',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    color: v.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Try some practice questions and come back to see '
                  'your insights here.',
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 14,
                    color: v.ink2,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;
  final VidyaThemeData v;
  const _ErrorState({required this.onRetry, required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              "We couldn't load your insights.",
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 15,
                color: v.ink2,
              ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: 'Retry',
              onPressed: onRetry,
              size: VidyaButtonSize.md,
            ),
          ],
        ),
      ),
    );
  }
}

class _FocusCard extends StatelessWidget {
  final _FocusTopic topic;
  final VoidCallback onTap;
  const _FocusCard({required this.topic, required this.onTap});

  String _label() {
    if (topic.ewa >= 0.40) return 'DEVELOPING';
    return 'WEAK';
  }

  Color _color(VidyaThemeData v) {
    if (topic.ewa >= 0.40) return v.info;
    return v.bad;
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: _color(v),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${_label()} • ${topic.ewa.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      color: v.ink3,
                      letterSpacing: 1.4,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                topic.topic.title,
                style: TextStyle(
                  fontFamily: VidyaFonts.display,
                  fontSize: 20,
                  fontWeight: FontWeight.w500,
                  color: v.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InsightsSkeleton extends StatelessWidget {
  const _InsightsSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: const [
        VidyaSkeletonBlock(width: 80, height: 12),
        SizedBox(height: 10),
        VidyaSkeletonBlock(width: 200, height: 30),
        SizedBox(height: 20),
        Row(
          children: [
            Expanded(child: VidyaSkeletonBlock(height: 64)),
            SizedBox(width: 8),
            Expanded(child: VidyaSkeletonBlock(height: 64)),
          ],
        ),
        SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: VidyaSkeletonBlock(height: 64)),
            SizedBox(width: 8),
            Expanded(child: VidyaSkeletonBlock(height: 64)),
          ],
        ),
      ],
    );
  }
}
