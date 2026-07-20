import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../widgets/math_markdown.dart';
import 'explanation_models.dart';
import 'quiz_client.dart';

// ──────────────────────────────────────────────────────────────────────
// ExplanationPanel — the rich teaching note for one reviewed quiz item.
//
// Mirrors the web ExplainCard: key concept + headline + why-correct +
// per-option verdicts + common pitfall + worked example + next steps, all
// rendered with markdown + LaTeX. Auto-loads on init for every question
// (correct or wrong); the note is cached per-question server-side, so only
// the first viewer pays the LLM round-trip. Degrades quietly — a fetch
// failure leaves the rest of the drawer intact.
// ──────────────────────────────────────────────────────────────────────

class ExplanationPanel extends StatefulWidget {
  const ExplanationPanel({
    super.key,
    required this.api,
    required this.item,
    this.topicTitle,
  });

  final ApiClient api;
  final QuizItemSummary item;
  final String? topicTitle;

  @override
  State<ExplanationPanel> createState() => _ExplanationPanelState();
}

class _ExplanationPanelState extends State<ExplanationPanel> {
  ExplainResult? _result;
  bool _loading = true;
  bool _showWorkedExample = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    final item = widget.item;
    final res = await widget.api.explainQuestion(
      questionId: item.questionId,
      stem: item.stem,
      choices: item.choices,
      correctIdx: item.correctIdx,
      pickedIdx: item.answerIdx,
      topicTitle: widget.topicTitle,
    );
    if (!mounted) return;
    setState(() {
      _result = res;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return _card(
        child: Row(
          children: const [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 10),
            Text(
              'Generating teaching note…',
              style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
            ),
          ],
        ),
      );
    }

    final r = _result;
    if (r == null) {
      return _card(
        child: const Text(
          'Explanation unavailable right now.',
          style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
        ),
      );
    }

    final children = <Widget>[
      _header(r),
    ];

    if (r.isRich) {
      if (r.headline != null && r.headline!.trim().isNotEmpty) {
        children.add(const SizedBox(height: 6));
        children.add(
          MathMarkdown(
            r.headline!,
            baseStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              height: 1.4,
            ),
          ),
        );
      }
      final authored = (widget.item.explanation ?? '').trim();
      if (authored.isNotEmpty) children.add(_authorNote(authored));
      if (_has(r.whyCorrect)) {
        children.add(_section('Why this is correct', MathMarkdown(r.whyCorrect!)));
      }
      if (r.options.isNotEmpty) {
        children.add(_section('Each option, briefly', _optionList(r)));
      }
      if (_has(r.commonPitfall)) children.add(_pitfall(r.commonPitfall!));
      if (_has(r.workedExample)) children.add(_workedExample(r.workedExample!));
      if (r.nextSteps.isNotEmpty) {
        children.add(_section('Next steps', _nextSteps(r.nextSteps)));
      }
    } else {
      // Heuristic / legacy fallback.
      children.add(const SizedBox(height: 6));
      children.add(MathMarkdown(r.explanation));
      if (_has(r.commonPitfall)) children.add(_pitfall(r.commonPitfall!));
    }

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }

  // ── Pieces ───────────────────────────────────────────────────────────

  Widget _header(ExplainResult r) {
    final isAi = r.source != 'heuristic';
    return Row(
      children: [
        Expanded(
          child: Text(
            '✦ ${r.keyConcept ?? 'Teaching note'}'.toUpperCase(),
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
              color: AlpColors.colorAi,
            ),
          ),
        ),
        Text(
          isAi ? '✨ AI' : '◈ Heuristic',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: isAi ? AlpColors.colorAi : AlpColors.textMuted,
          ),
        ),
      ],
    );
  }

  Widget _authorNote(String text) => Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          color: AlpColors.colorGreen.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(6),
          border: const Border(
            left: BorderSide(color: AlpColors.colorGreen, width: 3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'FROM THE AUTHOR',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: AlpColors.colorGreen,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              text,
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.6,
                fontStyle: FontStyle.italic,
                color: AlpColors.textSecondary,
              ),
            ),
          ],
        ),
      );

  Widget _optionList(ExplainResult r) {
    final choices = widget.item.choices;
    return Column(
      children: [
        for (var i = 0; i < r.options.length; i++)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: (r.options[i].isCorrect
                      ? AlpColors.colorGreen
                      : AlpColors.colorRed)
                  .withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                color: (r.options[i].isCorrect
                        ? AlpColors.colorGreen
                        : AlpColors.colorRed)
                    .withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${r.options[i].id}. ${r.options[i].isCorrect ? '✓' : '✗'}',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: r.options[i].isCorrect
                        ? AlpColors.colorGreen
                        : AlpColors.colorRed,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (choices != null && i < choices.length)
                        Text(
                          choices[i],
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: AlpColors.textSecondary,
                          ),
                        ),
                      MathMarkdown(r.options[i].verdict),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _pitfall(String text) => Container(
        margin: const EdgeInsets.only(top: 14),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AlpColors.colorAmber.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: AlpColors.colorAmber.withValues(alpha: 0.25)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '⚠ COMMON PITFALL',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
                color: AlpColors.colorAmber,
              ),
            ),
            const SizedBox(height: 4),
            MathMarkdown(text),
          ],
        ),
      );

  Widget _workedExample(String text) => Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GestureDetector(
              onTap: () =>
                  setState(() => _showWorkedExample = !_showWorkedExample),
              child: Text(
                '${_showWorkedExample ? '▾' : '▸'} Worked example',
                style: const TextStyle(
                  color: AlpColors.colorAi,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (_showWorkedExample)
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AlpColors.bgSurface3,
                  borderRadius: BorderRadius.circular(6),
                  border: const Border(
                    left: BorderSide(color: AlpColors.colorAi, width: 2),
                  ),
                ),
                child: MathMarkdown(text),
              ),
          ],
        ),
      );

  Widget _nextSteps(List<String> steps) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final s in steps)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('→ ',
                      style: TextStyle(color: AlpColors.colorGreen)),
                  Expanded(child: MathMarkdown(s)),
                ],
              ),
            ),
        ],
      );

  Widget _section(String label, Widget child) => Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label.toUpperCase(),
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: AlpColors.textMuted,
              ),
            ),
            const SizedBox(height: 6),
            child,
          ],
        ),
      );

  Widget _card({required Widget child}) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AlpColors.bgSurface2,
          borderRadius: BorderRadius.circular(10),
          border: const Border(
            left: BorderSide(color: AlpColors.colorAi, width: 3),
          ),
        ),
        child: child,
      );

  bool _has(String? s) => s != null && s.trim().isNotEmpty;
}
