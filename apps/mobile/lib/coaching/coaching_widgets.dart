// S58 mobile polish — coaching cards + doubt bridge.
//
// Mirrors:
//   apps/web-student/src/components/ConfidenceCalibrationCard.tsx
//   apps/web-student/src/components/ErrorPatternCoachingCard.tsx
//   apps/web-student/src/components/DoubtPracticeBridge.tsx

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/widgets/widgets.dart';

// ── ConfidenceCalibrationCard ───────────────────────────────────────

enum CalibrationBucket { aligned, overconfident, underconfident }

class CalibrationRow {
  const CalibrationRow({
    required this.key,
    required this.confidence,
    required this.accuracy,
    required this.n,
    this.label,
  });

  final String key;
  final String? label;
  final double confidence;
  final double accuracy;
  final int n;
}

CalibrationBucket bucketFor(CalibrationRow r) {
  final delta = r.confidence - r.accuracy;
  if (delta.abs() < 0.1) return CalibrationBucket.aligned;
  return delta > 0
      ? CalibrationBucket.overconfident
      : CalibrationBucket.underconfident;
}

class ConfidenceCalibrationCard extends StatelessWidget {
  const ConfidenceCalibrationCard({
    super.key,
    required this.rows,
    this.hideWhenEmpty = false,
  });

  final List<CalibrationRow> rows;
  final bool hideWhenEmpty;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty && hideWhenEmpty) return const SizedBox.shrink();
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    if (rows.isEmpty) {
      return AuroraCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Confidence vs. accuracy',
                style: typography.h4
                    .copyWith(color: colors.neutral900),),
            const SizedBox(height: 6),
            Text(
              "Rate your confidence on a few practice items and we'll start plotting your calibration here.",
              style: typography.bodySm
                  .copyWith(color: colors.neutral600, height: 1.5),
            ),
          ],
        ),
      );
    }

    final meanGap =
        rows.fold<double>(0, (acc, r) => acc + (r.confidence - r.accuracy)) /
            rows.length;
    final overall = meanGap.abs() < 0.05
        ? CalibrationBucket.aligned
        : (meanGap > 0
            ? CalibrationBucket.overconfident
            : CalibrationBucket.underconfident);

    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Confidence vs. accuracy',
              style: typography.h4
                  .copyWith(color: colors.neutral900),),
          const SizedBox(height: 4),
          Text(
            'On average you\'re ${_bucketLabel(overall).toLowerCase()} by ${(meanGap.abs() * 100).toStringAsFixed(0)}%.',
            style: typography.bodySm
                .copyWith(color: colors.neutral600),
          ),
          const SizedBox(height: 8),
          for (final r in rows.take(6))
            _CalRow(row: r, bucket: bucketFor(r)),
        ],
      ),
    );
  }
}

String _bucketLabel(CalibrationBucket b) => switch (b) {
      CalibrationBucket.aligned => 'Aligned',
      CalibrationBucket.overconfident => 'Overconfident',
      CalibrationBucket.underconfident => 'Underconfident',
    };

class _CalRow extends StatelessWidget {
  const _CalRow({required this.row, required this.bucket});

  final CalibrationRow row;
  final CalibrationBucket bucket;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final tone = switch (bucket) {
      CalibrationBucket.aligned => colors.success600,
      CalibrationBucket.overconfident => colors.danger600,
      CalibrationBucket.underconfident => colors.developing600,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              row.label ??
                  row.key.substring(0, row.key.length.clamp(0, 8)),
              style: typography.bodySm.copyWith(
                fontFamily: 'monospace',
                color: colors.neutral600,
              ),
            ),
          ),
          Text(
            'conf ${(row.confidence * 100).round()}%',
            style: typography.overline
                .copyWith(color: colors.aurora500),
          ),
          const SizedBox(width: 6),
          Text(
            'acc ${(row.accuracy * 100).round()}%',
            style: typography.overline
                .copyWith(color: colors.neutral800),
          ),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 6, vertical: 2,),
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(_bucketLabel(bucket).toUpperCase(),
                style: typography.overline.copyWith(
                  color: tone,
                  fontWeight: FontWeight.w700,
                ),),
          ),
        ],
      ),
    );
  }
}

// ── ErrorPatternCoachingCard ────────────────────────────────────────

enum ErrorTag {
  sillyMistake,
  conceptualGap,
  timePressure,
  formulaError,
  signOrUnitError,
  unattempted,
}

String errorTagWire(ErrorTag t) => switch (t) {
      ErrorTag.sillyMistake => 'silly_mistake',
      ErrorTag.conceptualGap => 'conceptual_gap',
      ErrorTag.timePressure => 'time_pressure',
      ErrorTag.formulaError => 'formula_error',
      ErrorTag.signOrUnitError => 'sign_or_unit_error',
      ErrorTag.unattempted => 'unattempted',
    };

ErrorTag? errorTagFromWire(String s) => switch (s) {
      'silly_mistake' => ErrorTag.sillyMistake,
      'conceptual_gap' => ErrorTag.conceptualGap,
      'time_pressure' => ErrorTag.timePressure,
      'formula_error' => ErrorTag.formulaError,
      'sign_or_unit_error' => ErrorTag.signOrUnitError,
      'unattempted' => ErrorTag.unattempted,
      _ => null,
    };

