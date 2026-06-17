import 'package:flutter/material.dart';

import '../l10n/strings.dart';

/// Per-question confidence slider for mobile (P5-S67 / S39).
///
/// Mirrors web-student/src/components/ConfidenceSlider.tsx. Optional
/// surface — used in diagnostic + mock-test flows where calibration
/// is the goal. Backend captures the value on quiz submit (NATS
/// payload extends with `confidence`); engagement.process_session
/// writes to confidence_calibration → Brier score on read.
class ConfidenceSlider extends StatelessWidget {
  const ConfidenceSlider({
    super.key,
    required this.value,
    required this.onChange,
    this.disabled = false,
  });
  final double? value;
  final ValueChanged<double?> onChange;
  final bool disabled;

  static const _presets = <(String, double)>[
    ('quiz.confidence.guessing', 0.25),
    ('quiz.confidence.maybe', 0.5),
    ('quiz.confidence.pretty_sure', 0.75),
    ('quiz.confidence.certain', 0.95),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: t('quiz.confidence.label'),
                      style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w500,),
                    ),
                    const TextSpan(text: ' '),
                    TextSpan(
                      text: t('quiz.confidence.optional'),
                      style: TextStyle(
                        fontSize: 13, color: Colors.grey.shade600,),
                    ),
                  ],
                ),
              ),
              if (value != null)
                TextButton(
                  onPressed: disabled ? null : () => onChange(null),
                  child: const Text('Clear', style: TextStyle(fontSize: 11)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final (key, presetValue) in _presets) ...[
                Expanded(
                  child: OutlinedButton(
                    onPressed:
                        disabled ? null : () => onChange(presetValue),
                    style: OutlinedButton.styleFrom(
                      backgroundColor: value == presetValue
                          ? Colors.blue
                          : Colors.transparent,
                      foregroundColor:
                          value == presetValue ? Colors.white : null,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                    ),
                    child: Text(t(key),
                        style: const TextStyle(fontSize: 11),),
                  ),
                ),
                const SizedBox(width: 4),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Slider(
            value: (value ?? 0.5) * 100,
            min: 0,
            max: 100,
            divisions: 20,
            label: '${((value ?? 0.5) * 100).toStringAsFixed(0)}%',
            onChanged: disabled ? null : (v) => onChange(v / 100),
          ),
          if (value != null)
            Center(
              child: Text(
                '${(value! * 100).toStringAsFixed(0)}% confident',
                style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600,),
              ),
            ),
        ],
      ),
    );
  }
}
