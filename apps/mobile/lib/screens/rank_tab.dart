import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../widgets/alp_card.dart';

/// Predicted AIR card with confidence band + AI commentary.
/// Mirrors docs/ui/02_MobileApp/20_more-leaderboard-experts.html (rank section).
class RankTab extends StatefulWidget {
  const RankTab({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<RankTab> createState() => _RankTabState();
}

class _RankTabState extends State<RankTab> {
  String _exam = 'NEET';
  RankProjection? _projection;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final user = widget.auth.user;
    if (user == null) return;
    setState(() => _loading = true);
    try {
      final p = await widget.api.rankProjection(user.id, _exam);
      if (!mounted) return;
      setState(() {
        _projection = p;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      backgroundColor: AlpColors.bgSurface2,
      color: AlpColors.colorAi,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          const Text(
            'Rank Trajectory 🏆',
            style: TextStyle(color: AlpColors.textPrimary, fontSize: 24, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          const Text(
            'Live AIR projection from your readiness',
            style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 16),

          // Exam picker chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final e in const [
                  ['NEET', 'NEET (UG)'],
                  ['JEE', 'JEE Main'],
                  ['UPSC', 'UPSC CSE'],
                  ['CBSE', 'CBSE 12'],
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () {
                        if (_exam != e[0]) {
                          setState(() => _exam = e[0]);
                          _refresh();
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: _exam == e[0]
                              ? AlpColors.colorPurple.withValues(alpha: 0.20)
                              : AlpColors.bgSurface2,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: _exam == e[0]
                                ? AlpColors.colorPurple
                                : AlpColors.borderDefault,
                          ),
                        ),
                        child: Text(
                          e[1],
                          style: TextStyle(
                            color: _exam == e[0] ? AlpColors.colorPurple : AlpColors.textMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          if (_loading)
            const Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator(color: AlpColors.colorAi)),
            )
          else if (_projection == null || _projection!.error != null)
            AlpCard(
              child: Text(
                _projection?.error == 'unsupported_exam'
                    ? 'No calibration data for this exam yet.'
                    : 'Could not load rank projection.',
                style: const TextStyle(color: AlpColors.textMuted, fontSize: 13),
              ),
            )
          else
            _RankHero(p: _projection!),
        ],
      ),
    );
  }
}

class _RankHero extends StatelessWidget {
  const _RankHero({required this.p});
  final RankProjection p;

  String _fmt(int n) {
    final s = n.toString();
    final buf = StringBuffer();
    var len = s.length;
    if (len <= 3) return s;
    buf.write(s.substring(0, len - 3));
    final tail = s.substring(len - 3);
    return '${buf.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d\d)+$)'), (m) => '${m[1]},')},$tail';
  }

  @override
  Widget build(BuildContext context) {
    final confTone = p.confidence == 'high'
        ? AlpColors.colorGreen
        : p.confidence == 'medium'
            ? AlpColors.colorBlue
            : AlpColors.colorAmber;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Hero rank card
        AlpCard(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1A1B3A), Color(0xFF24193A)],
          ),
          borderColor: AlpColors.colorPurple.withValues(alpha: 0.30),
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'PROJECTED ALL-INDIA RANK',
                style: TextStyle(
                  color: AlpColors.textMuted,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '~${_fmt(p.projectedRank)}',
                style: const TextStyle(
                  color: AlpColors.colorPurple,
                  fontSize: 44,
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'range ${_fmt(p.rankLow)} – ${_fmt(p.rankHigh)}',
                style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.circle, size: 8, color: confTone),
                  const SizedBox(width: 4),
                  Text(
                    '${p.confidence} confidence',
                    style: TextStyle(color: confTone, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '· ${p.projectedPercentile.toStringAsFixed(1)} pctl',
                    style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // Commentary card
        if (p.headline.isNotEmpty)
          AlpCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    AlpPill(
                      label: p.source == 'ai' ? '◈ AI commentary' : '◈ Heuristic',
                      color: p.source == 'ai' ? AlpColors.colorAi : AlpColors.textMuted,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  p.headline,
                  style: const TextStyle(
                    color: AlpColors.textPrimary,
                    fontSize: 14,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (p.nextAction.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AlpColors.colorGreen.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                      border: const Border(
                        left: BorderSide(color: AlpColors.colorGreen, width: 2),
                      ),
                    ),
                    child: RichText(
                      text: TextSpan(
                        children: [
                          const TextSpan(
                            text: 'Next move: ',
                            style: TextStyle(
                              color: AlpColors.colorGreen,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          TextSpan(
                            text: p.nextAction,
                            style: const TextStyle(
                              color: AlpColors.textSecondary,
                              fontSize: 12,
                              height: 1.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),

        const SizedBox(height: 12),

        // Stats row
        AlpCard(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Expanded(child: _miniStat('${(p.readiness * 100).round()}%', 'Readiness')),
              const VerticalDivider(color: AlpColors.borderDefault),
              Expanded(child: _miniStat('${p.nAttempts}', 'Attempts')),
              const VerticalDivider(color: AlpColors.borderDefault),
              Expanded(child: _miniStat(_fmt(p.totalCandidates), 'Pool')),
            ],
          ),
        ),
      ],
    );
  }

  Widget _miniStat(String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            color: AlpColors.textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(color: AlpColors.textMuted, fontSize: 10)),
      ],
    );
  }
}
