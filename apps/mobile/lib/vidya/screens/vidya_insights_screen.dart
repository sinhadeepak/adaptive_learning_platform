// VidyaInsightsScreen — Phase 3d v1. Mastery bucket summary derived
// client-side from /analytics/mastery. Named per-topic breakdowns,
// Weekly Story carousel, and time-spent trends are deferred to
// Phase 3d.full.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../screens/concept_profile_screen.dart';
import '../../screens/diagnostic_deep_dive_screen.dart';
import '../../screens/progress_tab.dart';
import '../aurora_route.dart';
import 'vidya_revision_screen.dart';
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
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
    } catch (_) {
      if (mounted) setState(() => _state = _InsightsState.error);
    }
  }

  Future<Map<String, Topic>> _resolveTopicsCatalog(ApiClient api) async {
    try {
      final profile = await api.getProfile();
      final examId = (profile?.exams.isNotEmpty ?? false)
          ? profile!.exams.first.examId
          : null;
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
      builder: (_) => VidyaTopicDetailScreen(topic: t.topic, ewa: t.ewa),
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
            Text(
              'INSIGHTS',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.5,
              ),
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
              sublabel: 'Readiness, activity & topic mastery',
              onTap: () => _openAurora(
                (_) =>
                    ProgressTab(api: ApiClient(widget.auth), auth: widget.auth),
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
