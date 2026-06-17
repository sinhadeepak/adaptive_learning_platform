// VidyaGuestScreeningResultScreen — reveal + sign-up gate for guest funnel.
// Calls reveal(token) on init. Renders a dark hero card with the
// mobile-computed readiness number (score_pct → 0-900 scale),
// a 12-week projection, and a sign-up gate. On Sign up free,
// emits the guest token via onSignUp(token) so the parent state
// machine can plumb it through register → verify → claim.
//
// The projection formula is intentionally simple and mobile-side;
// backend integration with a real projection endpoint is queued for
// a later phase per the roadmap.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../screening_client.dart';

class VidyaGuestScreeningResultScreen extends StatefulWidget {
  final ScreeningClient client;
  final String token;
  final void Function(String token) onSignUp;
  final VoidCallback onSignIn;

  const VidyaGuestScreeningResultScreen({
    super.key,
    required this.client,
    required this.token,
    required this.onSignUp,
    required this.onSignIn,
  });

  @override
  State<VidyaGuestScreeningResultScreen> createState() =>
      _VidyaGuestScreeningResultScreenState();
}

class _VidyaGuestScreeningResultScreenState
    extends State<VidyaGuestScreeningResultScreen> {
  ScreeningReveal? _reveal;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await widget.client.reveal(widget.token);
      if (mounted) setState(() => _reveal = r);
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't load your result. Try again later.");
      }
    }
  }

  // Readiness score on the 0-900 scale, derived from score_pct.
  // 0%  → 100, 100% → 1000 clamped at 900. Mobile-side only.
  int _readiness(double scorePct) {
    final raw = (scorePct * 9 + 100).round();
    return raw.clamp(0, 900);
  }

  // 12-week projected readiness — narrows ~half of the remaining gap.
  int _projected(int current) {
    final gap = 900 - current;
    return (current + (gap * 0.55)).round().clamp(0, 900);
  }

  // Rough rank approximation: lower readiness → higher rank number.
  int _projectedRank(int projected) {
    final pct = projected / 900;
    // 10,000 → 100 over 0 → 900 range, log-ish curve.
    return (10000 - (pct * 9900)).round();
  }

  // Weak topics: those with accuracy < 0.5. The 22 in the slide is an
  // illustrative number; we surface the actual count from the breakdown.
  int _weakCount(List<TopicBreakdown> tb) {
    return tb.where((t) {
      if (t.total == 0) return false;
      return (t.correct / t.total) < 0.5;
    }).length;
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    if (_error != null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
          ),
        ),
      );
    }

    if (_reveal == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final r = _reveal!;
    final current = _readiness(r.scorePct);
    final projected = _projected(current);
    final projectedRank = _projectedRank(projected);
    final weakCount = _weakCount(r.topicBreakdown);
    final percentile = r.scorePct.round();

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.close, color: v.ink),
          onPressed: widget.onSignIn,
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
            child: Text(
              'SCREENING COMPLETE',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.6,
                color: v.ink3,
              ),
            ),
          ),
        ],
      ),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),
                  // Dark hero card with current readiness + projection
                  VidyaCard(
                    tone: VidyaCardTone.dark,
                    padding: EdgeInsets.zero,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'YOUR READINESS TODAY',
                            style: TextStyle(
                              fontFamily: VidyaFonts.mono,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.8,
                              color: const Color(0xFFB5B0A4),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                '$current',
                                style: const TextStyle(
                                  fontFamily: VidyaFonts.display,
                                  fontSize: 64,
                                  fontWeight: FontWeight.w500,
                                  color: Color(0xFFF1EEE7),
                                  height: 1,
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Padding(
                                padding: EdgeInsets.only(bottom: 8),
                                child: Text(
                                  '/ 900',
                                  style: TextStyle(
                                    fontFamily: VidyaFonts.mono,
                                    fontSize: 14,
                                    color: Color(0xFFB5B0A4),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _DarkChip(text: '${percentile}th %ile'),
                              _DarkChip(text: 'θ = ${_thetaLabel(r.scorePct)}'),
                            ],
                          ),
                          const SizedBox(height: 18),
                          Container(
                            height: 1,
                            color: const Color(0xFF2D3441),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            'WITH VIDYA, IN 12 WEEKS',
                            style: TextStyle(
                              fontFamily: VidyaFonts.mono,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.8,
                              color: const Color(0xFFB5B0A4),
                            ),
                          ),
                          const SizedBox(height: 6),
                          RichText(
                            text: TextSpan(
                              children: [
                                TextSpan(
                                  text: '≈ $projected',
                                  style: const TextStyle(
                                    fontFamily: VidyaFonts.display,
                                    fontSize: 28,
                                    fontWeight: FontWeight.w500,
                                    color: Color(0xFFE4A748),
                                  ),
                                ),
                                TextSpan(
                                  text: '  (rank ~ ${_formatRank(projectedRank)})',
                                  style: const TextStyle(
                                    fontFamily: VidyaFonts.mono,
                                    fontSize: 13,
                                    color: Color(0xFFB5B0A4),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Subject mastery bars (derived from topic_breakdown)
                  for (final t in r.topicBreakdown) ...[
                    _SubjectBar(topic: t),
                    const SizedBox(height: 8),
                  ],
                  const SizedBox(height: 16),
                  // Sign-up gate
                  VidyaCard(
                    tone: VidyaCardTone.muted,
                    padding: EdgeInsets.zero,
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '🔒 UNLOCK YOUR FULL REPORT',
                            style: TextStyle(
                              fontFamily: VidyaFonts.mono,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.5,
                              color: v.ink3,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            weakCount > 0
                                ? '$weakCount weak topics identified. Sign up to see them all.'
                                : 'Sign up to see your topic-by-topic breakdown.',
                            style: TextStyle(
                              fontFamily: VidyaFonts.ui,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: v.ink,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Plus your custom daily plan, mock tests, and '
                            'expert doubt-resolution.',
                            style: TextStyle(
                              fontFamily: VidyaFonts.ui,
                              fontSize: 12,
                              color: v.ink3,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  const SizedBox(height: 16),
                  VidyaButton(
                    key: const Key('vidya.guest.result.signup'),
                    label: 'Sign up free →',
                    onPressed: () => widget.onSignUp(widget.token),
                    style: VidyaButtonStyle.primary,
                    size: VidyaButtonSize.lg,
                    fullWidth: true,
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      key: const Key('vidya.guest.result.signin'),
                      onPressed: widget.onSignIn,
                      child: const Text('I already have an account'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }

  String _thetaLabel(double scorePct) {
    final seed = (scorePct / 100).clamp(0.0, 1.0).toDouble();
    final theta = ((seed - 0.5) * 3.0).clamp(-1.5, 1.5).toDouble();
    final sign = theta >= 0 ? '+' : '';
    return '$sign${theta.toStringAsFixed(2)}';
  }

  String _formatRank(int rank) {
    if (rank >= 1000) {
      final thousands = (rank / 1000).floor();
      final hundreds = ((rank % 1000) / 100).floor();
      return hundreds == 0 ? '${thousands}K' : '$thousands,${hundreds}00';
    }
    return '$rank';
  }
}

class _DarkChip extends StatelessWidget {
  final String text;
  const _DarkChip({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF2D3441),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: Color(0xFFB5B0A4),
        ),
      ),
    );
  }
}

class _SubjectBar extends StatelessWidget {
  final TopicBreakdown topic;
  const _SubjectBar({required this.topic});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final pct = topic.total == 0 ? 0.0 : (topic.correct / topic.total);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: v.ink3.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              topic.topicId,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: v.ink,
              ),
            ),
          ),
          SizedBox(
            width: 120,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: pct,
                minHeight: 4,
                backgroundColor: v.ink3.withValues(alpha: 0.18),
                valueColor: AlwaysStoppedAnimation<Color>(v.accent),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            '${(pct * 100).round()}%',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: v.ink3,
            ),
          ),
        ],
      ),
    );
  }
}
