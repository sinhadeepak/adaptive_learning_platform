// Difficulty Agency widgets (Phase 6 S54 mobile parity).
//
// Mirrors:
//   apps/web-student/src/components/IntentSelector.tsx
//   apps/web-student/src/components/FrictionPrompt.tsx
//   apps/web-student/src/components/PostQuizCalibration.tsx
//   apps/web-student/src/components/AdaptsExplainerCard.tsx

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/widgets/widgets.dart';
import 'difficulty_agency_client.dart';

// ── IntentSelector ──────────────────────────────────────────────────

class IntentSelector extends StatelessWidget {
  const IntentSelector({
    super.key,
    required this.value,
    required this.onChange,
    this.compact = false,
  });

  final IntentAnchor value;
  final ValueChanged<IntentAnchor> onChange;
  final bool compact;

  static const _order = <IntentAnchor>[
    IntentAnchor.buildConfidence,
    IntentAnchor.match,
    IntentAnchor.push,
  ];

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (final a in _order)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: _IntentButton(
                    anchor: a,
                    active: a == value,
                    onTap: () => onChange(a),
                  ),
                ),
              ),
          ],
        ),
        if (!compact) ...[
          const SizedBox(height: 10),
          Text(intentDescriptions[value]!,
              style: typography.bodySm.copyWith(
                  color: colors.neutral600, height: 1.5,),),
        ],
      ],
    );
  }
}

class _IntentButton extends StatelessWidget {
  const _IntentButton({
    required this.anchor,
    required this.active,
    required this.onTap,
  });

