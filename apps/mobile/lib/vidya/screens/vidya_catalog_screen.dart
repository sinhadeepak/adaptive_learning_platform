// VidyaCatalogScreen — Phase B (deferred item). Browse every exam in the
// catalog and enrol in another one (mirrors web's Catalog browse + AddExam).
// Gives the exam switcher's "Add another exam" affordance a real
// destination — the keystone for the app's multi-exam support.
//
// Marketplace surfaces (courses / tutors) that the web Catalog also hosts
// land in Phase E; this is the exam-catalog half.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaCatalogScreen extends StatefulWidget {
  final AuthClient auth;

  /// Called after a successful enrol so the caller can refresh the active-
  /// exam spine (the screen is pushed outside the shell subtree, so it can't
  /// reach the VidyaActiveExam notifier itself).
  final VoidCallback? onExamAdded;
  const VidyaCatalogScreen({super.key, required this.auth, this.onExamAdded});

  @override
  State<VidyaCatalogScreen> createState() => _VidyaCatalogScreenState();
}

enum _State { loading, loaded, error }

class _VidyaCatalogScreenState extends State<VidyaCatalogScreen> {
  _State _state = _State.loading;
  List<Exam> _exams = const [];
  Set<String> _enrolled = const {};
  String? _adding; // examId currently being added

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    try {
      final api = ApiClient(widget.auth);
      final exams = await api.exams();
      final profile = await api.getProfile();
      if (!mounted) return;
      setState(() {
        _exams = exams;
        _enrolled = {for (final e in profile?.exams ?? const []) e.examId};
        _state = _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  Future<void> _add(Exam exam) async {
    setState(() => _adding = exam.id);
    final profile = await ApiClient(widget.auth).addExam(exam.id);
    if (!mounted) return;
    setState(() {
      _adding = null;
      if (profile != null) {
        _enrolled = {..._enrolled, exam.id};
      }
    });
    if (profile != null) {
      widget.onExamAdded?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added ${exam.name} to your exams.')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't add that exam. Try again.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Exam catalog',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.loaded => ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            children: [
              Text(
                'ALL EXAMS',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: v.ink3,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 12),
              for (final e in _exams) ...[
                _ExamCard(
                  exam: e,
                  enrolled: _enrolled.contains(e.id),
                  adding: _adding == e.id,
                  onAdd: () => _add(e),
                ),
                const SizedBox(height: 10),
              ],
            ],
          ),
      },
    );
  }
}

class _ExamCard extends StatelessWidget {
  final Exam exam;
  final bool enrolled;
  final bool adding;
  final VoidCallback onAdd;
  const _ExamCard({
    required this.exam,
    required this.enrolled,
    required this.adding,
    required this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    exam.code.toUpperCase(),
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      color: v.ink3,
                      letterSpacing: 1.4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    exam.name,
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 19,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                    ),
                  ),
                  if (exam.subtitle != null && exam.subtitle!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      exam.subtitle!,
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 13,
                        color: v.ink2,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 12),
            if (enrolled)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: v.good.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'Enrolled',
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: v.good,
                  ),
                ),
              )
            else
              VidyaButton(
                label: adding ? 'Adding…' : 'Add',
                onPressed: adding ? null : onAdd,
                size: VidyaButtonSize.sm,
              ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;
  final VidyaThemeData v;
  const _ErrorState({required this.onRetry, required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              "We couldn't load the catalog.",
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 15,
                color: v.ink2,
              ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: 'Retry',
              onPressed: onRetry,
              size: VidyaButtonSize.md,
            ),
          ],
        ),
      ),
    );
  }
}
