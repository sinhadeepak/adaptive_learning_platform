import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_math_fork/flutter_math.dart';

// ──────────────────────────────────────────────────────────────────────
// MathMarkdown — renders prose that mixes markdown with LaTeX.
//
// Quiz explanations are NEET/JEE-heavy: formulas, subscripts, expressions
// like $\eta = 1 - T_2/T_1$. This splits a string on $$…$$ (display) and
// $…$ (inline) math, rendering markdown segments via flutter_markdown and
// math segments via flutter_math_fork (with a monospace fallback on parse
// error).
//
// This mirrors the renderer in widgets/tutor_message.dart; that file's
// equivalent is private to its reply parser, so this is a small standalone
// twin reused by the quiz-results explanation panel. tutor_message could
// adopt this later.
// ──────────────────────────────────────────────────────────────────────

class MathMarkdown extends StatelessWidget {
  const MathMarkdown(this.text, {super.key, this.baseStyle});

  final String text;
  final TextStyle? baseStyle;

  @override
  Widget build(BuildContext context) {
    final segments = _splitMath(text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final s in segments) _renderSegment(s, context),
      ],
    );
  }

  Widget _renderSegment(_Seg s, BuildContext context) {
    switch (s.kind) {
      case _SegKind.markdown:
        if (s.text.trim().isEmpty) return const SizedBox.shrink();
        return MarkdownBody(
          data: s.text,
          selectable: true,
          styleSheet: _styleSheet(baseStyle),
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
              textStyle:
                  const TextStyle(color: AlpColors.colorAi, fontSize: 16),
              onErrorFallback: (_) => _mathFallback(s.text),
            ),
          ),
        );
      case _SegKind.mathInline:
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Math.tex(
            s.text,
            mathStyle: MathStyle.text,
            textStyle: const TextStyle(color: AlpColors.colorAi, fontSize: 14),
            onErrorFallback: (_) => _mathFallback(s.text),
          ),
        );
    }
  }

  Widget _mathFallback(String raw) => Text(
        raw,
        style: const TextStyle(
          color: AlpColors.colorAmber,
          fontFamily: 'monospace',
        ),
      );
}

List<_Seg> _splitMath(String body) {
  final out = <_Seg>[];
  final pattern = RegExp(r'(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$)');
  var cursor = 0;
  for (final match in pattern.allMatches(body)) {
    if (match.start > cursor) {
      out.add(_Seg(_SegKind.markdown, body.substring(cursor, match.start)));
    }
    final raw = match.group(0)!;
    if (raw.startsWith(r'$$') && raw.endsWith(r'$$')) {
      out.add(_Seg(_SegKind.mathBlock, raw.substring(2, raw.length - 2).trim()));
    } else {
      out.add(
        _Seg(_SegKind.mathInline, raw.substring(1, raw.length - 1).trim()),
      );
    }
    cursor = match.end;
  }
  if (cursor < body.length) {
    out.add(_Seg(_SegKind.markdown, body.substring(cursor)));
  }
  if (out.isEmpty) out.add(_Seg(_SegKind.markdown, body));
  return out;
}

enum _SegKind { markdown, mathBlock, mathInline }

class _Seg {
  const _Seg(this.kind, this.text);
  final _SegKind kind;
  final String text;
}

MarkdownStyleSheet _styleSheet(TextStyle? base) {
  final p = base ?? const TextStyle(fontSize: 14, height: 1.55);
  return MarkdownStyleSheet(
    p: p,
    strong: const TextStyle(fontWeight: FontWeight.w700),
    em: const TextStyle(fontStyle: FontStyle.italic),
    listBullet: p,
    a: const TextStyle(
      color: AlpColors.colorAi,
      decoration: TextDecoration.underline,
    ),
    code: const TextStyle(
      fontFamily: 'monospace',
      fontSize: 13,
      color: AlpColors.colorAi,
      backgroundColor: AlpColors.bgSurface3,
    ),
  );
}
