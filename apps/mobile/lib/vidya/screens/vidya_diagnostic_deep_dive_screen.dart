// VidyaDiagnosticDeepDiveScreen — Phase C2. Native readiness diagnostic
// (mirrors web's DiagnosticDeepDive): a readiness band hero (score vs
// target, days to exam), the band's recommended focus actions, and the
// weakest concepts to attack. Replaces the Aurora DiagnosticDeepDiveScreen.
// Data: /analytics/readiness-band/{id} + /analytics/concept-mastery/{id}.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/analytics.dart';
import '../../auth/auth_client.dart';
import '../../insights/insights_client.dart' show ReadinessBand;
import '../../readiness/readiness_client.dart';

class VidyaDiagnosticDeepDiveScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaDiagnosticDeepDiveScreen({super.key, required this.auth});

  @override
  State<VidyaDiagnosticDeepDiveScreen> createState() =>
      _VidyaDiagnosticDeepDiveScreenState();
}

enum _State { loading, loaded, error }

class _Data {
  final ReadinessBandResult band;
  final List<ConceptMastery> weakest;
  const _Data({required this.band, required this.weakest});
}

class _VidyaDiagnosticDeepDiveScreenState
    extends State<VidyaDiagnosticDeepDiveScreen> {
  _State _state = _State.loading;
  _Data? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _State.error);
      return;
    }
    try {
      final band =
          await ReadinessClient(auth: widget.auth).fetchReadinessBand(user.id);
      // Weakest concepts are supplementary; degrade to empty on failure.
      List<ConceptMastery> weakest;
      try {
        final list = await AnalyticsClient(widget.auth).conceptMastery(user.id);
        weakest = [...list]..sort((a, b) => a.ewa.compareTo(b.ewa));
      } catch (_) {
        weakest = const [];
      }
      if (!mounted) return;
      setState(() {
        _data = _Data(band: band, weakest: weakest.take(5).toList());
        _state = _State.loaded;
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
        title: 'Diagnostic deep-dive',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.loaded => _LoadedView(data: _data!),
      },
    );
  }
}

({String label, Color tone}) _bandDisplay(ReadinessBand b, VidyaThemeData v) =>
    switch (b) {
      ReadinessBand.approaching => (label: 'Approaching target', tone: v.good),
      ReadinessBand.onTrack => (label: 'On track', tone: v.info),
      ReadinessBand.behind => (label: 'Behind pace', tone: v.warn),
      ReadinessBand.atRisk => (label: 'At risk', tone: v.bad),
    };

class _LoadedView extends StatelessWidget {
  final _Data data;
  const _LoadedView({required this.data});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final band = data.band;
    final disp = _bandDisplay(band.band, v);
    final score = (band.readinessScore * 900).round();
    final target = (band.targetScore * 900).round();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        VidyaCard(
          tone: VidyaCardTone.accent,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'READINESS',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 11,
                    color: v.ink3,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      '$score',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 48,
                        fontWeight: FontWeight.w600,
                        color: v.ink,
                        height: 1,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'target $target',
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 13,
                        color: v.ink3,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _Pill(label: disp.label, tone: disp.tone),
                    if (band.daysToExam > 0)
                      _Pill(
                        label: '${band.daysToExam} days to exam',
                        tone: v.ink3,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        if (band.actions.isNotEmpty) ...[
          Text(
            'FOCUS ZONES',
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
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < band.actions.length; i++) ...[
                    if (i > 0) const SizedBox(height: 10),
                    _ActionRow(text: band.actions[i]),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
        ],
        if (data.weakest.isNotEmpty) ...[
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
          for (final c in data.weakest) ...[
            _WeakRow(concept: c),
            const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color tone;
  const _Pill({required this.label, required this.tone});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: VidyaFonts.ui,
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: tone,
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final String text;
  const _ActionRow({required this.text});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.arrow_right_alt, size: 20, color: v.accent),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontSize: 14,
              color: v.ink,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _WeakRow extends StatelessWidget {
  final ConceptMastery concept;
  const _WeakRow({required this.concept});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final tone = concept.ewa >= 0.40 ? v.warn : v.bad;
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
              '${(concept.ewa * 100).round()}%',
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
              "We couldn't load your diagnostic.",
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
