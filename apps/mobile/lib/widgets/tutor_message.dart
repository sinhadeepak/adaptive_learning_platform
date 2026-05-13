import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_math_fork/flutter_math.dart';

/// Parses + renders a single tutor reply.
///
/// Wire shape (the system prompt instructs the model to emit this):
///
///   Markdown body of the answer.
///   May contain **bold**, lists, ```code```, etc.
///
///   <<FOLLOWUPS>>
///   - Question A
///   - Question B
///   <<END>>
///
/// We split body / followups, render the body as Markdown, render followups
/// as tappable suggestion chips. While the reply is still streaming and the
/// `<<FOLLOWUPS>>` block hasn't closed yet, we render only the body — chips
/// pop in once the full block has arrived.

enum ArtifactType { conceptCard, formulaCard, quickQuiz }

class TutorArtifact {
  TutorArtifact({required this.type, required this.data, required this.marker});
  final ArtifactType type;
  final Map<String, dynamic> data;
  final String marker;
}

class TutorReply {
  TutorReply({required this.body, required this.followups, required this.artifacts});
  final String body;
  final List<String> followups;
  final List<TutorArtifact> artifacts;
}

ArtifactType? _artifactTypeFrom(String raw) {
  switch (raw) {
    case 'concept_card':
      return ArtifactType.conceptCard;
    case 'formula_card':
      return ArtifactType.formulaCard;
    case 'quick_quiz':
      return ArtifactType.quickQuiz;
    default:
      return null;
  }
}

final RegExp _artifactOpenRe = RegExp(r'<<ARTIFACT\s+type="([a-z_]+)"\s*>>');
const _artifactClose = '<<END>>';

/// Strip artifact blocks out of `bodyRaw` and replace each with a sentinel
/// marker `<<INLINE_ARTIFACT_n>>`. Returns the rewritten body and the list
/// of artifacts in order. Mid-stream incomplete blocks are left as-is so
/// the user sees the partial content instead of empty space.
({String body, List<TutorArtifact> artifacts}) _extractArtifacts(String bodyRaw) {
  final artifacts = <TutorArtifact>[];
  final buffer = StringBuffer();
  var cursor = 0;
  var n = 0;

  while (cursor < bodyRaw.length) {
    final match = _artifactOpenRe.firstMatch(bodyRaw.substring(cursor));
    if (match == null) {
      buffer.write(bodyRaw.substring(cursor));
      break;
    }
    final openIdx = cursor + match.start;
    buffer.write(bodyRaw.substring(cursor, openIdx));
    final typeStr = match.group(1)!;
    final afterOpen = cursor + match.end;
    final closeIdx = bodyRaw.indexOf(_artifactClose, afterOpen);
    if (closeIdx < 0) {
      // Mid-stream — keep raw partial in body so user sees something flowing.
      buffer.write(bodyRaw.substring(openIdx));
      break;
    }
    final json = bodyRaw.substring(afterOpen, closeIdx).trim();
    Map<String, dynamic>? data;
    try {
      data = jsonDecode(json) as Map<String, dynamic>;
    } catch (_) {
      data = null;
    }
    final artifactType = _artifactTypeFrom(typeStr);
    final marker = '<<INLINE_ARTIFACT_$n>>';
    n += 1;
    if (data != null && artifactType != null) {
      artifacts.add(TutorArtifact(type: artifactType, data: data, marker: marker));
      buffer.write('\n\n$marker\n\n');
    }
    cursor = closeIdx + _artifactClose.length;
  }
  return (body: buffer.toString(), artifacts: artifacts);
}

