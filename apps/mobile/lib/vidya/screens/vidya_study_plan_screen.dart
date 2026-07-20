// VidyaStudyPlanScreen — Phase C4. Native study-plan view (mirrors web's
// StudyPlan): the AI-generated weekly plan grouped by day, with each
// session's kind / topic / minutes / questions and completion status, plus
// generate (when absent) and regenerate actions. Replaces the orphaned
// Aurora StudyPlanScreen, reusing the design-agnostic StudyPlanClient.
//
// The full constrained move/swap/rest editor (StudyPlanClient.edit) is a
// later enhancement; regenerate covers the common "rebuild my plan" case.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';
import '../../study_plan/study_plan_client.dart';

class VidyaStudyPlanScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaStudyPlanScreen({super.key, required this.auth});

  @override
  State<VidyaStudyPlanScreen> createState() => _VidyaStudyPlanScreenState();
}

enum _State { loading, plan, absent, error }

class _VidyaStudyPlanScreenState extends State<VidyaStudyPlanScreen> {
  late final StudyPlanClient _client = StudyPlanClient(auth: widget.auth);
  _State _state = _State.loading;
  StudyPlan? _plan;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    try {
      final r = await _client.fetchActive();
      if (!mounted) return;
      setState(() {
        if (r is PlanFound) {
          _plan = r.plan;
          _state = _State.plan;
        } else {
          _state = _State.absent;
        }
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  Future<void> _generate() async {
    setState(() => _busy = true);
    try {
      final goal = _plan?.dailyMinutesGoal ?? 30;
      final plan = await _client.generate(dailyMinutesGoal: goal);
      if (!mounted) return;
      setState(() {
        _plan = plan;
        _state = _State.plan;
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't generate a plan. Try again.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Study plan',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          if (_state == _State.plan)
            TextButton(
              onPressed: _busy ? null : _generate,
              child: Text(
                _busy ? '…' : 'Regenerate',
                style: TextStyle(color: v.accent),
              ),
            ),
        ],
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.absent => _AbsentState(busy: _busy, onGenerate: _generate, v: v),
        _State.plan => _PlanView(plan: _plan!),
      },
    );
  }
}

String _kindLabel(String kind) {
  switch (kind.toLowerCase()) {
    case 'practice':
      return 'Practice';
    case 'revision':
    case 'revise':
      return 'Revision';
    case 'mock':
    case 'mock_blueprint':
      return 'Mock test';
    case 'reading':
    case 'read':
      return 'Reading';
    case 'rest':
      return 'Rest';
    default:
      final l = kind.toLowerCase().replaceAll('_', ' ');
      return l.isEmpty ? 'Session' : '${l[0].toUpperCase()}${l.substring(1)}';
  }
}

class _PlanView extends StatelessWidget {
  final StudyPlan plan;
  const _PlanView({required this.plan});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    // Group sessions by day, preserving in-day position order.
    final byDay = <int, List<PlanSession>>{};
    for (final s in plan.sessions) {
      (byDay[s.dayOffset] ??= []).add(s);
    }
    for (final list in byDay.values) {
      list.sort((a, b) => a.position.compareTo(b.position));
    }
    final days = byDay.keys.toList()..sort();
    final totalMin = plan.sessions
        .where((s) => s.kind.toLowerCase() != 'rest')
        .fold<int>(0, (a, s) => a + s.expectedMinutes);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        VidyaCard(
          tone: VidyaCardTone.accent,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'THIS WEEK',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 11,
                    color: v.ink3,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${plan.dailyMinutesGoal} min/day goal · '
                  '~${(totalMin / 60).toStringAsFixed(1)}h planned',
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 14,
                    color: v.ink2,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        for (final day in days) ...[
          Text(
            'DAY ${day + 1}',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 11,
              color: v.ink3,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 10),
          for (final s in byDay[day]!) ...[
            _SessionRow(session: s),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _SessionRow extends StatelessWidget {
  final PlanSession session;
  const _SessionRow({required this.session});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final done = session.status.toLowerCase() == 'completed';
    final isRest = session.kind.toLowerCase() == 'rest';
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(
              done
                  ? Icons.check_circle
                  : isRest
                      ? Icons.bedtime_outlined
                      : Icons.radio_button_unchecked,
              size: 22,
              color: done ? v.good : v.ink3,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _kindLabel(session.kind),
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: done ? v.ink3 : v.ink,
                      decoration: done ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  if (!isRest) ...[
                    const SizedBox(height: 2),
                    Text(
                      '${session.expectedMinutes} min · '
                      '${session.expectedQuestions} Qs'
                      '${session.isRequired ? ' · required' : ''}',
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 11,
                        color: v.ink3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (session.slot.isNotEmpty)
              Text(
                session.slot,
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

class _AbsentState extends StatelessWidget {
  final bool busy;
  final VoidCallback onGenerate;
  final VidyaThemeData v;
  const _AbsentState({
    required this.busy,
    required this.onGenerate,
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
            Icon(Icons.event_note_outlined, size: 48, color: v.accent),
            const SizedBox(height: 16),
            Text(
              'No study plan yet',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: v.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Generate an AI plan that fits your daily goal and target date.',
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
              label: busy ? 'Generating…' : 'Generate my plan',
              onPressed: busy ? null : onGenerate,
              size: VidyaButtonSize.lg,
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
              "We couldn't load your study plan.",
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
