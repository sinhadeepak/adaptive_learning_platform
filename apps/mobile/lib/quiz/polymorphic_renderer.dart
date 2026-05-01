import 'package:flutter/material.dart';

/// Per-family question renderer dispatcher (P5-S67 / S59).
///
/// Mirrors `apps/web-student/src/components/renderers/index.tsx`.
/// Mobile v1 ships renderers for the three highest-volume types
/// (MCQ_SINGLE, ESSAY, SHORT_TEXT); the rest fall through to a
/// "type not supported on mobile yet" stub that pairs with the
/// existing PENDING_HUMAN_REVIEW path on the backend.
///
/// Quiz session driver passes (typeId, payload, value, onChange);
/// the dispatcher hands off to the right widget. Returns `null` when
/// the student hasn't attempted — same convention as web.

abstract class PolymorphicRenderer {
  static Widget build({
    required String typeId,
    required Map<String, dynamic> payload,
    required dynamic value,
    required ValueChanged<dynamic> onChange,
    bool disabled = false,
  }) {
    switch (typeId) {
      case 'MCQ_SINGLE':
      case 'ASSERTION_REASON':
      case 'MULTI_STATEMENT':
        return _MCQSingle(
          payload: payload,
          value: value as Map<String, dynamic>?,
          onChange: onChange,
          disabled: disabled,
        );
      case 'TRUE_FALSE':
        return _TrueFalse(
          payload: payload,
          value: value as Map<String, dynamic>?,
          onChange: onChange,
          disabled: disabled,
        );
      case 'NUMERIC_INTEGER':
      case 'NUMERIC_DECIMAL':
        return _Numeric(
          payload: payload,
          value: value as Map<String, dynamic>?,
          onChange: onChange,
          disabled: disabled,
          allowDecimal: typeId == 'NUMERIC_DECIMAL',
        );
      case 'ESSAY':
      case 'DESCRIPTIVE_LONG':
      case 'SHORT_TEXT':
        return _TextResponse(
          payload: payload,
          value: value as Map<String, dynamic>?,
          onChange: onChange,
          disabled: disabled,
          isShort: typeId == 'SHORT_TEXT',
        );
      default:
        return _UnsupportedStub(typeId: typeId);
    }
  }
}

// ── MCQ_SINGLE ─────────────────────────────────────────────────────────────


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
        Text(stem, style: const TextStyle(fontSize: 16, height: 1.5)),
        const SizedBox(height: 16),
        ...options.map((opt) {
          final id = opt['id'] as String;
          final text = opt['text'] as String;
          final isSelected = selectedId == id;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: disabled ? null : () => onChange({'selected_id': id}),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isSelected ? Colors.blue.shade50 : Colors.white,
                  border: Border.all(
                    color: isSelected ? Colors.blue : Colors.grey.shade300,
                    width: isSelected ? 2 : 1,
                  ),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  children: [
                    Radio<String>(
                      value: id,
                      groupValue: selectedId,
                      onChanged: disabled
                          ? null
                          : (v) => onChange({'selected_id': v}),
                    ),
                    Text(
                      '$id.',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
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

// ── TRUE_FALSE ─────────────────────────────────────────────────────────────


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
          child: Text(b ? 'True' : 'False',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(stem, style: const TextStyle(fontSize: 16, height: 1.5)),
        const SizedBox(height: 16),
        Row(children: [btn(true), const SizedBox(width: 12), btn(false)]),
      ],
    );
  }
}

// ── NUMERIC_INTEGER / DECIMAL ─────────────────────────────────────────────


class _Numeric extends StatelessWidget {
  const _Numeric({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
    required this.allowDecimal,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;
  final bool allowDecimal;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final unit = payload['unit'] as String?;
    final ans = value?['answer'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(stem, style: const TextStyle(fontSize: 16, height: 1.5)),
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
                onChanged: (v) {
                  if (v.isEmpty) {
                    onChange(null);
                    return;
                  }
                  final parsed =
                      allowDecimal ? double.tryParse(v) : int.tryParse(v);
                  if (parsed != null) onChange({'answer': parsed});
                },
                controller: TextEditingController(
                  text: ans?.toString() ?? '',
                ),
                decoration: const InputDecoration(border: OutlineInputBorder()),
                style: const TextStyle(fontSize: 18, fontFamily: 'monospace'),
              ),
            ),
            if (unit != null) ...[
              const SizedBox(width: 8),
              Text(unit, style: const TextStyle(fontSize: 16, color: Colors.grey)),
            ],
          ],
        ),
      ],
    );
  }
}

// ── ESSAY / DESCRIPTIVE_LONG / SHORT_TEXT ─────────────────────────────────


class _TextResponse extends StatelessWidget {
  const _TextResponse({
    required this.payload,
    required this.value,
    required this.onChange,
    required this.disabled,
    required this.isShort,
  });
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? value;
  final ValueChanged<dynamic> onChange;
  final bool disabled;
  final bool isShort;

  @override
  Widget build(BuildContext context) {
    final stem = payload['stem'] as String? ?? '';
    final range =
        ((payload['expected_word_count_range'] as List?) ?? const [])
            .cast<num>();
    final text = value?['text'] as String? ?? '';
    final wordCount =
        text.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(stem, style: const TextStyle(fontSize: 16, height: 1.5)),
        const SizedBox(height: 12),
        if (range.length == 2)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Aim for ${range[0]}-${range[1]} words.',
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ),
        TextField(
          enabled: !disabled,
          maxLines: isShort ? 3 : 12,
          onChanged: (v) {
            if (v.trim().isEmpty) {
              onChange(null);
            } else {
              onChange({'text': v});
            }
          },
          controller: TextEditingController(text: text),
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        const SizedBox(height: 4),
        Text('$wordCount words', style: const TextStyle(fontSize: 12)),
      ],
    );
  }
}

// ── Unsupported stub ──────────────────────────────────────────────────────


class _UnsupportedStub extends StatelessWidget {
  const _UnsupportedStub({required this.typeId});
  final String typeId;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '📱 Mobile rendering not yet wired',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text(
            'Type $typeId renders fully in the web app. On mobile this question routes to the human grader queue automatically.',
            style: const TextStyle(fontSize: 13),
          ),
        ],
      ),
    );
  }
}
