// VidyaPyqScreen — Phase 4. Mirror of web PYQDrill.tsx: browse
// previous-year-question frequency by subject → chapter, then drill a
// chapter's questions read-only with tap-to-reveal answers.
//
// PYQ has no quiz-session mode server-side (web is read-only too), so
// this is a browse/reveal surface, not a graded session.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../api/pyq.dart';
import '../../auth/auth_client.dart';

enum _PyqState { loading, loaded, empty, error }

class VidyaPyqScreen extends StatefulWidget {
  final AuthClient auth;
  final String examId;
  const VidyaPyqScreen({super.key, required this.auth, required this.examId});

  @override
  State<VidyaPyqScreen> createState() => _VidyaPyqScreenState();
}

class _VidyaPyqScreenState extends State<VidyaPyqScreen> {
  _PyqState _state = _PyqState.loading;
  List<Subject> _subjects = const [];
  int _subjectIdx = 0;
  PyqFrequency? _freq;
  bool _loadingFreq = false;

  @override
  void initState() {
    super.initState();
    _loadSubjects();
  }

  Future<void> _loadSubjects() async {
    if (!mounted) return;
    setState(() => _state = _PyqState.loading);
    if (widget.examId.isEmpty) {
      setState(() => _state = _PyqState.empty);
      return;
    }
    try {
      final subjects = await ApiClient(widget.auth).subjectsForExam(widget.examId);
      if (!mounted) return;
      if (subjects.isEmpty) {
        setState(() => _state = _PyqState.empty);
        return;
      }
      setState(() {
        _subjects = subjects;
        _subjectIdx = 0;
        _state = _PyqState.loaded;
      });
      await _loadFreq(subjects.first.id);
    } catch (_) {
      if (mounted) setState(() => _state = _PyqState.error);
    }
  }

  Future<void> _loadFreq(String subjectId) async {
    setState(() => _loadingFreq = true);
    try {
      final freq = await PyqClient(widget.auth)
          .frequency(examId: widget.examId, subjectId: subjectId);
      if (mounted) setState(() => _freq = freq);
    } catch (_) {
      if (mounted) setState(() => _freq = null);
    } finally {
      if (mounted) setState(() => _loadingFreq = false);
    }
  }

  void _selectSubject(int i) {
    if (i == _subjectIdx) return;
    setState(() {
      _subjectIdx = i;
      _freq = null;
    });
    _loadFreq(_subjects[i].id);
  }

  void _openChapter(PyqChapterFreq chapter) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _PyqQuestionsScreen(
          auth: widget.auth,
          topicId: chapter.topicId,
          topicTitle: chapter.topicTitle,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return VidyaScaffold(
      appBar: VidyaAppBar(title: 'Previous-year questions'),
      body: switch (_state) {
        _PyqState.loading => const Center(child: CircularProgressIndicator()),
        _PyqState.error => _PyqError(onRetry: _loadSubjects),
        _PyqState.empty => const _PyqEmpty(),
        _PyqState.loaded => _buildLoaded(),
      },
    );
  }

  Widget _buildLoaded() {
    final v = VidyaThemeData.of(context);
    final chapters = _freq?.chapters ?? const <PyqChapterFreq>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        SizedBox(
          height: 36,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: _subjects.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (ctx, i) {
              final selected = i == _subjectIdx;
              return GestureDetector(
                onTap: () => _selectSubject(i),
                child: Container(
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    color: selected ? v.accent : v.ink3.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _subjects[i].name,
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
        const SizedBox(height: 12),
        Expanded(
          child: _loadingFreq
              ? const Center(child: CircularProgressIndicator())
              : chapters.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          'No previous-year questions catalogued for this '
                          'subject yet.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 14,
                            color: v.ink2,
                            height: 1.4,
                          ),
                        ),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                      itemCount: chapters.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (ctx, i) => _ChapterFreqCard(
                        chapter: chapters[i],
                        onTap: () => _openChapter(chapters[i]),
                      ),
                    ),
        ),
      ],
    );
  }
}

