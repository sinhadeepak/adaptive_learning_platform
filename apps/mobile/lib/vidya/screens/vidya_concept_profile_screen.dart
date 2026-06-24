// VidyaConceptProfileScreen — Phase C2. Native per-concept mastery profile
// (mirrors web's ConceptProfile): the full concept-mastery vector
// (weakest-first) with EWA bars, sample size, and recency. Replaces the
// Aurora ConceptProfileScreen. Data: /analytics/concept-mastery/{id}.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/analytics.dart';
import '../../auth/auth_client.dart';

class VidyaConceptProfileScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaConceptProfileScreen({super.key, required this.auth});

  @override
  State<VidyaConceptProfileScreen> createState() =>
      _VidyaConceptProfileScreenState();
}

enum _State { loading, loaded, empty, error }

class _VidyaConceptProfileScreenState extends State<VidyaConceptProfileScreen> {
  _State _state = _State.loading;
  List<ConceptMastery> _concepts = const [];

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
      final list = await AnalyticsClient(widget.auth).conceptMastery(user.id);
      if (!mounted) return;
      final sorted = [...list]..sort((a, b) => a.ewa.compareTo(b.ewa));
      setState(() {
        _concepts = sorted;
        _state = sorted.isEmpty ? _State.empty : _State.loaded;
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
        title: 'Concept profile',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.empty => _EmptyState(v: v),
        _State.loaded => ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            children: [
              Text(
                '${_concepts.length} CONCEPTS · WEAKEST FIRST',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: v.ink3,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 12),
              for (final c in _concepts) ...[
                _ConceptCard(concept: c),
                const SizedBox(height: 8),
              ],
            ],
          ),
      },
    );
  }
}

Color _bucketColor(double ewa, VidyaThemeData v) {
  if (ewa >= 0.70) return v.good;
  if (ewa >= 0.40) return v.info;
  if (ewa > 0) return v.warn;
  return v.ink3;
}

class _ConceptCard extends StatelessWidget {
  final ConceptMastery concept;
  const _ConceptCard({required this.concept});

  String _recency() {
    final t = concept.lastSeenAt;
    if (t == null) return 'not seen';
    final d = DateTime.now().difference(t).inDays;
    if (d <= 0) return 'today';
    if (d == 1) return '1d ago';
    return '${d}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final tone = _bucketColor(concept.ewa, v);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    concept.conceptId,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                ),
                Text(
                  '${(concept.ewa * 100).round()}%',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: tone,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: concept.ewa.clamp(0.0, 1.0),
                minHeight: 5,
                backgroundColor: v.ink3.withValues(alpha: 0.14),
                valueColor: AlwaysStoppedAnimation<Color>(tone),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'n=${concept.n} · seen ${_recency()}',
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

class _EmptyState extends StatelessWidget {
  final VidyaThemeData v;
  const _EmptyState({required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'No concept data yet — practise a few sessions to build your '
          'profile.',
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
              "We couldn't load your concept profile.",
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