String errorTagLabel(ErrorTag t) => switch (t) {
      ErrorTag.sillyMistake => 'Silly mistakes',
      ErrorTag.conceptualGap => 'Conceptual gaps',
      ErrorTag.timePressure => 'Time-pressure errors',
      ErrorTag.formulaError => 'Formula misapplication',
      ErrorTag.signOrUnitError => 'Sign / unit errors',
      ErrorTag.unattempted => 'Unattempted',
    };

const _coachingCopy = <ErrorTag, ({String why, String doThis})>{
  ErrorTag.sillyMistake: (
    why:
        "Most often it's reading the question wrong, transcription slips, or arithmetic done in your head.",
    doThis:
        'Slow your pen down on the first 20 seconds. Read the stem twice. Underline what is being asked.',
  ),
  ErrorTag.conceptualGap: (
    why:
        "The underlying idea hasn't fully landed — the wrong pick is internally consistent with a missing concept.",
    doThis:
        'Open the concept profile for the worst-hit topic. Watch the short explainer + do a 5-question recall round.',
  ),
  ErrorTag.timePressure: (
    why:
        "You're correct when given time, but the clock is biting on the last third.",
    doThis:
        'Pace drills: 5 mock questions on a 90-second per-Q timer. Get under the pressure on purpose.',
  ),
  ErrorTag.formulaError: (
    why:
        'Right approach, wrong formula — sign, exponent, or constant flipped mid-derivation.',
    doThis:
        'Build a formula sheet for the worst-hit topic this week. Re-derive each one from scratch once.',
  ),
  ErrorTag.signOrUnitError: (
    why:
        'Numbers right, dimensions wrong — m/s vs km/h, − instead of +, mol vs grams.',
    doThis:
        "Write units on every line. After the answer, do a 5-second 'does this magnitude make sense?' check.",
  ),
  ErrorTag.unattempted: (
    why:
        "You're skipping more than answering. Could be time, confidence, or the questions feel out of reach.",
    doThis:
        'Pick build_confidence as your next intent — the engine will start you below your θ̂ so the rhythm comes back.',
  ),
};

class ErrorPatternCoachingCard extends StatelessWidget {
  const ErrorPatternCoachingCard({
    super.key,
    required this.topTag,
    required this.count,
  });

  /// Null = no rollup yet — card hides itself.
  final ErrorTag? topTag;
  final int count;

  @override
  Widget build(BuildContext context) {
    if (topTag == null || count <= 0) return const SizedBox.shrink();
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final copy = _coachingCopy[topTag!]!;
    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('◆',
                  style: typography.h3
                      .copyWith(color: colors.developing600),),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('TOP ERROR PATTERN',
                        style: typography.overline.copyWith(
                          color: colors.developing600,
                          letterSpacing: 0.5,
                        ),),
                    Text(errorTagLabel(topTag!),
                        style: typography.h4
                            .copyWith(color: colors.neutral900),),
                    Text('$count occurrence${count == 1 ? '' : 's'} across recent sessions.',
                        style: typography.bodySm
                            .copyWith(color: colors.neutral600),),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _section('Why it happens', copy.why),
          const SizedBox(height: 8),
          _section('Try this', copy.doThis),
        ],
      ),
    );
  }

  Widget _section(String label, String body) =>
      Builder(builder: (ctx) {
        final colors = Theme.of(ctx).extension<AuroraColors>()!;
        final typography = Theme.of(ctx).extension<AuroraTypography>()!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: typography.overline.copyWith(
                  color: colors.neutral600,
                  letterSpacing: 0.5,
                ),),
            const SizedBox(height: 2),
            Text(body,
                style: typography.bodySm
                    .copyWith(color: colors.neutral900, height: 1.5),),
          ],
        );
      },);
}

// ── DoubtPracticeBridge ─────────────────────────────────────────────

class DoubtPracticeBridge extends StatelessWidget {
  const DoubtPracticeBridge({
    super.key,
    required this.topicId,
    this.topicTitle,
    this.resolved = true,
    this.onStart,
  });

  final String? topicId;
  final String? topicTitle;
  final bool resolved;
  final VoidCallback? onStart;

  @override
  Widget build(BuildContext context) {
    if (!resolved || topicId == null) return const SizedBox.shrink();
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      tone: AuroraCardTone.auroraAi,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('⚡',
                  style: typography.h3
                      .copyWith(color: colors.aurora500),),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('LOCK IT IN',
                        style: typography.overline.copyWith(
                          color: colors.aurora500,
                          letterSpacing: 0.5,
                        ),),
                    Text(
                      topicTitle != null
                          ? 'Practice this · $topicTitle'
                          : 'Practice this concept',
                      style: typography.h4
                          .copyWith(color: colors.neutral900),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Understanding the answer is half the loop. A short retrieval round on the same topic locks it in before it decays.',
            style: typography.bodySm
                .copyWith(color: colors.neutral700, height: 1.5),
          ),
          const SizedBox(height: 12),
          AuroraButton(
            label: 'Start a 5-question retrieval round →',
            variant: AuroraButtonVariant.aurora,
            size: AuroraButtonSize.md,
            fullWidth: true,
            onPressed: onStart,
          ),
        ],
      ),
    );
  }
}
