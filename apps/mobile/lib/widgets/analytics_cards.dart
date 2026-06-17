// Sprint A2 — student analytics surfacing cards.
//
// Each widget owns its own fetch + cold-start loading state. They're
// small and scoped enough that hoisting fetches into the parent would
// just bloat the page state for no real benefit.
//
// All cards auto-hide when the underlying signal is too thin (no rows,
// hidden flag from cohort threshold, etc.). The honest-signalling
// pattern matches how the backend designs the endpoints — we'd rather
// show nothing than a misleading "0%".

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/analytics.dart';
import '../auth/auth_client.dart';
import 'alp_card.dart';

// ─── Concept mastery (per-concept EWA bar list) ─────────────────────

class ConceptMasteryCard extends StatefulWidget {
  const ConceptMasteryCard({super.key, required this.auth});
  final AuthClient auth;

  @override
  State<ConceptMasteryCard> createState() => _ConceptMasteryCardState();
}

class _ConceptMasteryCardState extends State<ConceptMasteryCard> {
  List<ConceptMastery>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final list =
          await AnalyticsClient(widget.auth).conceptMastery(user.id);
      if (!mounted) return;
      setState(() {
        _data = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = _data;
    if (_loading || list == null || list.isEmpty) {
      return const SizedBox.shrink();
    }
    final shown = list.take(8).toList();
    return AlpCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.timeline,
                  color: AlpColors.colorPurple, size: 20),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Concept mastery',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700)),
              ),
              Text('${list.length} tracked',
                  style: const TextStyle(
                      color: AlpColors.textMuted, fontSize: 11)),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Per-concept EWA. Weakest at the top — focus your next round here.',
            style: TextStyle(
                color: AlpColors.textMuted, fontSize: 11, height: 1.4),
          ),
          const SizedBox(height: 12),
          ...shown.map(_row),
        ],
      ),
    );
  }

  Widget _row(ConceptMastery c) {
    final pct = (c.ewa * 100).round();
    final tone = c.ewa >= 0.7
        ? AlpColors.colorGreen
        : c.ewa >= 0.4
            ? AlpColors.colorBlue
            : AlpColors.colorRed;
    final label = c.conceptId.length > 36
        ? c.conceptId.substring(0, 8)
        : c.conceptId;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 12),
            ),
          ),
          Expanded(
            flex: 6,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: c.ewa.clamp(0.0, 1.0),
                minHeight: 5,
                backgroundColor: AlpColors.bgSurface3,
                valueColor: AlwaysStoppedAnimation(tone),
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 36,
            child: Text(
              '$pct%',
              textAlign: TextAlign.right,
              style: TextStyle(
                  color: tone, fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Error patterns (top mistake clusters) ──────────────────────────

class ErrorPatternsCard extends StatefulWidget {
  const ErrorPatternsCard({super.key, required this.auth});
  final AuthClient auth;

  @override
  State<ErrorPatternsCard> createState() => _ErrorPatternsCardState();
}

class _ErrorPatternsCardState extends State<ErrorPatternsCard> {
  ErrorPatternsRollup? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final d = await AnalyticsClient(widget.auth).errorPatterns(user.id);
      if (!mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (_loading || d == null || d.topPatterns.isEmpty) {
      return const SizedBox.shrink();
    }
    final shown = d.topPatterns.take(3).toList();
    return AlpCard(
      padding: const EdgeInsets.all(16),
      borderColor: AlpColors.colorAmber.withValues(alpha: 0.3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.error_outline,
                  color: AlpColors.colorAmber, size: 20),
              SizedBox(width: 8),
              Text('Common mistakes',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Patterns the AI tagged in your wrong answers. Address these and your accuracy moves quickly.',
            style: TextStyle(
                color: AlpColors.textMuted, fontSize: 11, height: 1.4),
          ),
          const SizedBox(height: 12),
          ...shown.map((p) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AlpColors.colorAmber.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${p.count}',
                        style: const TextStyle(
                            color: AlpColors.colorAmber,
                            fontSize: 11,
                            fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.classification,
                              style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600)),
                          if (p.topTopics.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              p.topTopics
                                  .take(2)
                                  .map((t) => t.topicTitle.isEmpty
                                      ? 'Topic'
                                      : t.topicTitle)
                                  .join(' · '),
                              style: const TextStyle(
                                  color: AlpColors.textMuted, fontSize: 11),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

// ─── Peer percentile pill (compact, single-line) ───────────────────

class PeerPercentilePill extends StatefulWidget {
  const PeerPercentilePill({
    super.key,
    required this.auth,
    required this.examId,
    required this.topicId,
  });
  final AuthClient auth;
  final String examId;
  final String topicId;

  @override
  State<PeerPercentilePill> createState() => _PeerPercentilePillState();
}

class _PeerPercentilePillState extends State<PeerPercentilePill> {
  PeerPercentile? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final d = await AnalyticsClient(widget.auth).peerPercentile(
        userId: user.id,
        examId: widget.examId,
        topicId: widget.topicId,
      );
      if (!mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (_loading || d == null || d.hidden || d.percentile == null) {
      return const SizedBox.shrink();
    }
    final pct = d.percentile!.round();
    final tone = pct >= 75
        ? AlpColors.colorGreen
        : pct >= 40
            ? AlpColors.colorBlue
            : AlpColors.colorAmber;
    final label = pct >= 90
        ? 'Top 10% of peers'
        : pct >= 75
            ? 'Top 25% of peers'
            : pct >= 50
                ? 'Above-median peers'
                : 'Below-median peers — room to grow';
    return Tooltip(
      message:
          'Cohort size: ${d.cohortSize}. Your raw mastery: ${(d.userEwa! * 100).round()}%. Tap to dismiss.',
      triggerMode: TooltipTriggerMode.tap,
      showDuration: const Duration(seconds: 4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: tone.withValues(alpha: 0.4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.people_alt_outlined, color: tone, size: 14),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                  color: tone, fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Revision queue (SM-2 due today) ────────────────────────────────

class RevisionQueueCard extends StatefulWidget {
  const RevisionQueueCard(
      {super.key,
      required this.auth,
      this.onTap,
      this.onTapTopic});
  final AuthClient auth;
  // Tap on the section heading — usually opens History or a dedicated
  // revision queue screen. Optional.
  final VoidCallback? onTap;
  // Tap on a single topic row — usually launches a quiz on that topic.
  // Optional.
  final void Function(String topicId)? onTapTopic;

  @override
  State<RevisionQueueCard> createState() => _RevisionQueueCardState();
}

class _RevisionQueueCardState extends State<RevisionQueueCard> {
  List<RevisionItem>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final list = await AnalyticsClient(widget.auth).revisionDue(user.id);
      if (!mounted) return;
      setState(() {
        _data = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = _data;
    if (_loading || list == null || list.isEmpty) {
      return const SizedBox.shrink();
    }
    final shown = list.take(4).toList();
    return AlpCard(
      onTap: widget.onTap,
      padding: const EdgeInsets.all(16),
      borderColor: AlpColors.colorBlue.withValues(alpha: 0.3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.schedule,
                  color: AlpColors.colorBlue, size: 20),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Due for revision',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700)),
              ),
              Text('${list.length} due',
                  style: const TextStyle(
                      color: AlpColors.colorBlue,
                      fontSize: 11,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Topics the spaced-repetition scheduler thinks are decaying. Most-overdue first.',
            style: TextStyle(
                color: AlpColors.textMuted, fontSize: 11, height: 1.4),
          ),
          const SizedBox(height: 10),
          ...shown.map((it) => InkWell(
                onTap: widget.onTapTopic == null
                    ? null
                    : () => widget.onTapTopic!(it.topicId),
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          it.topicTitle.isEmpty ? 'Topic…' : it.topicTitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13),
                        ),
                      ),
                      if (it.overdueDays > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AlpColors.colorRed.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${it.overdueDays}d late',
                            style: const TextStyle(
                                color: AlpColors.colorRed,
                                fontSize: 10,
                                fontWeight: FontWeight.w700),
                          ),
                        )
                      else
                        const Text('Due today',
                            style: TextStyle(
                                color: AlpColors.textMuted, fontSize: 10)),
                      if (widget.onTapTopic != null) ...[
                        const SizedBox(width: 6),
                        const Icon(Icons.chevron_right,
                            color: AlpColors.textMuted, size: 16),
                      ],
                    ],
                  ),
                ),
              )),
        ],
      ),
    );
  }
}

// ─── Multi-profile (concept dimensions, simplified bar list) ────────

class MultiProfileCard extends StatefulWidget {
  const MultiProfileCard({super.key, required this.auth});
  final AuthClient auth;

  @override
  State<MultiProfileCard> createState() => _MultiProfileCardState();
}

class _MultiProfileCardState extends State<MultiProfileCard> {
  MultiProfile? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final d = await AnalyticsClient(widget.auth).multiProfile(user.id);
      if (!mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (_loading || d == null) return const SizedBox.shrink();
    final concepts = d.concepts.take(6).toList();
    final fluency = d.fluency.take(6).toList();
    if (concepts.isEmpty && fluency.isEmpty) {
      return const SizedBox.shrink();
    }
    return AlpCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.donut_small,
                  color: AlpColors.colorAi, size: 20),
              SizedBox(width: 8),
              Text('Multi-dimensional profile',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Concept × Bloom × fluency × confidence — the substrate the engine uses for adaptive practice.',
            style: TextStyle(
                color: AlpColors.textMuted, fontSize: 11, height: 1.4),
          ),
          if (d.confidenceBrier != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('Confidence calibration (Brier):',
                    style: TextStyle(
                        color: AlpColors.textMuted, fontSize: 11)),
                const SizedBox(width: 4),
                Text(
                  d.confidenceBrier!.toStringAsFixed(3),
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ],
          if (concepts.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text('Concepts',
                style: TextStyle(
                    color: AlpColors.textMuted,
                    fontSize: 10,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            ...concepts.map((c) => _ProfileBar(
                  label: c.conceptId.length > 16
                      ? c.conceptId.substring(0, 8)
                      : c.conceptId,
                  value: c.ewa,
                )),
          ],
          if (fluency.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text('Fluency',
                style: TextStyle(
                    color: AlpColors.textMuted,
                    fontSize: 10,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            ...fluency.map((f) => _ProfileBar(
                  label: f.dimension.length > 16
                      ? f.dimension.substring(0, 8)
                      : f.dimension,
                  value: f.score,
                )),
          ],
        ],
      ),
    );
  }
}

class _ProfileBar extends StatelessWidget {
  const _ProfileBar({required this.label, required this.value});
  final String label;
  final double value;

  @override
  Widget build(BuildContext context) {
    final pct = (value * 100).round();
    final tone = value >= 0.7
        ? AlpColors.colorGreen
        : value >= 0.4
            ? AlpColors.colorBlue
            : AlpColors.colorRed;
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: AlpColors.textMuted, fontSize: 11)),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: value.clamp(0.0, 1.0),
                minHeight: 4,
                backgroundColor: AlpColors.bgSurface3,
                valueColor: AlwaysStoppedAnimation(tone),
              ),
            ),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 32,
            child: Text(
              '$pct%',
              textAlign: TextAlign.right,
              style: TextStyle(
                  color: tone, fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Insights snapshot (3 pillars, 3 bullets each) ──────────────────

class InsightsSnapshotCard extends StatefulWidget {
  const InsightsSnapshotCard({super.key, required this.auth});
  final AuthClient auth;

  @override
  State<InsightsSnapshotCard> createState() => _InsightsSnapshotCardState();
}

class _InsightsSnapshotCardState extends State<InsightsSnapshotCard> {
  InsightsSnapshot? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final d = await AnalyticsClient(widget.auth).insightsSnapshot(user.id);
      if (!mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (_loading || d == null) return const SizedBox.shrink();
    final hasContent = d.myState.isNotEmpty ||
        d.whatThisMeans.isNotEmpty ||
        d.whatToDo.isNotEmpty;
    if (!hasContent) return const SizedBox.shrink();
    return AlpCard(
      padding: const EdgeInsets.all(16),
      borderColor: AlpColors.colorAi.withValues(alpha: 0.3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.auto_awesome,
                  color: AlpColors.colorAi, size: 20),
              SizedBox(width: 8),
              Text('Insights snapshot',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700)),
              Spacer(),
              AlpPill(label: '◈ AI', color: AlpColors.colorAi),
            ],
          ),
          if (d.myState.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text('My state',
                style: TextStyle(
                    color: AlpColors.textMuted,
                    fontSize: 10,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            ...d.myState.map(_bullet),
          ],
          if (d.whatThisMeans.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text('What this means',
                style: TextStyle(
                    color: AlpColors.textMuted,
                    fontSize: 10,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            ...d.whatThisMeans.map(_bullet),
          ],
          if (d.whatToDo.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text('What to do',
                style: TextStyle(
                    color: AlpColors.textMuted,
                    fontSize: 10,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            ...d.whatToDo.map(_bullet),
          ],
        ],
      ),
    );
  }

  Widget _bullet(String s) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 6, right: 6),
            child: Icon(Icons.circle,
                color: AlpColors.colorAi, size: 4),
          ),
          Expanded(
            child: Text(
              s,
              style: const TextStyle(
                  color: AlpColors.textSecondary,
                  fontSize: 12,
                  height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Time-by-section bar chart ─────────────────────────────────────

class TimeBySectionCard extends StatefulWidget {
  const TimeBySectionCard({super.key, required this.auth});
  final AuthClient auth;

  @override
  State<TimeBySectionCard> createState() => _TimeBySectionCardState();
}

class _TimeBySectionCardState extends State<TimeBySectionCard> {
  List<TimeStatRow>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = widget.auth.user;
    if (user == null) return;
    try {
      final list = await AnalyticsClient(widget.auth).timeStats(user.id);
      if (!mounted) return;
      setState(() {
        _data = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = _data;
    if (_loading || list == null || list.isEmpty) {
      return const SizedBox.shrink();
    }
    final shown = list.take(8).toList();
    final maxMs = shown.fold<int>(0, (m, r) => r.totalTimeMs > m ? r.totalTimeMs : m);
    return AlpCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.timer_outlined,
                  color: AlpColors.colorPurple, size: 20),
              SizedBox(width: 8),
              Text('Time per section',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Cumulative minutes spent on each section across all submitted sessions.',
            style: TextStyle(
                color: AlpColors.textMuted, fontSize: 11, height: 1.4),
          ),
          const SizedBox(height: 12),
          ...shown.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    SizedBox(
                      width: 80,
                      child: Text(
                        r.sectionId.length > 12
                            ? r.sectionId.substring(0, 8)
                            : r.sectionId,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: AlpColors.textMuted, fontSize: 11),
                      ),
                    ),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: maxMs == 0 ? 0 : r.totalTimeMs / maxMs,
                          minHeight: 5,
                          backgroundColor: AlpColors.bgSurface3,
                          valueColor: const AlwaysStoppedAnimation(
                              AlpColors.colorPurple),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 50,
                      child: Text(
                        _formatMinutes(r.totalTimeMs),
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                            color: AlpColors.textSecondary,
                            fontSize: 11,
                            fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  String _formatMinutes(int ms) {
    final m = ms ~/ 60000;
    if (m == 0) return '<1m';
    if (m < 60) return '${m}m';
    final h = m ~/ 60;
    final rem = m % 60;
    return rem == 0 ? '${h}h' : '${h}h${rem}m';
  }
}
