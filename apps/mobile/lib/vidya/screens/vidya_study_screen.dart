// VidyaStudyScreen — Phase 3b v1. Subject list for the user's active
// exam. Per-subject mastery + native subject-detail screens are
// deferred to Phase 3b.full; v1 just lists subjects and shows a
// snackbar on tap.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../state/active_exam_notifier.dart';
import '../widgets/vidya_exam_switcher.dart';
import 'vidya_subject_detail_screen.dart';

class VidyaStudyScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaStudyScreen({super.key, required this.auth});

  @override
  State<VidyaStudyScreen> createState() => _VidyaStudyScreenState();
}

enum _StudyState { loading, loaded, empty, error }

class _StudyData {
  final String examName;
  final List<Subject> subjects;
  const _StudyData({required this.examName, required this.subjects});
}

class _VidyaStudyScreenState extends State<VidyaStudyScreen> {
  _StudyState _state = _StudyState.loading;
  _StudyData? _data;

  // Active-exam spine: reload subjects whenever the student switches exam.
  VidyaActiveExamNotifier? _examNotifier;
  String? _loadedExamId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final n = VidyaActiveExam.of(context);
    if (!identical(n, _examNotifier)) {
      _examNotifier?.removeListener(_onActiveExamChanged);
      _examNotifier = n;
      _examNotifier?.addListener(_onActiveExamChanged);
      _onActiveExamChanged();
    }
  }

  @override
  void dispose() {
    _examNotifier?.removeListener(_onActiveExamChanged);
    super.dispose();
  }

  void _onActiveExamChanged() {
    final n = _examNotifier;
    if (n == null) return;
    if (n.loading) return;
    final active = n.active;
    if (active == null) {
      _loadedExamId = null;
      if (mounted) setState(() => _state = _StudyState.empty);
      return;
    }
    if (active.examId != _loadedExamId) {
      _loadedExamId = active.examId;
      _load();
    }
  }

  Future<void> _load() async {
    final exam = _examNotifier?.active;
    if (exam == null) {
      if (mounted) setState(() => _state = _StudyState.empty);
      return;
    }
    if (!mounted) return;
    setState(() => _state = _StudyState.loading);
    try {
      final api = ApiClient(widget.auth);
      final subjects = await api.subjectsForExam(exam.examId);
      if (!mounted) return;
      setState(() {
        _data = _StudyData(examName: exam.name, subjects: subjects);
        _state = _StudyState.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _StudyState.error);
    }
  }

  void _onSubjectTap(Subject s) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => VidyaSubjectDetailScreen(
        auth: widget.auth,
        subject: s,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    switch (_state) {
      case _StudyState.loading:
        return const _StudySkeleton();
      case _StudyState.empty:
        return _EmptyState(v: v);
      case _StudyState.error:
        return _ErrorState(onRetry: _load, v: v);
      case _StudyState.loaded:
        final d = _data!;
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'STUDY',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      color: v.ink3,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
                const VidyaExamPill(),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              d.examName,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 32,
                fontWeight: FontWeight.w500,
                color: v.ink,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 16),
            for (final s in d.subjects) ...[
              _SubjectCard(subject: s, onTap: () => _onSubjectTap(s)),
              const SizedBox(height: 10),
            ],
          ],
        );
    }
  }
}

class _SubjectCard extends StatelessWidget {
  final Subject subject;
  final VoidCallback onTap;
  const _SubjectCard({required this.subject, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'SUBJECT • ${subject.topicCount} topics',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 10,
                  color: v.ink3,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subject.name,
                style: TextStyle(
                  fontFamily: VidyaFonts.display,
                  fontSize: 22,
                  fontWeight: FontWeight.w500,
                  color: v.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VidyaThemeData v;
  const _EmptyState({required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'NO EXAM YET',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 10,
                    color: v.ink3,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'No exam selected',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    color: v.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Pick an exam during onboarding to see its subjects here.',
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 14,
                    color: v.ink2,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
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
              "We couldn't load your subjects.",
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

class _StudySkeleton extends StatelessWidget {
  const _StudySkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        const VidyaSkeletonBlock(width: 80, height: 12),
        const SizedBox(height: 10),
        const VidyaSkeletonBlock(width: 200, height: 30),
        const SizedBox(height: 20),
        for (var i = 0; i < 4; i++) ...[
          VidyaCard(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  VidyaSkeletonBlock(width: 120, height: 10),
                  SizedBox(height: 8),
                  VidyaSkeletonBlock(width: 160, height: 22),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}
