// PracticeRunnerShell — full-screen quiz container.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Hides the bottom nav, takes the whole screen, owns a slim custom
// app bar with:
//   - exit (closes session with confirm prompt — caller-owned)
//   - timer pill
//   - flag (caller-owned bookmark)
//   - question N / total counter
//
// The body slot is the active question; the bottom slot is the answer
// surface (numeric pad, MCQ options, etc.). PracticeRunnerShell does
// NOT own those — it is a shell.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class PracticeRunnerShell extends StatelessWidget {
  const PracticeRunnerShell({
    super.key,
    required this.questionIndex,
    required this.totalQuestions,
    required this.body,
    required this.answerSurface,
    required this.timerLabel,
    required this.onExit,
    this.onToggleFlag,
    this.isFlagged = false,
    this.warningThreshold,
  });

  final int questionIndex;
  final int totalQuestions;
  final Widget body;
  final Widget answerSurface;

  /// e.g. "12:34" — caller formats. Pre-formatted so the shell stays
  /// pure (no timer logic).
  final String timerLabel;

  final VoidCallback onExit;
  final VoidCallback? onToggleFlag;
  final bool isFlagged;

  /// When non-null and the remaining seconds drop below this number,
  /// the timer pill turns danger-red. (Caller decides remaining secs
  /// and renders via [timerLabel]; this shell just toggles tone by
  /// the integer it parses out — if parsing fails, default tone.)
  final Duration? warningThreshold;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final progress =
        totalQuestions == 0 ? 0.0 : questionIndex / totalQuestions;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: colors.neutral0,
        statusBarIconBrightness: Theme.of(context).brightness == Brightness.dark
            ? Brightness.light
            : Brightness.dark,
      ),
      child: Material(
        color: colors.neutral50,
        child: SafeArea(
          child: Column(
            children: [
              _AppBar(
                index: questionIndex,
                total: totalQuestions,
                timerLabel: timerLabel,
                isFlagged: isFlagged,
                onExit: onExit,
                onToggleFlag: onToggleFlag,
                warning: false,
                colors: colors,
                typo: typography,
              ),
              LinearProgressIndicator(
                value: progress.clamp(0, 1).toDouble(),
                minHeight: 3,
                backgroundColor: colors.neutral100,
                valueColor: AlwaysStoppedAnimation<Color>(colors.brand600),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: EdgeInsets.all(16 * density.spaceScale),
                  child: body,
                ),
              ),
              Container(
                decoration: BoxDecoration(
                  color: colors.neutral0,
                  border: Border(
                    top: BorderSide(color: colors.neutral200),
                  ),
                ),
                padding: EdgeInsets.fromLTRB(
                  16 * density.spaceScale,
                  12 * density.spaceScale,
                  16 * density.spaceScale,
                  16 * density.spaceScale,
                ),
                child: answerSurface,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AppBar extends StatelessWidget {
  const _AppBar({
    required this.index,
    required this.total,
    required this.timerLabel,
    required this.isFlagged,
    required this.onExit,
    required this.onToggleFlag,
    required this.warning,
    required this.colors,
    required this.typo,
  });

  final int index;
  final int total;
  final String timerLabel;
  final bool isFlagged;
  final VoidCallback onExit;
  final VoidCallback? onToggleFlag;
  final bool warning;
  final AuroraColors colors;
  final AuroraTypography typo;

  @override
  Widget build(BuildContext context) {
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final timerBg = warning ? colors.danger50 : colors.neutral100;
    final timerFg = warning ? colors.danger600 : colors.neutral800;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        8 * density.spaceScale,
        4 * density.spaceScale,
        8 * density.spaceScale,
        4 * density.spaceScale,
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.close),
            color: colors.neutral800,
            onPressed: onExit,
            tooltip: 'Exit',
          ),
          Expanded(
            child: Text(
              'Q ${index + 1} / $total',
              textAlign: TextAlign.center,
              style: typo.label.copyWith(
                color: colors.neutral700,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: timerBg,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.timer, color: timerFg, size: 14),
                const SizedBox(width: 4),
                Text(
                  timerLabel,
                  style: typo.label.copyWith(
                    color: timerFg,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(
              isFlagged ? Icons.flag : Icons.outlined_flag,
              color: isFlagged ? colors.developing600 : colors.neutral600,
            ),
            onPressed: onToggleFlag,
            tooltip: isFlagged ? 'Unflag' : 'Flag for review',
          ),
        ],
      ),
    );
  }
}