/// Parser: extracts followups + artifacts and returns the body with artifact
/// markers in place where they should render.
TutorReply parseTutorReply(String raw) {
  // 1. Followups (always at end of reply if present).
  String bodyRaw = raw;
  var followups = const <String>[];

  final startIdx = raw.indexOf('<<FOLLOWUPS>>');
  if (startIdx >= 0) {
    bodyRaw = raw.substring(0, startIdx).trimRight();
    final endIdx = raw.indexOf('<<END>>', startIdx);
    if (endIdx >= 0) {
      final block = raw.substring(startIdx + '<<FOLLOWUPS>>'.length, endIdx);
      final out = <String>[];
      for (final line in block.split('\n')) {
        final trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          final item = trimmed.substring(2).trim();
          if (item.isNotEmpty) out.add(item);
        }
      }
      followups = out.take(4).toList();
    }
  }

  // 2. Artifacts.
  final extracted = _extractArtifacts(bodyRaw);
  return TutorReply(
    body: extracted.body,
    followups: followups,
    artifacts: extracted.artifacts,
  );
}

/// Splits the body into alternating prose / math segments. Recognises:
///   $$ block-level latex $$
///   $ inline latex $
/// (Inline form is rare in our streamed content; block form is what the
/// tutor uses for formulas.)
List<_Segment> splitMathSegments(String body) {
  final out = <_Segment>[];
  // Capture non-greedy display ($$…$$) OR inline ($…$).
  final pattern = RegExp(r'(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$)');
  var cursor = 0;
  for (final match in pattern.allMatches(body)) {
    if (match.start > cursor) {
      out.add(_Segment.markdown(body.substring(cursor, match.start)));
    }
    final raw = match.group(0)!;
    if (raw.startsWith(r'$$') && raw.endsWith(r'$$')) {
      out.add(_Segment.mathBlock(raw.substring(2, raw.length - 2).trim()));
    } else {
      out.add(_Segment.mathInline(raw.substring(1, raw.length - 1).trim()));
    }
    cursor = match.end;
  }
  if (cursor < body.length) {
    out.add(_Segment.markdown(body.substring(cursor)));
  }
  if (out.isEmpty) out.add(_Segment.markdown(body));
  return out;
}

class _Segment {
  _Segment.markdown(this.text) : kind = _SegKind.markdown;
  _Segment.mathBlock(this.text) : kind = _SegKind.mathBlock;
  _Segment.mathInline(this.text) : kind = _SegKind.mathInline;
  final String text;
  final _SegKind kind;
}

enum _SegKind { markdown, mathBlock, mathInline }

/// Renders the parsed reply: markdown body (with inline LaTeX support) +
/// suggested followup chips.
class TutorReplyView extends StatelessWidget {
  const TutorReplyView({
    super.key,
    required this.raw,
    required this.streaming,
    this.onFollowup,
  });
  final String raw;
  final bool streaming;
  final ValueChanged<String>? onFollowup;

