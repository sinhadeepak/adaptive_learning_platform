import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';
import '../screens/doubts_tab.dart';
import 'alp_card.dart';

// ────────────────────────────────────────────────────────────────────────
// Compact rank card — links to full Rank tab
// ────────────────────────────────────────────────────────────────────────

class HomeRankCompactCard extends StatefulWidget {
  const HomeRankCompactCard({
    super.key,
    required this.api,
    required this.auth,
    required this.onJumpToRank,
  });
  final ApiClient api;
  final AuthClient auth;
  final VoidCallback onJumpToRank;

  @override
  State<HomeRankCompactCard> createState() => _HomeRankCompactCardState();
}

class _HomeRankCompactCardState extends State<HomeRankCompactCard> {
  RankProjection? _projection;
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
      final p = await widget.api.rankProjection(user.id, 'NEET');
      if (!mounted) return;
      setState(() {
        _projection = p;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _fmt(int n) {
    final s = n.toString();
    if (s.length <= 3) return s;
    final tail = s.substring(s.length - 3);
    return '${s.substring(0, s.length - 3).replaceAllMapped(RegExp(r'(\d)(?=(\d\d)+$)'), (m) => '${m[1]},')},$tail';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _projection == null || _projection!.error != null) {
      return const SizedBox.shrink();
    }
    final p = _projection!;
    final confTone = p.confidence == 'high'
        ? AlpColors.colorGreen
        : p.confidence == 'medium'
            ? AlpColors.colorBlue
            : AlpColors.colorAmber;
    return AlpCard(
      onTap: widget.onJumpToRank,
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF1A1B3A), Color(0xFF24193A)],
      ),
      borderColor: AlpColors.colorPurple.withValues(alpha: 0.30),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'PROJECTED ${''} ALL-INDIA RANK',
                  style: TextStyle(
                    color: AlpColors.textMuted,
                    fontSize: 10,
                    letterSpacing: 0.7,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '~${_fmt(p.projectedRank)}',
                  style: const TextStyle(
                    color: AlpColors.colorPurple,
                    fontSize: 30,
                    fontWeight: FontWeight.w700,
                    height: 1,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${p.examName} · ${p.projectedPercentile.toStringAsFixed(1)} pctl',
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: confTone.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.circle, size: 6, color: confTone),
                    const SizedBox(width: 4),
                    Text(
                      p.confidence,
                      style: TextStyle(color: confTone, fontSize: 10, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              const Icon(Icons.chevron_right, color: AlpColors.textMuted),
            ],
          ),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Photo Doubt CTA — opens PhotoDoubtScreen
// ────────────────────────────────────────────────────────────────────────

class HomePhotoDoubtCard extends StatelessWidget {
  const HomePhotoDoubtCard({super.key, required this.api});
  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => PhotoDoubtScreen(api: api)),
      ),
      gradient: const LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [Color(0xFF4F87F6), Color(0xFF7B68EE)],
      ),
      borderColor: AlpColors.colorBlue,
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          const Icon(Icons.photo_camera_outlined, color: Colors.white, size: 26),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'Stuck on a problem? Snap it',
                  style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 2),
                Text(
                  'Photo OCR · solution · 3 similar problems',
                  style: TextStyle(color: Colors.white70, fontSize: 11),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: Colors.white),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Guided Next Steps card — 3 ranked actions
// ────────────────────────────────────────────────────────────────────────

