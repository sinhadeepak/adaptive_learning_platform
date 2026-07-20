// VidyaAnalysisScreen — Phase C. Native multi-dimensional mastery analysis
// (mirrors web's Analysis). Renders the per-dimension fluency breakdown
// (recall / apply / analyze / speed / …) + weakest concepts + calibration,
// from the real /analytics/student/{id}/multi-profile substrate. Replaces
// the Aurora ProgressTab "My Analysis" deep-dive.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/analytics.dart';
import '../../auth/auth_client.dart';

class VidyaAnalysisScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaAnalysisScreen({super.key, required this.auth});

  @override
  State<VidyaAnalysisScreen> createState() => _VidyaAnalysisScreenState();
}

enum _State { loading, loaded, empty, error }

class _VidyaAnalysisScreenState extends State<VidyaAnalysisScreen> {
  _State _state = _State.loading;
  MultiProfile? _profile;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _State.empty);
      return;
    }
    try {
      final p = await AnalyticsClient(widget.auth).multiProfile(user.id);
      if (!mounted) return;
      final empty = p == null || (p.fluency.isEmpty && p.concepts.isEmpty);
      setState(() {
        _profile = p;
        _state = empty ? _State.empty : _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'My analysis',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.empty => _EmptyState(v: v),
        _State.loaded => _LoadedView(profile: _profile!),
      },
    );
  }
}

Color _scoreColor(double s, VidyaThemeData v) {
  if (s >= 0.70) return v.good;
  if (s >= 0.40) return v.info;
  if (s > 0) return v.warn;
  return v.ink3;
}

String _prettyDimension(String d) {
  if (d.isEmpty) return 'Unknown';
  final spaced = d.replaceAll('_', ' ').replaceAll('-', ' ');
  return spaced
      .split(' ')
      .where((w) => w.isNotEmpty)
      .map((w) => w[0].toUpperCase() + w.substring(1))
      .join(' ');
}

class _LoadedView extends StatelessWidget {
  final MultiProfile profile;
  const _LoadedView({required this.profile});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final weakest = [...profile.concepts]
      ..sort((a, b) => a.ewa.compareTo(b.ewa));
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        if (profile.confidenceBrier != null) ...[
          _CalibrationCard(brier: profile.confidenceBrier!),
          const SizedBox(height: 20),
        ],
        if (profile.fluency.isNotEmpty) ...[
          Text(
            'DIMENSION FLUENCY',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 11,
              color: v.ink3,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          VidyaCard(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  for (var i = 0; i < profile.fluency.length; i++) ...[
                    if (i > 0) const SizedBox(height: 14),
                    _DimensionBar(row: profile.fluency[i]),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
        ],
        if (weakest.isNotEmpty) ...[
          Text(
            'WEAKEST CONCEPTS',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 11,
              color: v.ink3,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          for (final c in weakest.take(6)) ...[
            _ConceptRow(concept: c),
            const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }
}

class _DimensionBar extends StatelessWidget {
  final FluencyRow row;
  const _DimensionBar({required this.row});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final tone = _scoreColor(row.score, v);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                _prettyDimension(row.dimension),
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: v.ink,
                ),
              ),
            ),
            Text(
              '${(row.score * 100).round()}%',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 12,
                color: v.ink3,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: row.score.clamp(0.0, 1.0),
            minHeight: 6,
            backgroundColor: v.ink3.withValues(alpha: 0.14),
            valueColor: AlwaysStoppedAnimation<Color>(tone),
          ),
        ),
      ],
    );
  }
}

class _ConceptRow extends StatelessWidget {
  final ConceptMastery concept;
  const _ConceptRow({required this.concept});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final tone = _scoreColor(concept.ewa, v);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                concept.conceptId,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 14,
                  color: v.ink,
                ),
              ),
            ),
            Text(
              '${(concept.ewa * 100).round()}% · n=${concept.n}',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CalibrationCard extends StatelessWidget {
  final double brier;
  const _CalibrationCard({required this.brier});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    // Lower Brier = better calibration. <0.15 great, <0.25 ok, else loose.
    final (label, tone) = brier < 0.15
        ? ('Well calibrated', v.good)
        : brier < 0.25
            ? ('Fairly calibrated', v.info)
            : ('Over/under-confident', v.warn);
    return VidyaCard(
      tone: VidyaCardTone.accent,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'CONFIDENCE CALIBRATION',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.4,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  brier.toStringAsFixed(2),
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 32,
                    fontWeight: FontWeight.w600,
                    color: v.ink,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  label,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: tone,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Brier score — lower means your confidence matches your '
              'accuracy.',
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 12,
                color: v.ink2,
                height: 1.35,
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
        child: Text(
          'Not enough data yet — practise a few sessions and your dimension '
          'breakdown will appear here.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 15,
            color: v.ink2,
            height: 1.4,
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
              "We couldn't load your analysis.",
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
