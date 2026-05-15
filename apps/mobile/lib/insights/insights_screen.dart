// Insights — Phase 6 S52 mobile parity.
//
// Mirrors apps/web-student/src/pages/Insights.tsx. 3-zone IA over
// Phase-5 analytics surfaces:
//   1. My State          — readiness band + concept mastery + decay
//   2. What This Means   — weak concepts + decay alerts
//   3. What To Do        — mission pending + revision due + plan preview

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/widgets/widgets.dart';
import 'insights_client.dart';

class InsightsScreen extends StatefulWidget {
  const InsightsScreen({
    super.key,
    required this.client,
    required this.userId,
  });

  final InsightsClient client;
  final String userId;

  @override
  State<InsightsScreen> createState() => _InsightsScreenState();
}

class _InsightsScreenState extends State<InsightsScreen> {
  InsightsSnapshot? _snap;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await widget.client.fetchSnapshot(widget.userId);
      if (mounted) setState(() => _snap = s);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    if (_error != null) {
      return AuroraScaffold(
        appBar: const AuroraAppBar(title: 'Insights'),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: AuroraBanner(
            title: 'Insights unavailable',
            body: _error,
            tone: AuroraBannerTone.danger,
          ),
        ),
      );
    }

    if (_snap == null) {
      return const AuroraScaffold(
        appBar: AuroraAppBar(title: 'Insights'),
        body: Center(child: AuroraSpinner(size: 32)),
      );
    }

    final snap = _snap!;
    return AuroraScaffold(
      appBar: const AuroraAppBar(title: 'Insights'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'A single read of where you are, what it means, and what to do next. '
            'Every tile links to the underlying signal — nothing is hidden.',
            style: typography.body.copyWith(color: colors.neutral700),
          ),
          const SizedBox(height: 16),

          // ── Zone 1 — My State ───────────────────────────────────
          _ZoneHeader(
            title: 'My state',
            sub:
                'Where you are right now — readiness band, fresh mastery, and the concepts that are starting to fade.',
          ),
          _ReadinessTile(readiness: snap.readiness),
          _ConceptMasteryTile(rows: snap.conceptMastery),
          _DecayTile(rows: snap.topicDecay),
          const SizedBox(height: 16),

          // ── Zone 2 — What This Means ────────────────────────────
          _ZoneHeader(
            title: 'What this means',
            sub:
                'The pattern in your data — weak concepts the engine can act on and decay alerts that need a recovery round.',
          ),
          _WeakConceptsTile(rows: snap.weakConcepts),
          _DecayAlertsTile(rows: snap.decayAlerts),
          const SizedBox(height: 16),

          // ── Zone 3 — What To Do ─────────────────────────────────
          _ZoneHeader(
            title: 'What to do',
            sub:
                "Today's scaffolded path — mission, revision, and the week's plan.",
          ),
          _MissionTile(pending: snap.missionsTodayPending),
          _RevisionTile(dueToday: snap.revisionDueToday),
        ],
      ),
    );
  }
}

// ─── Reusable zone heading + tile shell ──────────────────────────────

class _ZoneHeader extends StatelessWidget {
  const _ZoneHeader({required this.title, required this.sub});
  final String title;
  final String sub;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: typography.h3
                  .copyWith(color: colors.neutral900),),
          const SizedBox(height: 4),
          Text(sub,
              style: typography.bodySm
                  .copyWith(color: colors.neutral600),),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.eyebrow,
    required this.title,
    required this.child,
  });

  final String eyebrow;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AuroraCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(eyebrow.toUpperCase(),
                style: typography.overline.copyWith(
                  color: colors.aurora500,
                  letterSpacing: 0.5,
                ),),
            const SizedBox(height: 4),
            Text(title,
                style: typography.h4
                    .copyWith(color: colors.neutral900),),
            const SizedBox(height: 8),
            child,
          ],
        ),
      ),
    );
  }
}

// ─── Zone 1 tiles ───────────────────────────────────────────────────

class _ReadinessTile extends StatelessWidget {
  const _ReadinessTile({required this.readiness});
  final ReadinessSummary? readiness;