class _ChapterFreqCard extends StatelessWidget {
  final PyqChapterFreq chapter;
  final VoidCallback onTap;
  const _ChapterFreqCard({required this.chapter, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final years = chapter.years.take(6).toList();
    return VidyaCard(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    chapter.topicTitle.isEmpty ? 'Topic' : chapter.topicTitle,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      for (final y in years)
                        Text(
                          "'${y % 100}·${chapter.yearCounts[y]}",
                          style: TextStyle(
                            fontFamily: VidyaFonts.mono,
                            fontSize: 10,
                            color: v.ink3,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              children: [
                Text(
                  '${chapter.total}',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: v.accent,
                    height: 1,
                  ),
                ),
                Text(
                  'asked',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 9,
                    color: v.ink3,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right, color: v.ink3, size: 22),
          ],
        ),
      ),
    );
  }
}

// ── Read-only question drill ────────────────────────────────────────

class _PyqQuestionsScreen extends StatefulWidget {
  final AuthClient auth;
  final String topicId;
  final String topicTitle;
  const _PyqQuestionsScreen({
    required this.auth,
    required this.topicId,
    required this.topicTitle,
  });

  @override
  State<_PyqQuestionsScreen> createState() => _PyqQuestionsScreenState();
}

class _PyqQuestionsScreenState extends State<_PyqQuestionsScreen> {
  _PyqState _state = _PyqState.loading;
  List<PyqQuestion> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _PyqState.loading);
    try {
      final res = await PyqClient(widget.auth).list(widget.topicId);
      if (!mounted) return;
      setState(() {
        _items = res.items;
        _state = res.items.isEmpty ? _PyqState.empty : _PyqState.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _PyqState.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return VidyaScaffold(
      appBar: VidyaAppBar(title: widget.topicTitle),
      body: switch (_state) {
        _PyqState.loading => const Center(child: CircularProgressIndicator()),
        _PyqState.error => _PyqError(onRetry: _load),
        _PyqState.empty => const _PyqEmpty(),
        _PyqState.loaded => ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            itemCount: _items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (ctx, i) => _PyqQuestionCard(question: _items[i], index: i),
          ),
      },
    );
  }
}

class _PyqQuestionCard extends StatefulWidget {
  final PyqQuestion question;
  final int index;
  const _PyqQuestionCard({required this.question, required this.index});

  @override
  State<_PyqQuestionCard> createState() => _PyqQuestionCardState();
}

class _PyqQuestionCardState extends State<_PyqQuestionCard> {
  bool _revealed = false;

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final q = widget.question;
    final tag = [
      if (q.examYear != null) "'${q.examYear! % 100}",
      if (q.paperSession != null && q.paperSession!.isNotEmpty) q.paperSession,
    ].whereType<String>().join(' · ');
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Q${widget.index + 1}',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: v.ink3,
                  ),
                ),
                const Spacer(),
                if (tag.isNotEmpty)
                  Text(
                    tag,
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      color: v.ink3,
                      letterSpacing: 0.5,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              q.stem,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 15,
                height: 1.4,
                color: v.ink,
              ),
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < q.choices.length; i++)
              _PyqChoice(
                letter: String.fromCharCode(65 + i),
                text: q.choices[i],
                isCorrect: _revealed && i == q.correctIdx,
              ),
            const SizedBox(height: 4),
            if (!_revealed)
              VidyaButton(
                label: 'Reveal answer',
                style: VidyaButtonStyle.ghost,
                onPressed: () => setState(() => _revealed = true),
                size: VidyaButtonSize.md,
              )
            else
              Text(
                'Answer: ${q.correctIdx >= 0 ? String.fromCharCode(65 + q.correctIdx) : "—"}',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: v.good,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PyqChoice extends StatelessWidget {
  final String letter;
  final String text;
  final bool isCorrect;
  const _PyqChoice({
    required this.letter,
    required this.text,
    required this.isCorrect,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isCorrect ? v.good.withValues(alpha: 0.10) : null,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isCorrect ? v.good : v.ink3.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        children: [
          Text(
            '$letter.',
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontWeight: FontWeight.w700,
              color: isCorrect ? v.good : v.ink3,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink,
              ),
            ),
          ),
          if (isCorrect) Icon(Icons.check, size: 18, color: v.good),
        ],
      ),
    );
  }
}

class _PyqEmpty extends StatelessWidget {
  const _PyqEmpty();

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          'No previous-year questions here yet.',
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

class _PyqError extends StatelessWidget {
  final VoidCallback onRetry;
  const _PyqError({required this.onRetry});

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
            message: "We couldn't load previous-year questions.",
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
