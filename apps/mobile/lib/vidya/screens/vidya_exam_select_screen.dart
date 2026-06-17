// VidyaExamSelectScreen — exam selection with backend persistence.
// Mirrors Aurora's GET /catalog/exams + PUT /profile/exams contract.
// Writes vidya.selected_exam_{id,code} to FlutterSecureStorage so
// downstream Vidya screens (screening, home) can re-read it.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../auth/auth_client.dart';

class _Exam {
  const _Exam({
    required this.id,
    required this.code,
    required this.name,
    this.subtitle,
  });

  final String id;
  final String code;
  final String name;
  final String? subtitle;

  factory _Exam.fromJson(Map<String, dynamic> j) => _Exam(
        id: j['id'] as String,
        code: j['code'] as String,
        name: j['name'] as String,
        subtitle: j['subtitle'] as String?,
      );
}

// Aspirant counts are currently hardcoded by exam code. Backend
// migration tracked under Phase 4 — extend /catalog/exams to include
// an `aspirants_label` field; then this lookup goes away.
const _aspirantLookup = <String, String>{
  'NEET': '2.4M aspirants',
  'JEE': '1.2M aspirants',
  'JEE-MAIN': '1.2M aspirants',
  'JEE-ADVANCED': '180K aspirants',
  'UPSC': '900K aspirants',
  'CBSE': '1.8M students',
  'GATE': '850K aspirants',
};

String? _aspirantLabel(String code) =>
    _aspirantLookup[code.toUpperCase()];

enum ExamSelectMode { authed, guest }

class VidyaExamSelectScreen extends StatefulWidget {
  const VidyaExamSelectScreen({
    super.key,
    required this.auth,
    required this.onContinue,
    required this.onBack,
    this.mode = ExamSelectMode.authed,
  });

  final AuthClient auth;
  final VoidCallback onContinue;
  final VoidCallback onBack;
  final ExamSelectMode mode;

  @override
  State<VidyaExamSelectScreen> createState() => _VidyaExamSelectScreenState();
}

class _VidyaExamSelectScreenState extends State<VidyaExamSelectScreen> {
  List<_Exam>? _exams;
  String? _selectedId;
  String? _selectedCode;
  String? _error;
  bool _submitting = false;

  static const _storage = FlutterSecureStorage();

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
            .map((e) => _Exam.fromJson(e as Map<String, dynamic>))
            .toList(growable: false);
      });
    } catch (_) {
      setState(() => _error = "We couldn't load the exam list.");
    }
  }

  Future<void> _submit() async {
    if (_selectedId == null) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      if (widget.mode == ExamSelectMode.authed) {
        final res = await widget.auth.apiPut(
          '/profile/exams',
          {'examId': _selectedId},
        );
        if (res.statusCode != 200) {
          setState(() => _error = "We couldn't save your selection. Try again.");
          return;
        }
      }
      await _storage.write(key: 'vidya.selected_exam_id', value: _selectedId);
      await _storage.write(
        key: 'vidya.selected_exam_code',
        value: _selectedCode,
      );
      widget.onContinue();
    } catch (_) {
      setState(() => _error = "We couldn't save your selection. Try again.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _continueLabel() {
    if (_selectedCode == null) return 'Continue';
    return 'Continue with $_selectedCode →';
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'STEP 1 / 3',
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 2,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Choose your exam',
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 28,
                          fontWeight: FontWeight.w500,
                          color: v.ink,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'We tune everything to one exam — the syllabus, the '
                        'difficulty, the scoring model.',
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 14,
                          color: v.ink3,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 20),
                      if (_error != null) ...[
                        VidyaBanner(
                          message: _error!,
                          tone: VidyaBannerTone.warn,
                          leadingIcon: Icons.warning_amber_rounded,
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (_exams == null)
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: CircularProgressIndicator(),
                          ),
                        )
                      else if (_exams!.isEmpty)
                        Text(
                          'No exams available yet.',
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 14,
                            color: v.ink3,
                          ),
                        )
                      else
                        for (final exam in _exams!) ...[
                          _ExamCard(
                            exam: exam,
                            selected: _selectedId == exam.id,
                            onTap: () => setState(() {
                              _selectedId = exam.id;
                              _selectedCode = exam.code;
                            }),
                          ),
                          const SizedBox(height: 10),
                        ],
                      const Spacer(),
                      const SizedBox(height: 16),
                      VidyaButton(
                        key: const Key('vidya.exam.continue'),
                        label: _continueLabel(),
                        onPressed: _selectedId != null && !_submitting
                            ? _submit
                            : null,
                        style: VidyaButtonStyle.primary,
                        size: VidyaButtonSize.lg,
                        fullWidth: true,
                        loading: _submitting,
                        disabled: _selectedId == null,
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ExamCard extends StatelessWidget {
  const _ExamCard({
    required this.exam,
    required this.selected,
    required this.onTap,
  });

  final _Exam exam;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final aspirants = _aspirantLabel(exam.code);

    return VidyaCard(
      key: Key('vidya.exam.card.${exam.code}'),
      tone: selected ? VidyaCardTone.accent : VidyaCardTone.defaultTone,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: selected
                    ? v.accent
                    : v.accent.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Text(
                exam.code,
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  color: selected ? Colors.white : v.accent,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    exam.name,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                  if (exam.subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      exam.subtitle!,
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 12,
                        color: v.ink3,
                      ),
                    ),
                  ],
                  if (aspirants != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      aspirants,
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 11,
                        color: v.ink3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              selected ? Icons.check_circle : Icons.radio_button_unchecked,
              color: selected ? v.accent : v.ink3.withValues(alpha: 0.4),
              size: 22,
            ),
          ],
        ),
      ),
    );
  }
}
