// StudyPlan — constrained plan editor (Phase 6 S55 mobile parity).
//
// Mirrors apps/web-student/src/pages/StudyPlan.tsx.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/widgets/widgets.dart';
import 'study_plan_client.dart';

class StudyPlanScreen extends StatefulWidget {
  const StudyPlanScreen({super.key, required this.client});

  final StudyPlanClient client;

  @override
  State<StudyPlanScreen> createState() => _StudyPlanScreenState();
}

class _StudyPlanScreenState extends State<StudyPlanScreen> {
  StudyPlan? _plan;
  bool _loading = true;
  bool _absent = false;
  bool _busy = false;
  String? _error;
  String? _feedbackOk;
  String? _feedbackErr;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    try {
      final res = await widget.client.fetchActive();
      if (!mounted) return;
      if (res is PlanAbsent) {
        setState(() {
          _absent = true;
          _plan = null;
        });
      } else if (res is PlanFound) {
        setState(() {
          _absent = false;
          _plan = res.plan;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _generate() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final p = await widget.client.generate(dailyMinutesGoal: 45);
      if (!mounted) return;
      setState(() {
        _plan = p;
        _absent = false;
        _feedbackOk = 'Plan generated for this week.';
        _feedbackErr = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _applyEdit(EditKind kind, PlanSession session,
      {int? newMinutes,}) async {
    if (_plan == null || _busy) return;
    setState(() {
      _busy = true;
      _feedbackOk = null;
      _feedbackErr = null;
    });
    try {
      final res = await widget.client.edit(
        _plan!.id,
        EditPayload(
          kind: kind,
          sessionId: session.id,
          newMinutes: newMinutes,
        ),
      );
      if (!mounted) return;
      if (res.blocked) {
        setState(() => _feedbackErr =
            res.blockReason ?? 'Required sessions stay put.',);
      } else {
        setState(() => _feedbackOk =
            res.summary.isNotEmpty
                ? res.summary
                : '${editKindWire(kind)} applied.',);
        await _refresh();
      }
    } catch (e) {
      if (mounted) setState(() => _feedbackErr = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AuroraScaffold(
        appBar: AuroraAppBar(title: 'Study plan'),
        body: Center(child: AuroraSpinner(size: 32)),
      );
    }
    if (_error != null) {
      return AuroraScaffold(
        appBar: const AuroraAppBar(title: 'Study plan'),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: AuroraBanner(
            title: 'Plan unavailable',
            body: _error,
            tone: AuroraBannerTone.danger,
          ),
        ),
      );
    }
    if (_absent || _plan == null) return _empty();
    return _planView(_plan!);
  }

  Widget _empty() {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraScaffold(
      appBar: const AuroraAppBar(title: 'Study plan'),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('No active plan yet',
                style: typography.h2.copyWith(color: colors.neutral900),),
            const SizedBox(height: 8),
            Text(
              'The plan is a constrained, editable view of what to study this week. You can move, swap, shorten, or skip any non-required slot.',
              style: typography.body
                  .copyWith(color: colors.neutral700, height: 1.5),
            ),
            const SizedBox(height: 20),
            AuroraButton(
              label: _busy ? 'Generating…' : 'Generate a plan for this week',
              variant: AuroraButtonVariant.aurora,
              size: AuroraButtonSize.lg,
              loading: _busy,
              onPressed: _busy ? null : _generate,
            ),
          ],
        ),
      ),
    );
  }

  Widget _planView(StudyPlan plan) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final byDay = <int, List<PlanSession>>{};
    for (final s in plan.sessions) {
      (byDay[s.dayOffset] ??= []).add(s);
    }
    for (final list in byDay.values) {
      list.sort((a, b) => a.position.compareTo(b.position));
    }
    final days = byDay.keys.toList()..sort();

    return AuroraScaffold(
      appBar: const AuroraAppBar(title: 'Study plan'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Plan editor',
                        style: typography.h2
                            .copyWith(color: colors.neutral900),),
                    const SizedBox(height: 4),
                    Text(
                      'Week of ${plan.weekStart} · ${plan.dailyMinutesGoal}m/day target',
                      style: typography.bodySm
                          .copyWith(color: colors.neutral600),
                    ),
                  ],
                ),
              ),
              AuroraButton(
                label: _busy ? 'Working…' : 'Regenerate',
                variant: AuroraButtonVariant.tertiary,
                size: AuroraButtonSize.sm,
                onPressed: _busy || plan.sessions.isEmpty
                    ? null
                    : () => _applyEdit(EditKind.regenerate, plan.sessions.first),
              ),
            ],
          ),
          if (_feedbackOk != null) ...[
            const SizedBox(height: 12),
            AuroraBanner(
                title: _feedbackOk!, tone: AuroraBannerTone.info,),
          ],
          if (_feedbackErr != null) ...[
            const SizedBox(height: 12),
            AuroraBanner(
                title: _feedbackErr!, tone: AuroraBannerTone.danger,),
          ],
          const SizedBox(height: 16),
          for (final d in days)
            _DaySection(
              day: d,
              weekStart: plan.weekStart,
              sessions: byDay[d]!,
              busy: _busy,
              onEdit: _applyEdit,
            ),
        ],
      ),
    );
  }
}