  final IntentAnchor anchor;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Material(
      color: active
          ? colors.aurora500.withValues(alpha: 0.12)
          : colors.neutral0,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          decoration: BoxDecoration(
            border: Border.all(
              color: active
                  ? colors.aurora500
                  : colors.neutral200,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(intentGlyphs[anchor]!,
                  style: typography.h2.copyWith(
                      color: colors.aurora500, fontWeight: FontWeight.w700,),),
              const SizedBox(height: 4),
              Text(
                intentLabels[anchor]!,
                style: typography.bodySm.copyWith(
                  color: colors.neutral900,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── FrictionPrompt ──────────────────────────────────────────────────

class FrictionPrompt extends StatelessWidget {
  const FrictionPrompt({
    super.key,
    required this.trigger,
    required this.onAccept,
    required this.onDismiss,
  });

  final FrictionTrigger trigger;
  final void Function(double offset, FrictionAction action) onAccept;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final acceptLabel = switch (trigger.suggestedAction) {
      FrictionAction.easier => 'Yes, ease up',
      FrictionAction.harder => 'Yes, push me',
      FrictionAction.same => 'OK',
    };
    return AuroraCard(
      tone: AuroraCardTone.auroraAi,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '◈ Heads up · ${frictionReasonLabel(trigger.reason)}',
            style: typography.overline.copyWith(
              color: colors.aurora500,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(trigger.message,
              style: typography.h4.copyWith(color: colors.neutral900),),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: AuroraButton(
                  label: 'Stay the course',
                  variant: AuroraButtonVariant.secondary,
                  size: AuroraButtonSize.sm,
                  onPressed: onDismiss,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AuroraButton(
                  label: acceptLabel,
                  variant: AuroraButtonVariant.aurora,
                  size: AuroraButtonSize.sm,
                  onPressed: () => onAccept(
                      trigger.suggestedOffset, trigger.suggestedAction,),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── PostQuizCalibration ─────────────────────────────────────────────

class PostQuizCalibration extends StatefulWidget {
  const PostQuizCalibration({
    super.key,
    required this.onSubmit,
    this.initialValue,
  });

  final Future<void> Function(CalibrationFeedback feedback) onSubmit;
  final CalibrationFeedback? initialValue;

  @override
  State<PostQuizCalibration> createState() => _PostQuizCalibrationState();
}

class _PostQuizCalibrationState extends State<PostQuizCalibration> {
  CalibrationFeedback? _pending;
  CalibrationFeedback? _submitted;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _pending = widget.initialValue;
    _submitted = widget.initialValue;
  }

  static const _options = <(CalibrationFeedback, String, String)>[
    (CalibrationFeedback.tooEasy, 'Too easy', '↓'),
    (CalibrationFeedback.right, 'Just right', '='),
    (CalibrationFeedback.tooHard, 'Too hard', '↑'),
  ];

  Future<void> _pick(CalibrationFeedback value) async {
    if (_submitting) return;
    setState(() {
      _pending = value;
      _submitting = true;
      _error = null;
    });
    try {
      await widget.onSubmit(value);
      if (mounted) setState(() => _submitted = value);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('How did that feel?',
              style: typography.h4.copyWith(color: colors.neutral900),),
          const SizedBox(height: 4),
          Text(
            "Tells the engine whether to bias the next session up or down. Your mastery numbers don't change either way.",
            style: typography.bodySm.copyWith(color: colors.neutral600),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final (v, label, glyph) in _options) ...[
                Expanded(
                  child: _CalibrationButton(
                    label: label,
                    glyph: glyph,
                    active: _pending == v,
                    submitted: _submitted == v,
                    disabled: _submitting,
                    onTap: () => _pick(v),
                  ),
                ),
                if (v != _options.last.$1) const SizedBox(width: 8),
              ],
            ],
          ),
          if (_submitted != null && _error == null) ...[
            const SizedBox(height: 8),
            Text('✓ Saved — your next session will reflect this.',
                style: typography.bodySm
                    .copyWith(color: colors.success600),),
          ],
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!,
                style: typography.bodySm
                    .copyWith(color: colors.danger600),),
          ],
        ],
      ),
    );
  }
}

class _CalibrationButton extends StatelessWidget {
  const _CalibrationButton({
    required this.label,
    required this.glyph,
    required this.active,
    required this.submitted,
    required this.disabled,
    required this.onTap,
  });

  final String label;
  final String glyph;
  final bool active;
  final bool submitted;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Material(
      color: (active || submitted)
          ? colors.aurora500.withValues(alpha: 0.12)
          : colors.neutral0,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: disabled ? null : onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(
            border: Border.all(
              color: (active || submitted)
                  ? colors.aurora500
                  : colors.neutral200,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(glyph,
                  style: typography.h3
                      .copyWith(color: colors.aurora500),),
              const SizedBox(height: 4),
              Text(label,
                  style: typography.bodySm.copyWith(
                    color: colors.neutral900,
                    fontWeight: FontWeight.w600,
                  ),),
            ],
          ),
        ),
      ),
    );
  }
}

// ── AdaptsExplainerCard ─────────────────────────────────────────────

class AdaptsExplainerCard extends StatelessWidget {
  const AdaptsExplainerCard({super.key, this.onDismiss});

  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      tone: AuroraCardTone.auroraAi,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('✦',
                  style: typography.h3.copyWith(color: colors.aurora500),),
              const SizedBox(width: 6),
              Expanded(
                child: Text('How adaptive practice works',
                    style: typography.h4
                        .copyWith(color: colors.neutral900),),
              ),
              AuroraIconButton(
                icon: const Icon(Icons.close, size: 18),
                semanticLabel: 'Dismiss explainer',
                onPressed: () async {
                  await markAdaptsExplainerSeen();
                  onDismiss?.call();
                },
              ),
            ],
          ),
          const SizedBox(height: 8),
          _StepRow(
            num: '1',
            title: 'Pick your intent before each round',
            copy:
                'Match, push, or build confidence. The engine shifts where it starts but never changes how your mastery is scored.',
          ),
          _StepRow(
            num: '2',
            title: 'The engine watches as you go',
            copy:
                'If you nail three in a row or stumble on three in a row, it offers ONE mid-round nudge. You always get the final call.',
          ),
          _StepRow(
            num: '3',
            title: 'Tell us how it felt',
            copy:
                'At the end, mark whether it was too easy / just right / too hard. We calibrate the next session — not your mastery score.',
          ),
          const SizedBox(height: 6),
          Text(
            'Mastery only updates from how you actually answered. Intent + feedback shape what\'s served, never what\'s recorded.',
            style: typography.overline.copyWith(
              color: colors.neutral500,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.num,
    required this.title,
    required this.copy,
  });

  final String num;
  final String title;
  final String copy;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: colors.aurora500.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Text(num,
                style: typography.overline.copyWith(
                  color: colors.aurora500,
                  fontWeight: FontWeight.w700,
                ),),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: typography.bodySm.copyWith(
                      color: colors.neutral900,
                      fontWeight: FontWeight.w700,
                    ),),
                Text(copy,
                    style: typography.bodySm
                        .copyWith(color: colors.neutral700, height: 1.45),),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
