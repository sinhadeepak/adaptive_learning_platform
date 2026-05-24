// VidyaExamSelectScreen — exam selection with backend persistence.
// Mirrors Aurora's GET /catalog/exams + PUT /profile/exams contract.
// Also writes vidya.selected_exam_{id,code} to FlutterSecureStorage.

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

class VidyaExamSelectScreen extends StatefulWidget {
  const VidyaExamSelectScreen({
    super.key,
    required this.auth,
    required this.onContinue,
    required this.onBack,
  });

  final AuthClient auth;
  final VoidCallback onContinue;
  final VoidCallback onBack;

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
      final res = await widget.auth.apiPut('/profile/exams', {'examId': _selectedId});
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't save your selection. Try again.");
        return;
      }
      await _storage.write(key: 'vidya.selected_exam_id', value: _selectedId);
      await _storage.write(key: 'vidya.selected_exam_code', value: _selectedCode);
      widget.onContinue();
    } catch (_) {
      setState(() => _error = "We couldn't save your selection. Try again.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Title
                      Text(
                        'Which exam are you preparing for?',
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 26,
                          fontWeight: FontWeight.w500,
                          color: v.ink,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      // Subtitle
                      Text(
                        'Pick one to get started. You can add more later.',
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 14,
                          color: v.ink3,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 20),
                      // Error banner
                      if (_error != null) ...[
                        VidyaBanner(
                          message: _error!,
                          tone: VidyaBannerTone.warn,
                          leadingIcon: Icons.warning_amber_rounded,
                        ),
                        const SizedBox(height: 12),
                      ],
                      // Content: loading / empty / list
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
                      // Continue CTA
                      VidyaButton(
                        key: const Key('vidya.exam.continue'),
                        label: 'Continue',
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

    return VidyaCard(
      key: Key('vidya.exam.card.${exam.code}'),
      tone: selected ? VidyaCardTone.accent : VidyaCardTone.defaultTone,
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  exam.name,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: v.ink,
                  ),
                ),
                if (exam.subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    exam.subtitle!,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      color: v.ink3,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (selected)
            Icon(Icons.check_circle, color: v.accent, size: 20),
        ],
      ),
    );
  }
}