class _DaySection extends StatelessWidget {
  const _DaySection({
    required this.day,
    required this.weekStart,
    required this.sessions,
    required this.busy,
    required this.onEdit,
  });

  final int day;
  final String weekStart;
  final List<PlanSession> sessions;
  final bool busy;
  final void Function(EditKind, PlanSession,
      {int? newMinutes,}) onEdit;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final total = sessions
        .where((s) => s.status != 'removed')
        .fold<int>(0, (acc, s) => acc + s.expectedMinutes);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AuroraCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    dayOffsetLabel(day, weekStart),
                    style: typography.h4
                        .copyWith(color: colors.neutral900),
                  ),
                ),
                Text('${total}m planned',
                    style: typography.bodySm
                        .copyWith(color: colors.neutral600),),
              ],
            ),
            const SizedBox(height: 8),
            for (final s in sessions)
              _PlanRow(session: s, busy: busy, onEdit: onEdit),
          ],
        ),
      ),
    );
  }
}

class _PlanRow extends StatelessWidget {
  const _PlanRow({
    required this.session,
    required this.busy,
    required this.onEdit,
  });

  final PlanSession session;
  final bool busy;
  final void Function(EditKind, PlanSession,
      {int? newMinutes,}) onEdit;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final isDone = session.status == 'completed';
    final isRemoved = session.status == 'removed';
    return Opacity(
      opacity: isRemoved ? 0.45 : (isDone ? 0.65 : 1),
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: colors.neutral0,
          border: Border(
            left: BorderSide(
              color: session.isRequired
                  ? colors.aurora500
                  : colors.neutral200,
              width: session.isRequired ? 3 : 1,
            ),
            top: BorderSide(color: colors.neutral200),
            right: BorderSide(color: colors.neutral200),
            bottom: BorderSide(color: colors.neutral200),
          ),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(sessionKindLabel(session.kind),
                style: typography.body.copyWith(
                  color: colors.neutral900,
                  fontWeight: FontWeight.w600,
                ),),
            const SizedBox(height: 2),
            Wrap(
              spacing: 6,
              children: [
                Text('${session.expectedMinutes}m',
                    style: typography.bodySm
                        .copyWith(color: colors.neutral600),),
                Text('·',
                    style: typography.bodySm
                        .copyWith(color: colors.neutral400),),
                Text('${session.expectedQuestions} Q',
                    style: typography.bodySm
                        .copyWith(color: colors.neutral600),),
                if (session.isRequired)
                  Text('· required',
                      style: typography.bodySm.copyWith(
                          color: colors.aurora500,
                          fontWeight: FontWeight.w700,),),
                if (isDone)
                  Text('· done',
                      style: typography.bodySm.copyWith(
                          color: colors.success600,
                          fontWeight: FontWeight.w700,),),
              ],
            ),
            if (!isDone && !isRemoved) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  _ActionBtn(
                    label: 'Shorten',
                    disabled: busy || session.isRequired,
                    onPressed: () => onEdit(
                      EditKind.shorten,
                      session,
                      newMinutes: (session.expectedMinutes - 10)
                          .clamp(10, 999),
                    ),
                  ),
                  const SizedBox(width: 6),
                  _ActionBtn(
                    label: 'Postpone',
                    disabled: busy,
                    onPressed: () => onEdit(EditKind.postpone, session),
                  ),
                  const SizedBox(width: 6),
                  _ActionBtn(
                    label: 'Rest',
                    disabled: busy || session.isRequired,
                    onPressed: () => onEdit(EditKind.rest, session),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  const _ActionBtn({
    required this.label,
    required this.disabled,
    required this.onPressed,
  });

  final String label;
  final bool disabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return AuroraButton(
      label: label,
      variant: AuroraButtonVariant.ghost,
      size: AuroraButtonSize.sm,
      onPressed: disabled ? null : onPressed,
    );
  }
}
