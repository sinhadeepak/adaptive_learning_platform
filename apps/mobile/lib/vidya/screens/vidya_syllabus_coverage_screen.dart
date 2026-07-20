// VidyaSyllabusCoverageScreen — Phase 4. Mirror of web's
// SyllabusCoverage.tsx: per-subject chapter coverage matrix from
// /analytics/syllabus-coverage/{userId}?examId=. Subject pills switch the
// visible subject; each chapter shows a coverage status + attempted/total
// progress.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/analytics.dart';
import '../../auth/auth_client.dart';

enum _CovState { loading, loaded, empty, error }

class VidyaSyllabusCoverageScreen extends StatefulWidget {
  final AuthClient auth;
  final String examId;
  const VidyaSyllabusCoverageScreen({
    super.key,
    required this.auth,
    required this.examId,
  });

  @override
  State<VidyaSyllabusCoverageScreen> createState() =>
      _VidyaSyllabusCoverageScreenState();
}

class _VidyaSyllabusCoverageScreenState
    extends State<VidyaSyllabusCoverageScreen> {
  _CovState _state = _CovState.loading;
  SyllabusCoverage? _data;
  int _subjectIdx = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _state = _CovState.loading);
    final user = widget.auth.user;
    if (user == null || widget.examId.isEmpty) {
      setState(() => _state = _CovState.empty);
      return;
    }
    try {
      final data = await AnalyticsClient(widget.auth)
          .syllabusCoverage(user.id, examId: widget.examId);
      if (!mounted) return;
      if (data == null || data.subjects.isEmpty) {
        setState(() => _state = _CovState.empty);
        return;
      }
      setState(() {
        _data = data;
        _subjectIdx = 0;
        _state = _CovState.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _CovState.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return VidyaScaffold(
      appBar: VidyaAppBar(title: 'Syllabus coverage'),
      body: switch (_state) {
        _CovState.loading => const Center(child: CircularProgressIndicator()),
        _CovState.error => _CovError(onRetry: _load),
        _CovState.empty => const _CovEmpty(),
        _CovState.loaded => _buildLoaded(_data!),
      },
    );
  }

  Widget _buildLoaded(SyllabusCoverage d) {
    final v = VidyaThemeData.of(context);
    final subject = d.subjects[_subjectIdx];
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        // Overall coverage headline.
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${d.overallPct}%',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 44,
                fontWeight: FontWeight.w600,
                color: v.accent,
                height: 1,
              ),
            ),
            const SizedBox(width: 10),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                '${d.masteredTopics}/${d.totalTopics} topics mastered',
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink2,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // Subject pills.
        SizedBox(
          height: 36,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: d.subjects.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (ctx, i) {
              final s = d.subjects[i];
              final selected = i == _subjectIdx;
              return GestureDetector(
                onTap: () => setState(() => _subjectIdx = i),
                child: Container(
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    color: selected ? v.accent : v.ink3.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    s.name,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: selected ? Colors.white : v.ink2,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        Text(
          '${subject.coveredChapters}/${subject.totalChapters} chapters covered',
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 12),
        for (final c in subject.chapters) ...[
          _ChapterRow(chapter: c),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _ChapterRow extends StatelessWidget {
  final CoverageChapter chapter;
  const _ChapterRow({required this.chapter});

  ({String label, Color tone}) _status(VidyaThemeData v) {
    switch (chapter.status) {
      case 'mastered':
        return (label: 'MASTERED', tone: v.good);
      case 'developing':
        return (label: 'DEVELOPING', tone: v.info);
      case 'missing':
        return (label: 'NO CONTENT', tone: v.ink3);
      default:
        return (label: 'NOT STARTED', tone: v.ink3);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final s = _status(v);
    final progress = chapter.totalTopics > 0
        ? (chapter.attemptedTopics / chapter.totalTopics).clamp(0.0, 1.0)
        : 0.0;
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    chapter.name.isEmpty ? 'Chapter' : chapter.name,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: s.tone.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    s.label,
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: s.tone,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 4,
                backgroundColor: v.ink3.withValues(alpha: 0.15),
                valueColor: AlwaysStoppedAnimation<Color>(s.tone),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '${chapter.attemptedTopics}/${chapter.totalTopics} topics attempted'
              '  ·  ${chapter.masteredTopics} mastered',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CovEmpty extends StatelessWidget {
  const _CovEmpty();

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          'No syllabus coverage yet. Start practising to map your '
          'progress across the syllabus.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 14,
            color: v.ink2,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}

class _CovError extends StatelessWidget {
  final VoidCallback onRetry;
  const _CovError({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          VidyaBanner(
            tone: VidyaBannerTone.warn,
            message: "We couldn't load your syllabus coverage.",
            action: TextButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ),
        ],
      ),
    );
  }
}
