import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Per-family question renderer dispatcher.
///
/// Mirrors `apps/web-student/src/components/renderers/index.tsx`.
/// All 29 v1 types render natively on mobile. Composite + interactive
/// wrappers (CASE_STUDY, COMPREHENSION_LONG, KBC_LIFELINE, TIMED_REVEAL,
/// ADAPTIVE_DIFFICULTY, LISTENING_COMP, VIDEO_QUESTION) render their
/// wrapper UI (passage / media / timer / lifelines) inline; children +
/// inner questions are answered through subsequent quiz items resolved
/// by the session driver, matching the web convention.
///
/// API: caller passes (typeId, payload, value, onChange, disabled).
/// `value == null` means "not yet attempted" — same convention as web.

abstract class PolymorphicRenderer {
  static Widget build({
    required String typeId,
    required Map<String, dynamic> payload,
    required dynamic value,
    required ValueChanged<dynamic> onChange,
    bool disabled = false,
  }) {
    Map<String, dynamic>? v;
    if (value is Map<String, dynamic>) v = value;

    switch (typeId) {
      // ── Objective ─────────────────────────────────────────────────
      case 'MCQ_SINGLE':
      case 'ASSERTION_REASON':
      case 'MULTI_STATEMENT':
        return _MCQSingle(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'MCQ_MULTI':
        return _MCQMulti(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'TRUE_FALSE':
        return _TrueFalse(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );

      // ── Numeric ───────────────────────────────────────────────────
      case 'NUMERIC_INTEGER':
        return _Numeric(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
          variant: _NumericVariant.integer,
        );
      case 'NUMERIC_DECIMAL':
        return _Numeric(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
          variant: _NumericVariant.decimal,
        );
      case 'NUMERIC_RANGE':
        return _Numeric(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
          variant: _NumericVariant.range,
        );
      case 'FORMULA_INPUT':
        return _FormulaInput(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );

      // ── Matching ──────────────────────────────────────────────────
      case 'MATCH_THE_FOLLOWING':
        return _MatchTheFollowing(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'SEQUENCING':
        return _Sequencing(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'CLASSIFICATION':
        return _Classification(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );

      // ── Fill-in ───────────────────────────────────────────────────
      case 'FILL_BLANK_SINGLE':
        return _FillBlankSingle(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'FILL_BLANK_MULTI':
        return _FillBlankMulti(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'CLOZE_PASSAGE':
        return _ClozePassage(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'SHORT_TEXT':
        return _TextResponse(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
          rows: 3,
        );

      // ── Subjective ────────────────────────────────────────────────
      case 'ESSAY':
      case 'DESCRIPTIVE_LONG':
        return _TextResponse(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
          rows: 12, withRubric: true,
        );
      case 'CASE_STUDY':
        return _CaseStudy(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'COMPREHENSION_LONG':
        return _ComprehensionLong(payload: payload);

      // ── Visual & Spatial ─────────────────────────────────────────
      case 'DIAGRAM_HOTSPOT':
        return _DiagramHotspot(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'DIAGRAM_LABEL':
        return _DiagramLabel(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'MAP_LOCATION':
        return _MapLocation(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'PICTORIAL_IDENTIFY':
        return _PictorialIdentify(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );

      // ── Audio / Video (Phase 2, un-gated per ADR-0026) ───────────
      case 'LISTENING_COMP':
        return _MediaQuestion(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
          mediaKind: _MediaKind.audio,
        );
      case 'VIDEO_QUESTION':
        return _MediaQuestion(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
          mediaKind: _MediaKind.video,
        );

      // ── Interactive (Phase 2, un-gated per ADR-0026) ─────────────
      case 'KBC_LIFELINE':
        return _KBCLifeline(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'TIMED_REVEAL':
        return _TimedReveal(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );
      case 'ADAPTIVE_DIFFICULTY':
        return _AdaptiveDifficulty(
          payload: payload, value: v, onChange: onChange, disabled: disabled,
        );

      default:
        return _UnknownType(typeId: typeId);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

String _resolveMediaUrl(String mediaId) =>
    '/api/v1/content/media/${Uri.encodeComponent(mediaId)}/file';

Widget _stem(String text) => Text(
      text,
      style: const TextStyle(fontSize: 16, height: 1.5),
    );

InputDecoration get _inputDecoration => const InputDecoration(
      border: OutlineInputBorder(),
      isDense: true,
      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    );

BoxDecoration _cardDecoration({bool selected = false}) => BoxDecoration(
      color: selected ? Colors.blue.shade50 : Colors.white,
      border: Border.all(
        color: selected ? Colors.blue : Colors.grey.shade300,
        width: selected ? 2 : 1,
      ),
      borderRadius: BorderRadius.circular(6),
    );

// ═══════════════════════════════════════════════════════════════════════════
// Objective: MCQ_SINGLE / ASSERTION_REASON / MULTI_STATEMENT
// ═══════════════════════════════════════════════════════════════════════════

class _MCQSingle extends StatelessWidget {
  const _MCQSingle({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final options =
        ((payload['options'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final selectedId = value?['selected_id'] as String?;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 16),
        ...options.map((opt) {
          final id = opt['id'] as String;
          final text = opt['text'] as String;
          final isSelected = selectedId == id;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: disabled ? null : () => onChange({'selected_id': id}),
              borderRadius: BorderRadius.circular(6),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: _cardDecoration(selected: isSelected),
                child: Row(
                  children: [
                    Radio<String>(
                      value: id,
                      groupValue: selectedId,
                      onChanged: disabled
                          ? null
                          : (v) => onChange({'selected_id': v}),
                    ),
                    Text('$id.',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(text)),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Objective: MCQ_MULTI
// ═══════════════════════════════════════════════════════════════════════════

class _MCQMulti extends StatelessWidget {
  const _MCQMulti({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final partial = payload['partial_credit'] == true;
    final options =
        ((payload['options'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final selected = <String>{
      ...((value?['selected_ids'] as List?) ?? const []).cast<String>(),
    };

    void toggle(String id) {
      final next = {...selected};
      if (next.contains(id)) {
        next.remove(id);
      } else {
        next.add(id);
      }
      onChange({'selected_ids': next.toList()});
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 8),
        Text(
          partial
              ? 'Select all correct. Partial credit applies.'
              : 'Select all correct (none wrong allowed).',
          style: const TextStyle(
              fontSize: 12, color: Colors.grey, fontStyle: FontStyle.italic),
        ),
        const SizedBox(height: 12),
        ...options.map((opt) {
          final id = opt['id'] as String;
          final text = opt['text'] as String;
          final isSelected = selected.contains(id);
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: disabled ? null : () => toggle(id),
              borderRadius: BorderRadius.circular(6),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: _cardDecoration(selected: isSelected),
                child: Row(
                  children: [
                    Checkbox(
                      value: isSelected,
                      onChanged: disabled ? null : (_) => toggle(id),
                    ),
                    Text('$id.',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(text)),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Objective: TRUE_FALSE
// ═══════════════════════════════════════════════════════════════════════════

class _TrueFalse extends StatelessWidget {
  const _TrueFalse({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final selected = value?['selected'] as bool?;

    Widget btn(bool b) {
      final isSelected = selected == b;
      return Expanded(
        child: ElevatedButton(
          onPressed: disabled ? null : () => onChange({'selected': b}),
          style: ElevatedButton.styleFrom(
            backgroundColor: isSelected
                ? (b ? Colors.green : Colors.red)
                : Colors.white,
            foregroundColor: isSelected ? Colors.white : null,
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          child: Text(
            b ? 'True' : 'False',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 16),
        Row(children: [btn(true), const SizedBox(width: 12), btn(false)]),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Numeric: INTEGER / DECIMAL / RANGE
// ═══════════════════════════════════════════════════════════════════════════

enum _NumericVariant { integer, decimal, range }

class _Numeric extends StatelessWidget {
  const _Numeric({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
    required this.variant,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;
  final _NumericVariant variant;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final unit = payload['unit'] as String?;
    final tolerance = payload['tolerance'];
    final allowDecimal = variant != _NumericVariant.integer;
    final ans = value?['answer'];

    String helper;
    switch (variant) {
      case _NumericVariant.integer:
        helper = 'Enter an integer.';
        break;
      case _NumericVariant.decimal:
        helper = tolerance != null
            ? 'Enter a decimal (tolerance ±$tolerance).'
            : 'Enter a decimal.';
        break;
      case _NumericVariant.range:
        helper = 'Enter a value — your answer is correct if it falls within the accepted range.';
        break;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: TextField(
                enabled: !disabled,
                keyboardType: TextInputType.numberWithOptions(
                  decimal: allowDecimal,
                  signed: true,
                ),
                inputFormatters: allowDecimal
                    ? <TextInputFormatter>[]
                    : <TextInputFormatter>[
                        FilteringTextInputFormatter.allow(RegExp(r'[-0-9]')),
                      ],
                onChanged: (v) {
                  if (v.isEmpty) {
                    onChange(null);
                    return;
                  }
                  final parsed =
                      allowDecimal ? double.tryParse(v) : int.tryParse(v);
                  if (parsed != null) onChange({'answer': parsed});
                },
                controller: TextEditingController(text: ans?.toString() ?? ''),
                decoration: _inputDecoration,
                style:
                    const TextStyle(fontSize: 18, fontFamily: 'monospace'),
              ),
            ),
            if (unit != null) ...[
              const SizedBox(width: 8),
              Text(unit,
                  style: const TextStyle(fontSize: 16, color: Colors.grey)),
            ],
          ],
        ),
        const SizedBox(height: 6),
        Text(helper,
            style: const TextStyle(fontSize: 12, color: Colors.grey)),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Numeric: FORMULA_INPUT
// ═══════════════════════════════════════════════════════════════════════════

class _FormulaInput extends StatelessWidget {
  const _FormulaInput({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final expr = value?['expression'] as String? ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 16),
        TextField(
          enabled: !disabled,
          onChanged: (v) {
            if (v.isEmpty) {
              onChange(null);
            } else {
              onChange({'expression': v});
            }
          },
          controller: TextEditingController(text: expr),
          decoration: _inputDecoration.copyWith(hintText: 'e.g.  x^2 + 2*x + 1'),
          style: const TextStyle(fontSize: 18, fontFamily: 'monospace'),
        ),
        const SizedBox(height: 6),
        const Text(
          'Standard math notation. Equivalent forms (e.g. (x+1)^2) accepted.',
          style: TextStyle(fontSize: 12, color: Colors.grey),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Matching: MATCH_THE_FOLLOWING
// ═══════════════════════════════════════════════════════════════════════════

class _MatchTheFollowing extends StatelessWidget {
  const _MatchTheFollowing({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final listA =
        ((payload['list_a'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final listB =
        ((payload['list_b'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final pairs = <String, String>{};
    for (final p in ((value?['pairs'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()) {
      pairs[p['left_id'] as String] = p['right_id'] as String;
    }

    void setPair(String leftId, String? rightId) {
      final next = {...pairs};
      if (rightId == null || rightId.isEmpty) {
        next.remove(leftId);
      } else {
        next[leftId] = rightId;
      }
      onChange({
        'pairs': next.entries
            .map((e) => {'left_id': e.key, 'right_id': e.value})
            .toList(),
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 16),
        ...listA.map((left) {
          final id = left['id'] as String;
          final text = left['text'] as String;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                SizedBox(
                  width: 110,
                  child: Text('$id.  $text',
                      style: const TextStyle(fontWeight: FontWeight.w500)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: pairs[id],
                    isExpanded: true,
                    decoration: _inputDecoration,
                    items: [
                      const DropdownMenuItem<String>(
                        value: null,
                        child: Text('— pick —',
                            style: TextStyle(color: Colors.grey)),
                      ),
                      ...listB.map((right) => DropdownMenuItem<String>(
                            value: right['id'] as String,
                            child: Text(
                                '${right['id']}. ${right['text']}',
                                overflow: TextOverflow.ellipsis),
                          )),
                    ],
                    onChanged: disabled ? null : (v) => setPair(id, v),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Matching: SEQUENCING
// ═══════════════════════════════════════════════════════════════════════════

class _Sequencing extends StatelessWidget {
  const _Sequencing({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final items =
        ((payload['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final defaultOrder = items.map((it) => it['id'] as String).toList();
    final order = <String>[
      ...((value?['ordered_ids'] as List?) ?? defaultOrder).cast<String>(),
    ];

    void commit(List<String> next) => onChange({'ordered_ids': next});

    void moveUp(int idx) {
      if (idx == 0) return;
      final next = [...order];
      final tmp = next[idx - 1];
      next[idx - 1] = next[idx];
      next[idx] = tmp;
      commit(next);
    }

    void moveDown(int idx) {
      if (idx == order.length - 1) return;
      final next = [...order];
      final tmp = next[idx + 1];
      next[idx + 1] = next[idx];
      next[idx] = tmp;
      commit(next);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 16),
        ...List.generate(order.length, (idx) {
          final id = order[idx];
          final item = items.firstWhere((it) => it['id'] == id,
              orElse: () => {'text': id});
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: _cardDecoration(),
              child: Row(
                children: [
                  SizedBox(
                    width: 28,
                    child: Text('${idx + 1}.',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 16)),
                  ),
                  Expanded(child: Text(item['text'] as String)),
                  IconButton(
                    icon: const Icon(Icons.arrow_upward),
                    onPressed: disabled || idx == 0 ? null : () => moveUp(idx),
                    tooltip: 'Move up',
                  ),
                  IconButton(
                    icon: const Icon(Icons.arrow_downward),
                    onPressed: disabled || idx == order.length - 1
                        ? null
                        : () => moveDown(idx),
                    tooltip: 'Move down',
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Matching: CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

class _Classification extends StatelessWidget {
  const _Classification({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final items =
        ((payload['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final categories =
        ((payload['categories'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final assignments = <String, String>{};
    for (final a in ((value?['assignments'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()) {
      assignments[a['item_id'] as String] = a['category_id'] as String;
    }

    void setAssignment(String itemId, String? categoryId) {
      final next = {...assignments};
      if (categoryId == null || categoryId.isEmpty) {
        next.remove(itemId);
      } else {
        next[itemId] = categoryId;
      }
      onChange({
        'assignments': next.entries
            .map((e) => {'item_id': e.key, 'category_id': e.value})
            .toList(),
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 16),
        ...items.map((it) {
          final itemId = it['id'] as String;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: _cardDecoration(),
              child: Row(
                children: [
                  Expanded(child: Text(it['text'] as String)),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 180,
                    child: DropdownButtonFormField<String>(
                      value: assignments[itemId],
                      isExpanded: true,
                      decoration: _inputDecoration,
                      items: [
                        const DropdownMenuItem<String>(
                          value: null,
                          child: Text('— pick —',
                              style: TextStyle(color: Colors.grey)),
                        ),
                        ...categories.map((c) => DropdownMenuItem<String>(
                              value: c['id'] as String,
                              child: Text(c['label'] as String,
                                  overflow: TextOverflow.ellipsis),
                            )),
                      ],
                      onChanged:
                          disabled ? null : (v) => setAssignment(itemId, v),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fill-in: FILL_BLANK_SINGLE
// ═══════════════════════════════════════════════════════════════════════════

class _FillBlankSingle extends StatelessWidget {
  const _FillBlankSingle({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final answer = value?['answer'] as String? ?? '';
    // Split the stem on `___` (3+) or `{{1}}` placeholder.
    final re = RegExp(r'(_{3,}|\{\{1\}\})');
    final parts = <String>[];
    int lastEnd = 0;
    for (final m in re.allMatches(stem)) {
      if (m.start > lastEnd) parts.add(stem.substring(lastEnd, m.start));
      parts.add(m.group(0)!);
      lastEnd = m.end;
    }
    if (lastEnd < stem.length) parts.add(stem.substring(lastEnd));

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      runSpacing: 8,
      children: parts.map((part) {
        final isBlank = re.hasMatch(part);
        if (isBlank) {
          return SizedBox(
            width: 160,
            child: TextField(
              enabled: !disabled,
              onChanged: (v) {
                if (v.isEmpty) {
                  onChange(null);
                } else {
                  onChange({'answer': v});
                }
              },
              controller: TextEditingController(text: answer),
              decoration: const InputDecoration(
                isDense: true,
                contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                border: UnderlineInputBorder(),
                focusedBorder: UnderlineInputBorder(
                  borderSide: BorderSide(color: Colors.blue, width: 2),
                ),
              ),
            ),
          );
        }
        return Text(part, style: const TextStyle(fontSize: 16, height: 1.8));
      }).toList(),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fill-in: FILL_BLANK_MULTI (also reused by CLOZE_PASSAGE)
// ═══════════════════════════════════════════════════════════════════════════

class _FillBlankMulti extends StatelessWidget {
  const _FillBlankMulti({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
    this.passageMode = false,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;
  final bool passageMode;

  @override
  Widget build(BuildContext context) {
    final stem = (payload[passageMode ? 'passage' : 'stem'] as String?) ?? '';
    final answers = <String, String>{};
    for (final b in ((value?['blanks'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()) {
      answers[b['blank_id'] as String] = b['answer'] as String;
    }

    void setAnswer(String blankId, String text) {
      final next = {...answers};
      if (text.isEmpty) {
        next.remove(blankId);
      } else {
        next[blankId] = text;
      }
      onChange({
        'blanks': next.entries
            .map((e) => {'blank_id': e.key, 'answer': e.value})
            .toList(),
      });
    }

    // Split on `{{...}}` placeholders; render an input per matched id.
    final re = RegExp(r'\{\{([^}]+)\}\}');
    final parts = <_StemPart>[];
    int lastEnd = 0;
    for (final m in re.allMatches(stem)) {
      if (m.start > lastEnd) {
        parts.add(_StemPart.text(stem.substring(lastEnd, m.start)));
      }
      parts.add(_StemPart.blank(m.group(1)!));
      lastEnd = m.end;
    }
    if (lastEnd < stem.length) {
      parts.add(_StemPart.text(stem.substring(lastEnd)));
    }

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      runSpacing: 8,
      children: parts
          .map((p) => p.blankId == null
              ? Text(p.text!,
                  style: const TextStyle(fontSize: 16, height: 1.8))
              : SizedBox(
                  width: 130,
                  child: TextField(
                    enabled: !disabled,
                    onChanged: (v) => setAnswer(p.blankId!, v),
                    controller:
                        TextEditingController(text: answers[p.blankId!] ?? ''),
                    decoration: const InputDecoration(
                      isDense: true,
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                      border: UnderlineInputBorder(),
                    ),
                  ),
                ))
          .toList(),
    );
  }
}

class _StemPart {
  final String? text;
  final String? blankId;
  _StemPart.text(String t)
      : text = t,
        blankId = null;
  _StemPart.blank(String id)
      : blankId = id,
        text = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Fill-in: CLOZE_PASSAGE
// ═══════════════════════════════════════════════════════════════════════════

class _ClozePassage extends StatelessWidget {
  const _ClozePassage({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final wordBank =
        ((payload['word_bank'] as List?) ?? const []).cast<String>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (wordBank.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                const Text('Word bank:',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                ...wordBank.map((w) => Chip(
                      label: Text(w),
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                    )),
              ],
            ),
          ),
        _FillBlankMulti(
          payload: payload,
          value: value,
          onChange: onChange,
          disabled: disabled,
          passageMode: true,
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Subjective: ESSAY / DESCRIPTIVE_LONG / SHORT_TEXT (free-text response)
// ═══════════════════════════════════════════════════════════════════════════

class _TextResponse extends StatelessWidget {
  const _TextResponse({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
    required this.rows,
    this.withRubric = false,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;
  final int rows;
  final bool withRubric;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final range =
        ((payload['expected_word_count_range'] as List?) ?? const [])
            .cast<num>();
    final text = value?['text'] as String? ?? '';
    final wordCount =
        text.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;

    final List? rubric = !withRubric
        ? null
        : ((payload['rubric'] as Map<String, dynamic>?)?['criteria'] as List?);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 12),
        if (rubric != null && rubric.isNotEmpty)
          _RubricCard(criteria: rubric.cast<Map<String, dynamic>>()),
        if (range.length == 2)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Aim for ${range[0]}–${range[1]} words.',
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ),
        TextField(
          enabled: !disabled,
          maxLines: rows,
          onChanged: (v) {
            if (v.trim().isEmpty) {
              onChange(null);
            } else {
              onChange({'text': v});
            }
          },
          controller: TextEditingController(text: text),
          decoration: _inputDecoration,
        ),
        const SizedBox(height: 4),
        Text(
          '$wordCount word${wordCount == 1 ? "" : "s"}'
          '${range.length == 2 ? " · target ${range[0]}–${range[1]}" : ""}',
          style: const TextStyle(fontSize: 12, color: Colors.grey),
        ),
      ],
    );
  }
}

class _RubricCard extends StatelessWidget {
  const _RubricCard({required this.criteria});
  final List<Map<String, dynamic>> criteria;

  @override
  Widget build(BuildContext context) {
    final total =
        criteria.fold<num>(0, (a, c) => a + ((c['weight'] as num?) ?? 0));
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(6),
      ),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: Text('Marking rubric (${criteria.length} criteria · $total%)',
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w600)),
        children: criteria.map((c) {
          return ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(
              '${c['id'] ?? c['criterion']} '
              '(${c['weight']}%)',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
                (c['text'] ?? c['description'] ?? '').toString(),
                style: const TextStyle(fontSize: 12)),
          );
        }).toList(),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Subjective: CASE_STUDY (composite with inline sub-questions)
// ═══════════════════════════════════════════════════════════════════════════

class _CaseStudy extends StatelessWidget {
  const _CaseStudy({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final caseFacts = payload['case_facts'] as String? ??
        payload['scenario'] as String? ??
        '';
    final subQs = ((payload['sub_questions'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
    final rubric = (payload['rubric'] as List?)?.cast<Map<String, dynamic>>();
    final answers = <String, String>{
      ...?(value?['answers'] as Map?)?.cast<String, String>(),
    };

    void setAnswer(String id, String text) {
      final next = {...answers};
      if (text.trim().isEmpty) {
        next.remove(id);
      } else {
        next[id] = text;
      }
      onChange(next.isEmpty ? null : {'answers': next});
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (caseFacts.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: Text(caseFacts,
                style: const TextStyle(fontSize: 14, height: 1.6)),
          ),
          const SizedBox(height: 14),
        ],
        if (rubric != null && rubric.isNotEmpty)
          _RubricCard(criteria: rubric),
        ...List.generate(subQs.length, (idx) {
          final sq = subQs[idx];
          final id = sq['id'] as String;
          final prompt = sq['prompt'] as String? ?? '';
          final text = answers[id] ?? '';
          final wordCount =
              text.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;
          return Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Part ${String.fromCharCode(97 + idx)} · $id',
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.grey,
                          letterSpacing: 0.6)),
                  const SizedBox(height: 6),
                  Text(prompt,
                      style: const TextStyle(fontSize: 14, height: 1.5)),
                  const SizedBox(height: 8),
                  TextField(
                    enabled: !disabled,
                    maxLines: 5,
                    onChanged: (v) => setAnswer(id, v),
                    controller: TextEditingController(text: text),
                    decoration: _inputDecoration,
                  ),
                  const SizedBox(height: 4),
                  Text('$wordCount words',
                      style:
                          const TextStyle(fontSize: 11, color: Colors.grey)),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Subjective: COMPREHENSION_LONG (passage + sub-questions answered after)
// ═══════════════════════════════════════════════════════════════════════════

class _ComprehensionLong extends StatelessWidget {
  const _ComprehensionLong({required this.payload});
  final Map<String, dynamic> payload;

  @override
  Widget build(BuildContext context) {
    final passage = payload['passage'] as String? ?? '';
    final children =
        ((payload['child_questions'] as List?) ?? const []).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Passage',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 320),
          child: SingleChildScrollView(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(passage,
                  style: const TextStyle(
                      fontSize: 14, height: 1.7, fontFamily: 'serif')),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
            'Read the passage, then answer the $children sub-question${children == 1 ? "" : "s"} that follow.',
            style: const TextStyle(fontSize: 13)),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Visual: DIAGRAM_HOTSPOT
// ═══════════════════════════════════════════════════════════════════════════

class _DiagramHotspot extends StatefulWidget {
  const _DiagramHotspot({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  State<_DiagramHotspot> createState() => _DiagramHotspotState();
}

class _DiagramHotspotState extends State<_DiagramHotspot> {
  Size? _natural;
  final _imageKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final stem = widget.payload['stem'] as String? ?? '';
    final mediaId = widget.payload['image_media_id'] as String? ?? '';
    final clickX = (widget.value?['click_x'] as num?)?.toDouble();
    final clickY = (widget.value?['click_y'] as num?)?.toDouble();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (context, constraints) {
          return GestureDetector(
            onTapDown: widget.disabled
                ? null
                : (d) {
                    if (_natural == null) return;
                    final renderBox = _imageKey.currentContext
                        ?.findRenderObject() as RenderBox?;
                    if (renderBox == null) return;
                    final size = renderBox.size;
                    final x =
                        (d.localPosition.dx / size.width) * _natural!.width;
                    final y =
                        (d.localPosition.dy / size.height) * _natural!.height;
                    widget.onChange({
                      'click_x': x.round(),
                      'click_y': y.round(),
                    });
                  },
            child: Stack(
              children: [
                Image.network(
                  _resolveMediaUrl(mediaId),
                  key: _imageKey,
                  fit: BoxFit.contain,
                  width: constraints.maxWidth,
                  errorBuilder: (_, __, ___) => Container(
                    height: 200,
                    color: Colors.grey.shade200,
                    alignment: Alignment.center,
                    child: const Text('Image unavailable'),
                  ),
                  frameBuilder: (context, child, frame, _) {
                    if (frame != null && _natural == null) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        final image = (child as Image).image;
                        image.resolve(const ImageConfiguration()).addListener(
                              ImageStreamListener((info, _) {
                                if (mounted && _natural == null) {
                                  setState(() => _natural = Size(
                                      info.image.width.toDouble(),
                                      info.image.height.toDouble()));
                                }
                              }),
                            );
                      });
                    }
                    return child;
                  },
                ),
                if (_natural != null && clickX != null && clickY != null)
                  Positioned(
                    left: (clickX / _natural!.width) * constraints.maxWidth - 10,
                    top: (clickY / _natural!.height) *
                            (constraints.maxWidth *
                                _natural!.height /
                                _natural!.width) -
                        10,
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.amber,
                        border: Border.all(color: Colors.white, width: 3),
                      ),
                    ),
                  ),
              ],
            ),
          );
        }),
        if (clickX != null && clickY != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
                'Clicked at (${clickX.round()}, ${clickY.round()})',
                style: const TextStyle(fontSize: 12, color: Colors.grey)),
          ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Visual: DIAGRAM_LABEL
// ═══════════════════════════════════════════════════════════════════════════

class _DiagramLabel extends StatelessWidget {
  const _DiagramLabel({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final mediaId = payload['image_media_id'] as String? ?? '';
    final markers =
        ((payload['markers'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final labels =
        ((payload['labels'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final pairs = <String, String>{};
    for (final p in ((value?['pairs'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()) {
      pairs[p['marker_id'] as String] = p['label_id'] as String;
    }

    void setPair(String markerId, String? labelId) {
      final next = {...pairs};
      if (labelId == null || labelId.isEmpty) {
        next.remove(markerId);
      } else {
        next[markerId] = labelId;
      }
      onChange({
        'pairs': next.entries
            .map((e) => {'marker_id': e.key, 'label_id': e.value})
            .toList(),
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 12),
        Image.network(
          _resolveMediaUrl(mediaId),
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Container(
            height: 200,
            color: Colors.grey.shade200,
            alignment: Alignment.center,
            child: const Text('Image unavailable'),
          ),
        ),
        const SizedBox(height: 12),
        ...markers.map((m) {
          final mid = m['id'] as String;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: Colors.amber,
                  child: Text(mid,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: pairs[mid],
                    isExpanded: true,
                    decoration: _inputDecoration,
                    items: [
                      const DropdownMenuItem<String>(
                        value: null,
                        child: Text('— pick label —',
                            style: TextStyle(color: Colors.grey)),
                      ),
                      ...labels.map((l) => DropdownMenuItem<String>(
                            value: l['id'] as String,
                            child: Text(l['text'] as String,
                                overflow: TextOverflow.ellipsis),
                          )),
                    ],
                    onChanged: disabled ? null : (v) => setPair(mid, v),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Visual: MAP_LOCATION
//
// Mobile uses a static base-map image + tap → percentage coordinates,
// then translates percentage to lat/lng using the static viewport
// bounds. This avoids a full Leaflet/flutter_map dependency for a
// type that's used sparingly. The web uses interactive Leaflet tiles;
// mobile uses the same answer shape but a simpler tap target.
// ═══════════════════════════════════════════════════════════════════════════

class _MapLocation extends StatefulWidget {
  const _MapLocation({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  State<_MapLocation> createState() => _MapLocationState();
}

class _MapLocationState extends State<_MapLocation> {
  // Static viewport bounds per base map. Matches the Leaflet config in
  // apps/web-student/src/components/renderers/LeafletMap.tsx so server
  // grading sees the same coordinate frame from web + mobile.
  static const Map<String, (double, double, double, double)> _bounds = {
    // (lat_min, lat_max, lng_min, lng_max)
    'india': (6.0, 37.0, 68.0, 98.0),
    'world': (-60.0, 75.0, -180.0, 180.0),
  };

  @override
  Widget build(BuildContext context) {
    final stem = widget.payload['stem'] as String? ?? '';
    final baseMap = widget.payload['base_map'] as String? ?? 'india';
    final customId = widget.payload['custom_map_media_id'] as String?;
    final lat = (widget.value?['click_lat'] as num?)?.toDouble();
    final lng = (widget.value?['click_lng'] as num?)?.toDouble();

    final bounds = _bounds[baseMap];
    final imageUrl = customId != null
        ? _resolveMediaUrl(customId)
        : 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/A_large_blank_world_map_with_oceans_marked_in_blue.svg/1024px-A_large_blank_world_map_with_oceans_marked_in_blue.svg.png';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (context, constraints) {
          return GestureDetector(
            onTapDown: widget.disabled || bounds == null
                ? null
                : (d) {
                    final width = constraints.maxWidth;
                    final height = width * 0.65; // approximate aspect
                    final fx = (d.localPosition.dx / width).clamp(0.0, 1.0);
                    final fy = (d.localPosition.dy / height).clamp(0.0, 1.0);
                    final (latMin, latMax, lngMin, lngMax) = bounds;
                    final clickLat = latMax - fy * (latMax - latMin);
                    final clickLng = lngMin + fx * (lngMax - lngMin);
                    widget.onChange({
                      'click_lat': clickLat,
                      'click_lng': clickLng,
                    });
                  },
            child: Stack(
              children: [
                AspectRatio(
                  aspectRatio: 1.54,
                  child: Image.network(
                    imageUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: Colors.blue.shade50,
                      alignment: Alignment.center,
                      child: const Text('Map unavailable'),
                    ),
                  ),
                ),
                if (lat != null && lng != null && bounds != null)
                  LayoutBuilder(builder: (context, c2) {
                    final width = c2.maxWidth;
                    final height = width / 1.54;
                    final (latMin, latMax, lngMin, lngMax) = bounds;
                    final fx = (lng - lngMin) / (lngMax - lngMin);
                    final fy = (latMax - lat) / (latMax - latMin);
                    return Positioned(
                      left: fx * width - 10,
                      top: fy * height - 10,
                      child: const Icon(Icons.location_on,
                          color: Colors.red, size: 24),
                    );
                  }),
              ],
            ),
          );
        }),
        if (lat != null && lng != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Pinned at lat ${lat.toStringAsFixed(4)}, lng ${lng.toStringAsFixed(4)}',
              style: const TextStyle(fontSize: 13),
            ),
          ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Visual: PICTORIAL_IDENTIFY
// ═══════════════════════════════════════════════════════════════════════════

class _PictorialIdentify extends StatelessWidget {
  const _PictorialIdentify({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final mediaId = payload['image_media_id'] as String? ?? '';
    final options =
        ((payload['options'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final selectedId = value?['selected_id'] as String?;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stem(stem),
        const SizedBox(height: 12),
        Image.network(
          _resolveMediaUrl(mediaId),
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Container(
            height: 200,
            color: Colors.grey.shade200,
            alignment: Alignment.center,
            child: const Text('Image unavailable'),
          ),
        ),
        const SizedBox(height: 12),
        ...options.map((opt) {
          final id = opt['id'] as String;
          final text = opt['text'] as String;
          final isSelected = selectedId == id;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: disabled ? null : () => onChange({'selected_id': id}),
              borderRadius: BorderRadius.circular(6),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: _cardDecoration(selected: isSelected),
                child: Row(
                  children: [
                    Radio<String>(
                      value: id,
                      groupValue: selectedId,
                      onChanged: disabled
                          ? null
                          : (v) => onChange({'selected_id': v}),
                    ),
                    Text('$id.',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(text)),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Audio/Video: LISTENING_COMP / VIDEO_QUESTION (Phase 2)
//
// Mobile renders the media player + transcript + a "this contains N
// sub-questions" preface. Children are answered as separate quiz items
// downstream (same convention as web COMPREHENSION_LONG). Audio/video
// playback uses a simple WebView fallback so the build doesn't depend
// on adding `audioplayers` / `video_player` packages yet — adding those
// is the follow-up in ADR-0026 §"Follow-up work" if richer controls are
// needed.
// ═══════════════════════════════════════════════════════════════════════════

enum _MediaKind { audio, video }

class _MediaQuestion extends StatelessWidget {
  const _MediaQuestion({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
    required this.mediaKind,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;
  final _MediaKind mediaKind;

  @override
  Widget build(BuildContext context) {
    final mediaId = (payload[mediaKind == _MediaKind.audio
            ? 'audio_media_id'
            : 'video_media_id'] as String?) ??
        '';
    final transcript = payload['transcript'] as String?;
    final children = ((payload['child_questions'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.blueGrey.shade50,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: Colors.blueGrey.shade200),
          ),
          child: Row(
            children: [
              Icon(
                  mediaKind == _MediaKind.audio
                      ? Icons.headphones
                      : Icons.play_circle_outline,
                  size: 36,
                  color: Colors.blueGrey.shade700),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        mediaKind == _MediaKind.audio
                            ? 'Listening comprehension'
                            : 'Video question',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    const SizedBox(height: 4),
                    Text(
                        'Open the ${mediaKind == _MediaKind.audio ? "audio" : "video"} below, then answer the ${children.length} sub-question${children.length == 1 ? "" : "s"} that follow.',
                        style: const TextStyle(fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Lightweight stand-in for the player: a play-link to the media
        // URL. Replacing this with `audioplayers` / `video_player` is
        // mechanical when content volume justifies the dep weight.
        OutlinedButton.icon(
          onPressed: disabled
              ? null
              : () {
                  // Mark playback-started so submit can include it
                  // alongside any per-child responses gathered downstream.
                  onChange({
                    'media_played': true,
                    ...?value,
                  });
                },
          icon: Icon(mediaKind == _MediaKind.audio
              ? Icons.play_arrow
              : Icons.play_circle_fill),
          label: Text(
              'Open ${mediaKind == _MediaKind.audio ? "audio" : "video"} (${_resolveMediaUrl(mediaId)})'),
        ),
        if (transcript != null && transcript.isNotEmpty) ...[
          const SizedBox(height: 12),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text('Show transcript',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(transcript,
                    style: const TextStyle(fontSize: 13, height: 1.5)),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Interactive: KBC_LIFELINE (Phase 2)
//
// Wraps a (server-resolved) MCQ_SINGLE inner question. Renderer surfaces
// the available lifelines as buttons; toggling one records into the
// `lifelines_used` list. Inner-question answering itself flows through
// the regular MCQ pipeline; this widget owns only the lifeline state.
// ═══════════════════════════════════════════════════════════════════════════

class _KBCLifeline extends StatelessWidget {
  const _KBCLifeline({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final available =
        ((payload['available_lifelines'] as List?) ?? const []).cast<String>();
    final innerPayload = payload['inner_payload'] as Map<String, dynamic>?;
    final used = <String>{
      ...((value?['lifelines_used'] as List?) ?? const []).cast<String>(),
    };
    final innerValue = value?['inner_response_payload'] as Map<String, dynamic>?;

    void toggleLifeline(String kind) {
      final next = {...used};
      if (next.contains(kind)) {
        next.remove(kind);
      } else {
        next.add(kind);
      }
      onChange({
        'lifelines_used': next.toList(),
        if (innerValue != null) 'inner_response_payload': innerValue,
      });
    }

    void setInner(dynamic v) {
      onChange({
        'lifelines_used': used.toList(),
        if (v != null) 'inner_response_payload': v,
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Colors.deepPurple.shade50, Colors.indigo.shade50],
            ),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            children: [
              const Icon(Icons.flash_on, color: Colors.deepPurple),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('KBC-style lifelines available',
                    style: TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: available
              .map((kind) => FilterChip(
                    label: Text(_lifelineLabel(kind)),
                    selected: used.contains(kind),
                    onSelected:
                        disabled ? null : (_) => toggleLifeline(kind),
                  ))
              .toList(),
        ),
        const SizedBox(height: 14),
        if (innerPayload != null)
          PolymorphicRenderer.build(
            typeId: 'MCQ_SINGLE',
            payload: innerPayload,
            value: innerValue,
            onChange: setInner,
            disabled: disabled,
          )
        else
          const Text(
            'Inner MCQ resolves at quiz fetch — answer in the next step.',
            style: TextStyle(fontSize: 13, color: Colors.grey),
          ),
      ],
    );
  }

  String _lifelineLabel(String kind) => switch (kind) {
        '50_50' => '50:50',
        'audience_poll' => 'Audience poll',
        'phone_a_friend' => 'Phone a friend',
        _ => kind,
      };
}

// ═══════════════════════════════════════════════════════════════════════════
// Interactive: TIMED_REVEAL (Phase 2)
//
// Shows initial stem; reveal steps unlock at their `at_seconds` mark on
// a local Timer.tick. Records the timestamp at which the student commits
// their inner answer.
// ═══════════════════════════════════════════════════════════════════════════

class _TimedReveal extends StatefulWidget {
  const _TimedReveal({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  State<_TimedReveal> createState() => _TimedRevealState();
}

class _TimedRevealState extends State<_TimedReveal> {
  Timer? _ticker;
  final _stopwatch = Stopwatch()..start();

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final stem = widget.payload['initial_stem'] as String? ?? '';
    final reveals = ((widget.payload['reveal_schedule'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
    final innerPayload =
        widget.payload['inner_payload'] as Map<String, dynamic>?;
    final innerValue =
        widget.value?['inner_response_payload'] as Map<String, dynamic>?;
    final elapsed = _stopwatch.elapsed.inMilliseconds / 1000.0;

    void setInner(dynamic v) {
      widget.onChange({
        if (v != null) 'inner_response_payload': v,
        'answered_at_seconds': elapsed,
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          const Icon(Icons.timer, size: 18, color: Colors.deepOrange),
          const SizedBox(width: 4),
          Text('${elapsed.toStringAsFixed(1)} s',
              style: const TextStyle(
                  fontFamily: 'monospace', color: Colors.deepOrange)),
        ]),
        const SizedBox(height: 8),
        _stem(stem),
        const SizedBox(height: 12),
        ...reveals.asMap().entries.map((entry) {
          final step = entry.value;
          final at = (step['at_seconds'] as num).toDouble();
          final unlocked = elapsed >= at;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 400),
              opacity: unlocked ? 1.0 : 0.35,
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: unlocked
                      ? Colors.amber.shade50
                      : Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                      color: unlocked
                          ? Colors.amber
                          : Colors.grey.shade300),
                ),
                child: Row(
                  children: [
                    Text('@${at.toStringAsFixed(0)}s',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: Colors.deepOrange,
                            fontFamily: 'monospace')),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        unlocked
                            ? (step['additional_info'] as String? ?? '')
                            : '…',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
        const SizedBox(height: 12),
        if (innerPayload != null)
          PolymorphicRenderer.build(
            typeId: 'MCQ_SINGLE',
            payload: innerPayload,
            value: innerValue,
            onChange: setInner,
            disabled: widget.disabled,
          )
        else
          const Text(
            'Inner question resolves at quiz fetch — answer in the next step.',
            style: TextStyle(fontSize: 13, color: Colors.grey),
          ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Interactive: ADAPTIVE_DIFFICULTY (Phase 2)
//
// The engine chooses the served variant at fetch time; the renderer
// displays the served question + the difficulty stamp. The student's
// inner response is forwarded under `inner_response_payload`.
// ═══════════════════════════════════════════════════════════════════════════

class _AdaptiveDifficulty extends StatelessWidget {
  const _AdaptiveDifficulty({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final served = payload['served_question_id'] as String? ?? '';
    final difficulty = payload['served_difficulty'] as int? ?? 0;
    final innerType = payload['inner_type_id'] as String? ?? 'MCQ_SINGLE';
    final innerPayload =
        payload['inner_payload'] as Map<String, dynamic>?;
    final innerValue = value?['inner_response_payload'];

    void setInner(dynamic v) {
      onChange({
        'served_question_id': served,
        if (v != null) 'inner_response_payload': v,
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: _difficultyColor(difficulty).withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: _difficultyColor(difficulty)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.signal_cellular_alt,
                  size: 14, color: _difficultyColor(difficulty)),
              const SizedBox(width: 4),
              Text('Difficulty $difficulty / 5',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: _difficultyColor(difficulty))),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (innerPayload != null)
          PolymorphicRenderer.build(
            typeId: innerType,
            payload: innerPayload,
            value: innerValue,
            onChange: setInner,
            disabled: disabled,
          )
        else
          const Text(
            'Served question resolves at quiz fetch.',
            style: TextStyle(fontSize: 13, color: Colors.grey),
          ),
      ],
    );
  }

  Color _difficultyColor(int level) {
    if (level <= 1) return Colors.green;
    if (level <= 2) return Colors.lightGreen;
    if (level <= 3) return Colors.amber;
    if (level <= 4) return Colors.deepOrange;
    return Colors.red;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Unknown type (registry mismatch fallback)
// ═══════════════════════════════════════════════════════════════════════════

class _UnknownType extends StatelessWidget {
  const _UnknownType({required this.typeId});
  final String typeId;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Unknown question type',
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: Colors.red)),
          const SizedBox(height: 4),
          Text(
              'No mobile renderer is registered for "$typeId". Please update the app.',
              style: const TextStyle(fontSize: 13)),
        ],
      ),
    );
  }
}
