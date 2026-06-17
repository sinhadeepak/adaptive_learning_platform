import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../../auth/auth_client.dart';
import '../onboarding_shell.dart';

class TargetDateScreen extends StatefulWidget {
  const TargetDateScreen({
    super.key,
    required this.auth,
    required this.onContinue,
    required this.onBack,
  });

  final AuthClient auth;
  final VoidCallback onContinue;
  final VoidCallback onBack;

  @override
  State<TargetDateScreen> createState() => _TargetDateScreenState();
}

class _TargetDateScreenState extends State<TargetDateScreen> {
  String? _examId;
  DateTime? _date;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadExam();
  }

  Future<void> _loadExam() async {
    try {
      final res = await widget.auth.apiGet('/profile/me');
      if (res.statusCode != 200) return;
      final j = jsonDecode(res.body) as Map<String, dynamic>;
      final exams = (j['exams'] as List).cast<Map<String, dynamic>>();
      if (exams.isEmpty) return;
      setState(() {
        _examId = exams.first['examId'] as String;
        final td = exams.first['targetDate'] as String?;
        if (td != null) _date = DateTime.tryParse(td);
      });
    } catch (_) {/* ignore */}
  }

  int? get _daysRemaining {
    if (_date == null) return null;
    final today = DateTime.now();
    final t = DateTime(today.year, today.month, today.day);
    return _date!.difference(t).inDays;
  }

  Future<void> _pick() async {
    final today = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? today.add(const Duration(days: 90)),
      firstDate: today,
      lastDate: today.add(const Duration(days: 365 * 2)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  void _setPreset(int months) {
    final base = DateTime.now();
    setState(() => _date = DateTime(base.year, base.month + months, base.day));
  }

  Future<void> _submit({bool skip = false}) async {
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      if (skip) {
        widget.onContinue();
        return;
      }
      if (_examId == null) {
        setState(() => _error = 'No exam selected — go back to step 1.');
        return;
      }
      final iso = _date!.toIso8601String().substring(0, 10);
      final res = await widget.auth.apiPatch('/profile/exams/$_examId', {'targetDate': iso});
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't save your target date.");
        return;
      }
      widget.onContinue();
    } catch (_) {
      setState(() => _error = "We couldn't save your target date.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dr = _daysRemaining;
    return OnboardingShell(
      step: 3,
      title: 'When is your exam?',
      description: "We'll build a study plan that ramps up toward this date.",
      onBack: widget.onBack,
      children: [
        if (_error != null) ...[
          _OnboardingError(message: _error!),
          const SizedBox(height: AlpSpacing.s3),
        ],
        InkWell(
          onTap: _pick,
          borderRadius: BorderRadius.circular(AlpRadius.input),
          child: Container(
            padding: const EdgeInsets.all(AlpSpacing.s3),
            decoration: BoxDecoration(
              border: Border.all(color: AlpColors.borderDefault),
              borderRadius: BorderRadius.circular(AlpRadius.input),
            ),
            child: Row(
              children: [
                const Icon(Icons.calendar_today, size: 16),
                const SizedBox(width: AlpSpacing.s2),
                Expanded(
                  child: Text(
                    _date == null
                        ? 'Pick a date'
                        : '${_date!.year}-${_date!.month.toString().padLeft(2, '0')}-${_date!.day.toString().padLeft(2, '0')}',
                    style: AlpTextStyles.body.copyWith(
                      color: _date == null
                          ? AlpColors.textMuted
                          : Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AlpSpacing.s3),
        Row(
          children: [
            for (final m in [3, 6, 9, 12]) ...[
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _setPreset(m),
                  child: Text('$m mos'),
                ),
              ),
              if (m != 12) const SizedBox(width: AlpSpacing.s2),
            ],
          ],
        ),
        if (dr != null) ...[
          const SizedBox(height: AlpSpacing.s3),
          Text(
            dr > 0
                ? 'Days remaining: $dr'
                : "That's in the past — pick a future date.",
            style: AlpTextStyles.body,
          ),
        ],
        const SizedBox(height: AlpSpacing.s5),
        SizedBox(
          height: 48,
          child: FilledButton(
            key: const Key('onboarding.target.continue'),
            onPressed: _date == null || _submitting || (dr != null && dr < 0)
                ? null
                : () => _submit(),
            child: const Text('Continue'),
          ),
        ),
        const SizedBox(height: AlpSpacing.s2),
        SizedBox(
          height: 48,
          child: OutlinedButton(
            onPressed: _submitting ? null : () => _submit(skip: true),
            child: const Text('Not sure yet'),
          ),
        ),
      ],
    );
  }
}

class _OnboardingError extends StatelessWidget {
  const _OnboardingError({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AlpSpacing.s3),
      decoration: BoxDecoration(
        color: AlpColors.dangerBg,
        borderRadius: BorderRadius.circular(AlpRadius.panel),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 16, color: AlpColors.dangerFg),
          const SizedBox(width: AlpSpacing.s2),
          Expanded(
            child: Text(message, style: AlpTextStyles.body.copyWith(color: AlpColors.dangerFg)),
          ),
        ],
      ),
    );
  }
}
