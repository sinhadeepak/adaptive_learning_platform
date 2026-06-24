// VidyaPortfolioScreen — Phase C4. Native study-allocation view (mirrors
// web's StudyPortfolio): current mastery-weighted share vs the optimal
// share per yield bucket (High / Medium / Low), with a reallocation hint
// and a recompute action. Data: /pce/{userId}/portfolio (PCE).
//
// Pushed outside the shell subtree → exam passed in as a param.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaPortfolioScreen extends StatefulWidget {
  final AuthClient auth;
  final String examId;
  const VidyaPortfolioScreen({
    super.key,
    required this.auth,
    required this.examId,
  });

  @override
  State<VidyaPortfolioScreen> createState() => _VidyaPortfolioScreenState();
}

enum _State { loading, loaded, empty, error }

class _VidyaPortfolioScreenState extends State<VidyaPortfolioScreen> {
  _State _state = _State.loading;
  Portfolio? _portfolio;
  bool _busy = false;

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
      final p =
          await ApiClient(widget.auth).portfolio(user.id, widget.examId);
      if (!mounted) return;
      setState(() {
        _portfolio = p;
        _state =
            (p == null || p.buckets.isEmpty) ? _State.empty : _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  Future<void> _recompute() async {
    final user = widget.auth.user;
    if (user == null) return;
    setState(() => _busy = true);
    await ApiClient(widget.auth).recomputePortfolio(user.id, widget.examId);
    if (!mounted) return;
    setState(() => _busy = false);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Study portfolio',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          TextButton(
            onPressed: _busy ? null : _recompute,
            child: Text(
              _busy ? '…' : 'Recompute',
              style: TextStyle(color: v.accent),
            ),
          ),
        ],
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.empty => _EmptyState(onRecompute: _recompute, busy: _busy, v: v),
        _State.loaded => _LoadedView(portfolio: _portfolio!),
      },
    );
  }
}

class _LoadedView extends StatelessWidget {
  final Portfolio portfolio;
  const _LoadedView({required this.portfolio});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        Text(
          'CURRENT vs OPTIMAL ALLOCATION',
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'How your effort is spread across high/medium/low-yield work '
          'versus the optimal mix.',
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 13,
            color: v.ink2,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 16),
        for (final b in portfolio.buckets) ...[
          _BucketCard(bucket: b),
          const SizedBox(height: 10),
        ],
        if (portfolio.reallocationHint.isNotEmpty) ...[
          const SizedBox(height: 8),
          VidyaCard(
            tone: VidyaCardTone.accent,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.tips_and_updates_outlined,
                      size: 20, color: v.accent),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      portfolio.reallocationHint,
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: v.ink,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _BucketCard extends StatelessWidget {
  final PortfolioBucket bucket;
  const _BucketCard({required this.bucket});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final under = bucket.delta > 0.01; // optimal > current → under-invested
    final deltaTone = under ? v.warn : v.good;
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
                    '${bucket.bucket}-yield',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                ),
                if (bucket.delta.abs() > 0.01)
                  Text(
                    'Δ ${bucket.delta > 0 ? '+' : ''}'
                    '${(bucket.delta * 100).toStringAsFixed(0)}%',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: deltaTone,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            _ShareBar(
              label: 'Current',
              value: bucket.currentShare,
              color: v.ink3,
            ),
            const SizedBox(height: 8),
            _ShareBar(
              label: 'Optimal',
              value: bucket.optimalShare,
              color: v.accent,
            ),
          ],
        ),
      ),
    );
  }
}

class _ShareBar extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  const _ShareBar({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Row(
      children: [
        SizedBox(
          width: 56,
          child: Text(
            label,
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 11,
              color: v.ink3,
            ),
          ),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: value.clamp(0.0, 1.0),
              minHeight: 8,
              backgroundColor: v.ink3.withValues(alpha: 0.14),
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 38,
          child: Text(
            '${(value * 100).round()}%',
            textAlign: TextAlign.right,
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 11,
              color: v.ink2,
            ),
          ),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onRecompute;
  final bool busy;
  final VidyaThemeData v;
  const _EmptyState({
    required this.onRecompute,
    required this.busy,
    required this.v,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'No allocation data yet',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: v.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Recompute to build your current-vs-optimal study allocation.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink2,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),
            VidyaButton(
              label: busy ? 'Computing…' : 'Recompute',
              onPressed: busy ? null : onRecompute,
              size: VidyaButtonSize.md,
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
              "We couldn't load your portfolio.",
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