  @override
  Widget build(BuildContext context) {
    final reply = parseTutorReply(raw);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (reply.body.isEmpty && reply.artifacts.isEmpty && streaming)
          const _TypingIndicator()
        else
          ..._renderBodyWithArtifacts(reply, context),
        if (reply.followups.isNotEmpty && onFollowup != null) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: reply.followups
                .map((f) => _FollowupChip(text: f, onTap: () => onFollowup!(f)))
                .toList(),
          ),
        ],
      ],
    );
  }

  /// Splits the body around inline-artifact markers, rendering markdown
  /// segments and native artifact cards in the order they appear.
  List<Widget> _renderBodyWithArtifacts(TutorReply reply, BuildContext context) {
    if (reply.artifacts.isEmpty) {
      return splitMathSegments(reply.body)
          .map((s) => _renderSegment(s, context))
          .toList();
    }
    final widgets = <Widget>[];
    var cursor = 0;
    for (final art in reply.artifacts) {
      final idx = reply.body.indexOf(art.marker, cursor);
      if (idx < 0) continue;
      if (idx > cursor) {
        final mdChunk = reply.body.substring(cursor, idx);
        for (final s in splitMathSegments(mdChunk)) {
          widgets.add(_renderSegment(s, context));
        }
      }
      widgets.add(_ArtifactCard(artifact: art));
      cursor = idx + art.marker.length;
    }
    if (cursor < reply.body.length) {
      final mdTail = reply.body.substring(cursor);
      for (final s in splitMathSegments(mdTail)) {
        widgets.add(_renderSegment(s, context));
      }
    }
    return widgets;
  }

  Widget _renderSegment(_Segment s, BuildContext context) {
    switch (s.kind) {
      case _SegKind.markdown:
        if (s.text.trim().isEmpty) return const SizedBox.shrink();
        return MarkdownBody(
          data: s.text,
          selectable: true,
          styleSheet: _styleSheet(context),
        );
      case _SegKind.mathBlock:
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.symmetric(vertical: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AlpColors.bgSurface3,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AlpColors.borderDefault),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Math.tex(
              s.text,
              mathStyle: MathStyle.display,
              textStyle: const TextStyle(
                color: AlpColors.colorAi,
                fontSize: 16,
              ),
              onErrorFallback: (_) => Text(
                s.text,
                style: const TextStyle(
                  color: AlpColors.colorAmber,
                  fontFamily: 'monospace',
                ),
              ),
            ),
          ),
        );
      case _SegKind.mathInline:
        // Wrap inline math in a small container so it sits inline-ish.
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Math.tex(
            s.text,
            mathStyle: MathStyle.text,
            textStyle: const TextStyle(
              color: AlpColors.colorAi,
              fontSize: 14,
            ),
            onErrorFallback: (_) => Text(
              s.text,
              style: const TextStyle(
                color: AlpColors.colorAmber,
                fontFamily: 'monospace',
              ),
            ),
          ),
        );
    }
  }
}

MarkdownStyleSheet _styleSheet(BuildContext context) {
  const monospace = TextStyle(
    fontFamily: 'monospace',
    fontSize: 13,
    color: AlpColors.colorAi,
  );
  return MarkdownStyleSheet(
    p: const TextStyle(color: AlpColors.textPrimary, fontSize: 14, height: 1.55),
    strong: const TextStyle(color: AlpColors.textPrimary, fontWeight: FontWeight.w700),
    em: const TextStyle(color: AlpColors.textPrimary, fontStyle: FontStyle.italic),
    h1: const TextStyle(color: AlpColors.textPrimary, fontSize: 20, fontWeight: FontWeight.w700, height: 1.3),
    h2: const TextStyle(color: AlpColors.textPrimary, fontSize: 17, fontWeight: FontWeight.w700, height: 1.3),
    h3: const TextStyle(color: AlpColors.textPrimary, fontSize: 15, fontWeight: FontWeight.w700, height: 1.3),
    listBullet: const TextStyle(color: AlpColors.textSecondary, fontSize: 14),
    code: monospace.copyWith(
      backgroundColor: AlpColors.bgSurface3,
      letterSpacing: 0,
    ),
    codeblockPadding: const EdgeInsets.all(12),
    codeblockDecoration: BoxDecoration(
      color: AlpColors.bgSurface3,
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: AlpColors.borderDefault),
    ),
    blockquote: const TextStyle(color: AlpColors.textMuted, fontStyle: FontStyle.italic, fontSize: 13, height: 1.5),
    blockquoteDecoration: BoxDecoration(
      color: AlpColors.bgSurface3.withValues(alpha: 0.5),
      border: const Border(
        left: BorderSide(color: AlpColors.colorAi, width: 3),
      ),
    ),
    blockquotePadding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
    a: const TextStyle(color: AlpColors.colorAi, decoration: TextDecoration.underline),
    tableHead: const TextStyle(color: AlpColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 12),
    tableBody: const TextStyle(color: AlpColors.textSecondary, fontSize: 12),
    tableBorder: TableBorder.all(color: AlpColors.borderDefault, width: 1),
    tableCellsPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    horizontalRuleDecoration: const BoxDecoration(
      border: Border(top: BorderSide(color: AlpColors.borderDefault, width: 1)),
    ),
  );
}

