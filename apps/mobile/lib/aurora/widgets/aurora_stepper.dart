// AuroraStepper — Aurora v2 horizontal step indicator.
// Used in the 5-step onboarding wizard.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraStepper extends StatelessWidget {
  const AuroraStepper({
    super.key,
    required this.steps,
    required this.currentIndex,
  });

  final List<String> steps;
  final int currentIndex;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            _StepDot(
              index: i,
              total: steps.length,
              label: steps[i],
              state: i < currentIndex
                  ? _StepState.done
                  : i == currentIndex
                      ? _StepState.current
                      : _StepState.future,
              colors: colors,
              typography: typography,
            ),
            if (i < steps.length - 1)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  color: i < currentIndex
                      ? colors.brand600
                      : colors.neutral200,
                ),
              ),
          ],
        ],
      ),
    );
  }
}

enum _StepState { done, current, future }

class _StepDot extends StatelessWidget {
  const _StepDot({
    required this.index,
    required this.total,
    required this.label,
    required this.state,
    required this.colors,
    required this.typography,
  });

  final int index;
  final int total;
  final String label;
  final _StepState state;
  final AuroraColors colors;
  final AuroraTypography typography;

  @override
  Widget build(BuildContext context) {
    final isDone = state == _StepState.done;
    final isCurrent = state == _StepState.current;
    final bg = isDone || isCurrent ? colors.brand600 : colors.neutral200;
    final fg = isDone || isCurrent ? colors.neutral0 : colors.neutral600;
    return Tooltip(
      message: label,
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: bg,
          shape: BoxShape.circle,
          border: isCurrent
              ? Border.all(color: colors.brand700, width: 2)
              : null,
        ),
        alignment: Alignment.center,
        child: isDone
            ? Icon(Icons.check, size: 14, color: fg)
            : Text(
                '${index + 1}',
                style: typography.label.copyWith(
                  color: fg,
                  fontWeight: FontWeight.w700,
                ),
              ),
      ),
    );
  }
}