class GuidedNextStepsCard extends StatefulWidget {
  const GuidedNextStepsCard({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<GuidedNextStepsCard> createState() => _GuidedNextStepsCardState();
}

class _GuidedNextStepsCardState extends State<GuidedNextStepsCard> {
  GuidedNextSteps? _data;
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
      final d = await widget.api.guidedNextSteps(user.id);
      if (!mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _runStep(GuidedStep step) async {
    final user = widget.auth.user;
    if (user == null || step.topicId.isEmpty) return;
    try {
      final client = QuizClient(auth: widget.auth);
      final session = await client.start(topicId: step.topicId, userId: user.id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: session.sessionId, api: widget.api),
      ));
      if (mounted) _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not start: $e')),
        );
      }
    }
  }

  static const _actionMeta = {
    'REVISE': (Icons.menu_book_outlined, AlpColors.colorBlue, 'Revise'),
    'PRACTICE': (Icons.bolt_rounded, AlpColors.colorGreen, 'Practice'),
    'DIAGNOSE': (Icons.troubleshoot, AlpColors.colorPurple, 'Diagnose'),
    'MOCK_SLICE': (Icons.timer_outlined, AlpColors.colorAmber, 'Mock slice'),
  };

  @override
  Widget build(BuildContext context) {
    if (_loading || _data == null || _data!.steps.isEmpty) {
      return const SizedBox.shrink();
    }
    final d = _data!;
    return AlpCard(
      padding: const EdgeInsets.all(16),
      borderColor: AlpColors.colorAi.withValues(alpha: 0.30),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  d.headline,
                  style: const TextStyle(
                    color: AlpColors.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              AlpPill(
                label: d.source == 'ai' ? '◈ AI' : '◈ Heuristic',
                color: d.source == 'ai' ? AlpColors.colorAi : AlpColors.textMuted,
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...d.steps.map((s) {
            final meta = _actionMeta[s.action] ?? (Icons.bolt_rounded, AlpColors.colorBlue, s.action);
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AlpCard(
                onTap: () => _runStep(s),
                padding: const EdgeInsets.all(12),
                borderColor: meta.$2.withValues(alpha: 0.30),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: meta.$2.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(meta.$1, color: meta.$2, size: 20),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                meta.$3.toUpperCase(),
                                style: TextStyle(
                                  color: meta.$2,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.6,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '~${s.estMinutes} min',
                                style: const TextStyle(color: AlpColors.textMuted, fontSize: 10),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            s.topicTitle,
                            style: const TextStyle(
                              color: AlpColors.textPrimary,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            s.why,
                            style: const TextStyle(color: AlpColors.textMuted, fontSize: 11, height: 1.4),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: AlpColors.textMuted, size: 18),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Cross-Topic Weakness Diagnosis card
// ────────────────────────────────────────────────────────────────────────

class WeaknessDiagnosisCard extends StatefulWidget {
  const WeaknessDiagnosisCard({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<WeaknessDiagnosisCard> createState() => _WeaknessDiagnosisCardState();
}

class _WeaknessDiagnosisCardState extends State<WeaknessDiagnosisCard> {
  WeaknessDiagnosis? _data;
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
      final d = await widget.api.weaknessDiagnosis(user.id);
      if (!mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  static const _sevTone = {
    'high': AlpColors.colorRed,
    'medium': AlpColors.colorAmber,
    'low': AlpColors.colorBlue,
  };

  @override
  Widget build(BuildContext context) {
    if (_loading || _data == null) return const SizedBox.shrink();
    final d = _data!;
    // Cold-start guard — don't pollute the dashboard with empty advice.
    if (d.nAttemptsAnalyzed == 0 && d.weakestTopics.isEmpty) {
      return const SizedBox.shrink();
    }

    return AlpCard(
      padding: const EdgeInsets.all(16),
      borderColor: AlpColors.colorAmber.withValues(alpha: 0.30),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Cross-topic weakness',
                  style: TextStyle(
                    color: AlpColors.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              AlpPill(
                label: d.source == 'ai' ? '◈ AI patterns' : '◈ Heuristic',
                color: d.source == 'ai' ? AlpColors.colorAi : AlpColors.textMuted,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            d.overallAssessment,
            style: const TextStyle(color: AlpColors.textMuted, fontSize: 12, height: 1.5),
          ),
          if (d.patterns.isNotEmpty) ...[
            const SizedBox(height: 12),
            ...d.patterns.map((p) {
              final tone = _sevTone[p.severity] ?? AlpColors.colorBlue;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AlpColors.bgSurface3,
                    borderRadius: BorderRadius.circular(8),
                    border: Border(left: BorderSide(color: tone, width: 3)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              p.name,
                              style: const TextStyle(
                                color: AlpColors.textPrimary,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          Text(
                            '${p.evidenceCount} wrong',
                            style: TextStyle(color: tone, fontSize: 10, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        p.description,
                        style: const TextStyle(color: AlpColors.textMuted, fontSize: 11, height: 1.4),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                        decoration: BoxDecoration(
                          color: AlpColors.colorGreen.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(6),
                          border: const Border(left: BorderSide(color: AlpColors.colorGreen, width: 2)),
                        ),
                        child: Row(
                          children: [
                            const Text(
                              'Next: ',
                              style: TextStyle(
                                color: AlpColors.colorGreen,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Expanded(
                              child: Text(
                                p.prescription,
                                style: const TextStyle(
                                  color: AlpColors.textSecondary,
                                  fontSize: 11,
                                  height: 1.4,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ] else if (d.weakestTopics.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AlpColors.bgSurface3,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                'Weakest topics by EWA: ${d.weakestTopics.take(3).join(" · ")}',
                style: const TextStyle(color: AlpColors.textMuted, fontSize: 11, height: 1.4),
              ),
            ),
          ],
          if (d.nAttemptsAnalyzed > 0) ...[
            const SizedBox(height: 8),
            Text(
              '📊 ${d.nAttemptsAnalyzed} items analysed · ${d.nWrong} wrong',
              style: const TextStyle(color: AlpColors.textFaint, fontSize: 10),
            ),
          ],
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Study Plan trigger card — opens the full plan in a bottom sheet
// ────────────────────────────────────────────────────────────────────────

class StudyPlanCard extends StatelessWidget {
  const StudyPlanCard({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  Future<void> _openSheet(BuildContext context) async {
    final user = auth.user;
    if (user == null) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AlpColors.bgSurface1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, scrollController) =>
            _StudyPlanSheet(api: api, auth: auth, scrollController: scrollController),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      onTap: () => _openSheet(context),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AlpColors.colorPurple.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.calendar_month, color: AlpColors.colorPurple, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  '7-day Study Plan',
                  style: TextStyle(
                    color: AlpColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'AI-personalised schedule + topic priorities',
                  style: TextStyle(color: AlpColors.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AlpColors.textMuted),
        ],
      ),
    );
  }
}

class _StudyPlanSheet extends StatefulWidget {
  const _StudyPlanSheet({
    required this.api,
    required this.auth,
    required this.scrollController,
  });
  final ApiClient api;
  final AuthClient auth;
  final ScrollController scrollController;

  @override
  State<_StudyPlanSheet> createState() => _StudyPlanSheetState();
}

class _StudyPlanSheetState extends State<_StudyPlanSheet> {
  StudyPlan? _plan;
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
      final p = await widget.api.studyPlan(user.id);
      if (!mounted) return;
      setState(() {
        _plan = p;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ListView(
        controller: widget.scrollController,
        children: [
          const SizedBox(height: 8),
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AlpColors.borderStrong,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 60),
              child: Center(child: CircularProgressIndicator(color: AlpColors.colorAi)),
            )
          else if (_plan == null)
            const Text('Could not load plan.', style: TextStyle(color: AlpColors.textMuted))
          else ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    _plan!.headline,
                    style: const TextStyle(
                      color: AlpColors.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                AlpPill(
                  label: _plan!.source == 'ai' ? '◈ AI' : '◈ Heuristic',
                  color: _plan!.source == 'ai' ? AlpColors.colorAi : AlpColors.textMuted,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              _plan!.diagnosis,
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 13, height: 1.5),
            ),
            const SizedBox(height: 18),
            const Text(
              'TOPIC PRIORITIES',
              style: TextStyle(
                color: AlpColors.textMuted,
                fontSize: 11,
                letterSpacing: 0.7,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            ..._plan!.priorities.map((p) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: AlpCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: AlpColors.colorPurple.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Center(
                            child: Text(
                              '${p.rank}',
                              style: const TextStyle(
                                color: AlpColors.colorPurple,
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                p.title,
                                style: const TextStyle(
                                  color: AlpColors.textPrimary,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                p.rationale,
                                style: const TextStyle(color: AlpColors.textMuted, fontSize: 11, height: 1.4),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          '→ ${(p.targetMastery * 100).round()}%',
                          style: const TextStyle(
                            color: AlpColors.colorGreen,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                )),
            const SizedBox(height: 14),
            const Text(
              'WEEKLY SCHEDULE',
              style: TextStyle(
                color: AlpColors.textMuted,
                fontSize: 11,
                letterSpacing: 0.7,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            ..._plan!.schedule.map((d) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: AlpCard(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: AlpColors.colorBlue.withValues(alpha: 0.18),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                d.day,
                                style: const TextStyle(
                                  color: AlpColors.colorBlue,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                d.focus,
                                style: const TextStyle(
                                  color: AlpColors.textPrimary,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (d.actions.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          ...d.actions.map((a) => Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  '• $a',
                                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 11, height: 1.4),
                                ),
                              )),
                        ],
                      ],
                    ),
                  ),
                )),
            if (_plan!.encouragement.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AlpColors.colorGreen.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: const Border(left: BorderSide(color: AlpColors.colorGreen, width: 2)),
                ),
                child: Text(
                  _plan!.encouragement,
                  style: const TextStyle(color: AlpColors.textSecondary, fontSize: 12, height: 1.5),
                ),
              ),
            ],
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }
}
