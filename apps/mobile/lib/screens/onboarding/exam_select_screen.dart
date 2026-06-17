import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../../aurora/widgets/widgets.dart';
import '../../auth/auth_client.dart';
import '../onboarding_shell.dart';

class Exam {
  Exam({required this.id, required this.code, required this.name, this.subtitle});
  final String id;
  final String code;
  final String name;
  final String? subtitle;
  factory Exam.fromJson(Map<String, dynamic> j) => Exam(
        id: j['id'] as String,
        code: j['code'] as String,
        name: j['name'] as String,
        subtitle: j['subtitle'] as String?,
      );
}

class ExamSelectScreen extends StatefulWidget {
  const ExamSelectScreen({super.key, required this.auth, required this.onContinue});

  final AuthClient auth;
  final VoidCallback onContinue;

  @override
  State<ExamSelectScreen> createState() => _ExamSelectScreenState();
}

class _ExamSelectScreenState extends State<ExamSelectScreen> {
  List<Exam>? _exams;
  String? _selected;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.auth.apiGet('/catalog/exams');
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't load the exam list.");
        return;
      }
      final data = jsonDecode(res.body) as List<dynamic>;
      setState(() {
        _exams = data
            .map((e) => Exam.fromJson(e as Map<String, dynamic>))
            .toList(growable: false);
      });
    } catch (_) {
      setState(() => _error = "We couldn't load the exam list.");
    }
  }

  Future<void> _submit() async {
    if (_selected == null) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final res = await widget.auth.apiPut('/profile/exams', {'examId': _selected});
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't save your selection. Try again.");
        return;
      }
      widget.onContinue();
    } catch (_) {
      setState(() => _error = "We couldn't save your selection. Try again.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return OnboardingShell(
      step: 1,
      title: 'Which exam are you preparing for?',
      description: 'Pick one to get started. You can add more later.',
      children: [
        if (_error != null) ...[
          _ErrorBanner(message: _error!),
          const SizedBox(height: AlpSpacing.s3),
        ],
        if (_exams == null)
          const Center(child: Padding(padding: EdgeInsets.all(16), child: AuroraSpinner(size: 32)))
        else if (_exams!.isEmpty)
          const Text('No exams available yet.', style: AlpTextStyles.hint)
        else
          for (final exam in _exams!) ...[
            _ExamCard(
              exam: exam,
              selected: _selected == exam.id,
              onTap: () => setState(() => _selected = exam.id),
            ),
            const SizedBox(height: AlpSpacing.s3),
          ],
        const SizedBox(height: AlpSpacing.s3),
        SizedBox(
          height: 48,
          child: FilledButton(
            key: const Key('onboarding.exam.continue'),
            onPressed: _selected == null || _submitting ? null : _submit,
            child: const Text('Continue'),
          ),
        ),
      ],
    );
  }
}

class _ExamCard extends StatelessWidget {
  const _ExamCard({required this.exam, required this.selected, required this.onTap});
  final Exam exam;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: Key('onboarding.exam.card.${exam.code}'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(AlpRadius.card),
      child: Container(
        padding: const EdgeInsets.all(AlpSpacing.s4),
        decoration: BoxDecoration(
          color: selected ? AlpColors.brandTint : AlpColors.surfacePrimary,
          border: Border.all(
            color: selected ? AlpColors.brandPrimary : AlpColors.borderDefault,
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(AlpRadius.card),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(exam.name, style: AlpTextStyles.subheading),
                  if (exam.subtitle != null) ...[
                    const SizedBox(height: AlpSpacing.s1),
                    Text(exam.subtitle!, style: AlpTextStyles.hint),
                  ],
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check, color: AlpColors.brandPrimary, size: 20),
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
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