// ────────────────────────────────────────────────────────────────────────
// Artifact cards — native renderers for the JSON the tutor emits inline.
// Web has identical components in apps/web-student/src/components/TutorMessage.tsx.
// ────────────────────────────────────────────────────────────────────────

class _ArtifactCard extends StatelessWidget {
  const _ArtifactCard({required this.artifact});
  final TutorArtifact artifact;

  @override
  Widget build(BuildContext context) {
    switch (artifact.type) {
      case ArtifactType.conceptCard:
        return _ConceptCard(data: artifact.data);
      case ArtifactType.formulaCard:
        return _FormulaCard(data: artifact.data);
      case ArtifactType.quickQuiz:
        return _QuickQuizCard(data: artifact.data);
    }
  }
}

class _ConceptCard extends StatelessWidget {
  const _ConceptCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final title = (data['title'] ?? '') as String;
    final summary = (data['summary'] ?? '') as String;
    final points = ((data['key_points'] ?? const []) as List).cast<String>();
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AlpColors.colorAi.withValues(alpha: 0.06),
        border: Border.all(color: AlpColors.colorAi.withValues(alpha: 0.30)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '◈ CONCEPT',
            style: TextStyle(
              color: AlpColors.colorAi,
              fontSize: 10,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (title.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              title,
              style: const TextStyle(
                color: AlpColors.textPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          if (points.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...points.map((p) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 6, right: 8),
                        child: Icon(Icons.circle, size: 5, color: AlpColors.colorAi),
                      ),
                      Expanded(
                        child: Text(
                          p,
                          style: const TextStyle(
                            color: AlpColors.textSecondary,
                            fontSize: 13,
                            height: 1.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),),
          ],
          if (summary.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              summary,
              style: const TextStyle(
                color: AlpColors.textMuted,
                fontSize: 12,
                height: 1.5,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _FormulaCard extends StatelessWidget {
  const _FormulaCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final name = (data['name'] ?? 'Formula') as String;
    final formula = (data['formula'] ?? '') as String;
    final variables = ((data['variables'] ?? const []) as List).cast<dynamic>();
    final example = (data['example'] ?? '') as String;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AlpColors.colorPurple.withValues(alpha: 0.06),
        border: Border.all(color: AlpColors.colorPurple.withValues(alpha: 0.30)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                '◈ FORMULA',
                style: TextStyle(
                  color: AlpColors.colorPurple,
                  fontSize: 10,
                  letterSpacing: 0.6,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              Text(
                name,
                style: const TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          if (formula.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AlpColors.bgSurface3,
                borderRadius: BorderRadius.circular(6),
              ),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Math.tex(
                  formula,
                  mathStyle: MathStyle.display,
                  textStyle: const TextStyle(color: AlpColors.colorPurple, fontSize: 16),
                  onErrorFallback: (_) => Text(
                    formula,
                    style: const TextStyle(color: AlpColors.colorPurple, fontFamily: 'monospace'),
                  ),
                ),
              ),
            ),
          ],
          if (variables.isNotEmpty) ...[
            const SizedBox(height: 10),
            ...variables.whereType<Map<String, dynamic>>().map((v) {
              final sym = (v['sym'] ?? '') as String;
              final meaning = (v['meaning'] ?? '') as String;
              return Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Row(
                  children: [
                    SizedBox(
                      width: 26,
                      child: Text(
                        sym,
                        style: const TextStyle(
                          color: AlpColors.colorAi,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        meaning,
                        style: const TextStyle(color: AlpColors.textSecondary, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          if (example.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.only(top: 8),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AlpColors.borderDefault)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 1, right: 4),
                    child: Text(
                      'Example: ',
                      style: TextStyle(
                        color: AlpColors.colorGreen,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      example,
                      style: const TextStyle(color: AlpColors.textMuted, fontSize: 12, height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _QuickQuizCard extends StatefulWidget {
  const _QuickQuizCard({required this.data});
  final Map<String, dynamic> data;

  @override
  State<_QuickQuizCard> createState() => _QuickQuizCardState();
}

class _QuickQuizCardState extends State<_QuickQuizCard> {
  int? _picked;

  @override
  Widget build(BuildContext context) {
    final question = (widget.data['question'] ?? '') as String;
    final choices = ((widget.data['choices'] ?? const []) as List).cast<String>();
    final correctIdx = ((widget.data['correct_idx'] ?? 0) as num).toInt();
    final explanation = (widget.data['explanation'] ?? '') as String;
    final showFeedback = _picked != null;
    final isCorrect = _picked == correctIdx;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AlpColors.colorAmber.withValues(alpha: 0.06),
        border: Border.all(color: AlpColors.colorAmber.withValues(alpha: 0.30)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '◈ QUICK CHECK',
            style: TextStyle(
              color: AlpColors.colorAmber,
              fontSize: 10,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (question.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              question,
              style: const TextStyle(color: AlpColors.textPrimary, fontSize: 13, height: 1.5),
            ),
          ],
          const SizedBox(height: 10),
          ...List.generate(choices.length, (i) {
            final isPicked = _picked == i;
            final isAnsCorrect = i == correctIdx;
            Color bg = AlpColors.bgSurface3;
            Color bd = AlpColors.borderDefault;
            if (showFeedback) {
              if (isAnsCorrect) {
                bg = AlpColors.colorGreen.withValues(alpha: 0.15);
                bd = AlpColors.colorGreen;
              } else if (isPicked) {
                bg = AlpColors.colorRed.withValues(alpha: 0.15);
                bd = AlpColors.colorRed;
              }
            } else if (isPicked) {
              bg = AlpColors.colorBlue.withValues(alpha: 0.15);
              bd = AlpColors.colorBlue;
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: GestureDetector(
                onTap: _picked != null ? null : () => setState(() => _picked = i),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: bg,
                    border: Border.all(color: bd),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      Text(
                        String.fromCharCode(65 + i),
                        style: const TextStyle(
                          color: AlpColors.textMuted,
                          fontWeight: FontWeight.w700,
                          fontSize: 11,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          choices[i],
                          style: const TextStyle(color: AlpColors.textPrimary, fontSize: 12),
                        ),
                      ),
                      if (showFeedback && isAnsCorrect)
                        const Icon(Icons.check, size: 16, color: AlpColors.colorGreen),
                      if (showFeedback && isPicked && !isAnsCorrect)
                        const Icon(Icons.close, size: 16, color: AlpColors.colorRed),
                    ],
                  ),
                ),
              ),
            );
          }),
          if (showFeedback && explanation.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: (isCorrect ? AlpColors.colorGreen : AlpColors.colorRed).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(6),
                border: Border(
                  left: BorderSide(
                    color: isCorrect ? AlpColors.colorGreen : AlpColors.colorRed,
                    width: 2,
                  ),
                ),
              ),
              child: RichText(
                text: TextSpan(
                  style: const TextStyle(color: AlpColors.textSecondary, fontSize: 12, height: 1.5),
                  children: [
                    TextSpan(
                      text: isCorrect ? 'Correct! ' : 'Not quite — ',
                      style: TextStyle(
                        color: isCorrect ? AlpColors.colorGreen : AlpColors.colorRed,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    TextSpan(text: explanation),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _FollowupChip extends StatelessWidget {
  const _FollowupChip({required this.text, required this.onTap});
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AlpColors.colorAi.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AlpColors.colorAi.withValues(alpha: 0.4)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.auto_awesome, size: 12, color: AlpColors.colorAi),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  text,
                  style: const TextStyle(
                    color: AlpColors.colorAi,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) {
        final t = _ctrl.value;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            final phase = ((t + i / 3) % 1);
            final scale = 0.5 + 0.5 * (1 - (phase * 2 - 1).abs());
            return Padding(
              padding: const EdgeInsets.only(right: 6),
              child: Container(
                width: 7 * scale,
                height: 7 * scale,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AlpColors.colorAi,
                ),
              ),
            );
          }),
        );
      },
    );
  }
}