  @override
  Widget build(BuildContext context) {
    final r = readiness;
    return _Tile(
      eyebrow: 'Readiness',
      title: r == null ? 'Building signal' : readinessBandLabel(r.band),
      child: Row(
        children: [
          Text(
            r != null ? '${(r.score * 100).round()}%' : '—',
            style: Theme.of(context)
                .extension<AuroraTypography>()!
                .h2,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Composite mastery across your active topics. Bands account for time-to-exam.',
              style: Theme.of(context)
                  .extension<AuroraTypography>()!
                  .bodySm
                  .copyWith(
                    color: Theme.of(context)
                        .extension<AuroraColors>()!
                        .neutral600,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConceptMasteryTile extends StatelessWidget {
  const _ConceptMasteryTile({required this.rows});
  final List<ConceptRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return _Tile(
        eyebrow: 'Mastery',
        title: 'Not enough data yet',
        child: Text(
          'Take a few rounds and the engine will start mapping which concepts are sticky.',
          style: Theme.of(context)
              .extension<AuroraTypography>()!
              .bodySm
              .copyWith(
                color: Theme.of(context)
                    .extension<AuroraColors>()!
                    .neutral600,
              ),
        ),
      );
    }
    return _Tile(
      eyebrow: 'Mastery',
      title:
          '${rows.length} active concept${rows.length == 1 ? '' : 's'}',
      child: Column(
        children: rows
            .take(5)
            .map((r) => _conceptListRow(context, r))
            .toList(),
      ),
    );
  }
}

class _DecayTile extends StatelessWidget {
  const _DecayTile({required this.rows});
  final List<ConceptRow> rows;

  @override
  Widget build(BuildContext context) {
    final critical = rows
        .where((r) => r.decaySeverity == DecaySeverity.critical)
        .length;
    return _Tile(
      eyebrow: 'Decay',
      title: rows.isEmpty
          ? 'Nothing is fading'
          : '${rows.length} fading${critical > 0 ? " · $critical critical" : ""}',
      child: rows.isEmpty
          ? Text(
              "Recent practice has kept everything fresh.",
              style: Theme.of(context)
                  .extension<AuroraTypography>()!
                  .bodySm,
            )
          : Column(
              children: rows
                  .take(5)
                  .map((r) => _decayListRow(context, r))
                  .toList(),
            ),
    );
  }
}

// ─── Zone 2 tiles ───────────────────────────────────────────────────

class _WeakConceptsTile extends StatelessWidget {
  const _WeakConceptsTile({required this.rows});
  final List<ConceptRow> rows;

  @override
  Widget build(BuildContext context) {
    return _Tile(
      eyebrow: 'Weakness',
      title: rows.isEmpty
          ? 'No persistent weak points'
          : '${rows.length} weak concept${rows.length == 1 ? '' : 's'}',
      child: rows.isEmpty
          ? Text(
              'A weak concept is one where EWA dropped below 40% after at least two attempts.',
              style: Theme.of(context)
                  .extension<AuroraTypography>()!
                  .bodySm,
            )
          : Column(
              children: rows
                  .take(4)
                  .map((r) => _conceptListRow(context, r))
                  .toList(),
            ),
    );
  }
}

class _DecayAlertsTile extends StatelessWidget {
  const _DecayAlertsTile({required this.rows});
  final List<ConceptRow> rows;

  @override
  Widget build(BuildContext context) {
    return _Tile(
      eyebrow: 'Alert',
      title: rows.isEmpty
          ? 'No decay alerts'
          : '${rows.length} concept${rows.length == 1 ? '' : 's'} to refresh',
      child: rows.isEmpty
          ? Text(
              "Decay alerts fire when a concept hasn't been practiced for long enough that retention is expected to slip.",
              style: Theme.of(context)
                  .extension<AuroraTypography>()!
                  .bodySm,
            )
          : Column(
              children: rows
                  .take(4)
                  .map((r) => _decayListRow(context, r))
                  .toList(),
            ),
    );
  }
}

// ─── Zone 3 tiles ───────────────────────────────────────────────────

class _MissionTile extends StatelessWidget {
  const _MissionTile({required this.pending});
  final bool pending;

  @override
  Widget build(BuildContext context) {
    return _Tile(
      eyebrow: 'Mission',
      title: pending ? 'Mission ready' : 'No mission queued',
      child: Text(
        "Today's concept-grain mission is picked by the engine to maximise mastery delta in 15-20 minutes.",
        style: Theme.of(context).extension<AuroraTypography>()!.bodySm,
      ),
    );
  }
}

class _RevisionTile extends StatelessWidget {
  const _RevisionTile({required this.dueToday});
  final int dueToday;

  @override
  Widget build(BuildContext context) {
    return _Tile(
      eyebrow: 'Revision',
      title: dueToday > 0
          ? '$dueToday concept${dueToday == 1 ? '' : 's'} due today'
          : 'Nothing due today',
      child: Text(
        'SM-2 + EWA-clamp scheduling. Five-question recall rounds restore retention.',
        style: Theme.of(context).extension<AuroraTypography>()!.bodySm,
      ),
    );
  }
}

// ─── List-row helpers ───────────────────────────────────────────────

Widget _conceptListRow(BuildContext ctx, ConceptRow r) {
  final colors = Theme.of(ctx).extension<AuroraColors>()!;
  final typography = Theme.of(ctx).extension<AuroraTypography>()!;
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      children: [
        Expanded(
          child: Text(
            r.conceptId.substring(0, r.conceptId.length.clamp(0, 8)),
            style: typography.bodySm.copyWith(
              fontFamily: 'monospace',
              color: colors.neutral600,
            ),
          ),
        ),
        Text(
          '${(r.ewa * 100).round()}%',
          style: typography.bodySm.copyWith(
            color: r.ewa < 0.4 ? colors.danger500 : colors.success600,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          'n=${r.n}',
          style: typography.overline.copyWith(color: colors.neutral500),
        ),
      ],
    ),
  );
}

Widget _decayListRow(BuildContext ctx, ConceptRow r) {
  final colors = Theme.of(ctx).extension<AuroraColors>()!;
  final typography = Theme.of(ctx).extension<AuroraTypography>()!;
  final tone = switch (r.decaySeverity) {
    DecaySeverity.critical => colors.danger600,
    DecaySeverity.stale => colors.developing600,
    DecaySeverity.aging => colors.neutral500,
    DecaySeverity.fresh => colors.success600,
  };
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      children: [
        Expanded(
          child: Text(
            r.conceptId.substring(0, r.conceptId.length.clamp(0, 8)),
            style: typography.bodySm.copyWith(
              fontFamily: 'monospace',
              color: colors.neutral600,
            ),
          ),
        ),
        Text(
          '${decaySeverityLabel(r.decaySeverity)} · ${r.decayDays}d',
          style: typography.overline
              .copyWith(color: tone, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}
