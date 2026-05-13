// Course lesson player — mobile mirror of the web CourseRead.tsx.
// Loads `/marketplace/courses/{id}/structure` and renders a phone-
// friendly module → lesson reader with markdown bodies.
//
// Mobile UX shape (different from web's two-pane layout):
//
//   • Module list at the top (collapsible accordion).
//   • Tap a lesson → push a focused full-screen reader.
//   • A persistent "Continue" hint at the top routes back to the
//     last-read lesson (per-course, in-memory only for now; a future
//     sprint adds shared_preferences-backed persistence).
//
// Falls back to the course's `contentMd` blob if the structure call
// returns no modules, mirroring the web's fallback behaviour.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

import '../../api/marketplace.dart';
import '../../widgets/alp_card.dart';

class CourseReadScreen extends StatefulWidget {
  const CourseReadScreen({
    super.key,
    required this.client,
    required this.courseId,
    required this.courseTitle,
    this.fallbackContentMd,
  });

  final MarketplaceClient client;
  final String courseId;
  final String courseTitle;
  // The course's top-level `contentMd` field — used when the structure
  // call returns zero modules so the reader still has something to
  // show.
  final String? fallbackContentMd;

  @override
  State<CourseReadScreen> createState() => _CourseReadScreenState();
}

class _CourseReadScreenState extends State<CourseReadScreen> {
  CourseStructure? _structure;
  String? _error;
  bool _loading = true;
  String? _lastLessonId; // in-memory "continue" pointer

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await widget.client.courseStructure(widget.courseId);
      if (!mounted) return;
      setState(() {
        _structure = s;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  void _openLesson(LessonItem lesson, ModuleItem module) {
    setState(() => _lastLessonId = lesson.id);
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _LessonReader(
        lesson: lesson,
        moduleTitle: module.title,
        courseTitle: widget.courseTitle,
        contentVisible: _structure?.contentVisible ?? false,
      ),
    ),);
  }

  @override
  Widget build(BuildContext context) {
    final s = _structure;
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(title: Text(widget.courseTitle)),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AlpColors.colorAi),)
          : _error != null
              ? _buildError(_error!)
              : (s == null || s.modules.isEmpty)
                  ? _buildContentMdFallback()
                  : _buildStructure(s),
    );
  }

  Widget _buildError(String msg) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(msg,
              style: const TextStyle(color: AlpColors.colorRed, fontSize: 13),),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: () => setState(() {
              _loading = true;
              _error = null;
              _load();
            }),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  Widget _buildContentMdFallback() {
    final md = widget.fallbackContentMd?.trim() ?? '';
    if (md.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Text(
            "This course doesn't have any modules or lesson content yet. The creator is still authoring it.",
            textAlign: TextAlign.center,
            style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
          ),
        ),
      );
    }
    return Markdown(
      data: md,
      padding: const EdgeInsets.all(20),
      styleSheet: _markdownStyle(context),
    );
  }

  Widget _buildStructure(CourseStructure s) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        if (!s.contentVisible) ...[
          AlpCard(
            padding: const EdgeInsets.all(14),
            borderColor: AlpColors.colorAmber.withValues(alpha: 0.4),
            child: const Row(
              children: [
                Icon(Icons.lock_outline, color: AlpColors.colorAmber, size: 22),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Preview mode — buy this course to unlock full lesson content. You can still see the module / lesson layout below.',
                    style: TextStyle(
                        color: AlpColors.textSecondary,
                        fontSize: 12,
                        height: 1.4,),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        // "Continue" pointer — only when something has been opened in
        // this session. Persists across module collapses but resets
        // when the user pops the screen (no shared_preferences yet).
        if (_lastLessonId != null) ...[
          AlpCard(
            onTap: () {
              for (final m in s.modules) {
                for (final l in m.lessons) {
                  if (l.id == _lastLessonId) {
                    _openLesson(l, m);
                    return;
                  }
                }
              }
            },
            padding: const EdgeInsets.all(14),
            borderColor: AlpColors.colorAi.withValues(alpha: 0.4),
            child: Row(
              children: [
                const Icon(Icons.replay_rounded,
                    color: AlpColors.colorAi, size: 22,),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Continue where you left off',
                    style: TextStyle(
                        color: AlpColors.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,),
                  ),
                ),
                const Icon(Icons.chevron_right,
                    color: AlpColors.textMuted, size: 18,),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        ...s.modules.map((m) => _ModuleTile(
              module: m,
              onLessonTap: (l) => _openLesson(l, m),
            ),),
      ],
    );
  }
}

class _ModuleTile extends StatelessWidget {
  const _ModuleTile({required this.module, required this.onLessonTap});
  final ModuleItem module;
  final void Function(LessonItem) onLessonTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AlpCard(
        padding: EdgeInsets.zero,
        child: Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            iconColor: AlpColors.textMuted,
            collapsedIconColor: AlpColors.textMuted,
            tilePadding: const EdgeInsets.symmetric(horizontal: 14),
            childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
            title: Text(
              'Module ${module.position}: ${module.title}',
              style: const TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,),
            ),
            subtitle: module.description == null || module.description!.isEmpty
                ? null
                : Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      module.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: AlpColors.textMuted,
                          fontSize: 12,
                          height: 1.3,),
                    ),
                  ),
            children: module.lessons.isEmpty
                ? const [
                    Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Text('No lessons yet.',
                          style: TextStyle(
                              color: AlpColors.textMuted, fontSize: 12,),),
                    ),
                  ]
                : module.lessons
                    .map((l) => ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          leading: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: AlpColors.colorAi.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Center(
                              child: Text('${l.position}',
                                  style: const TextStyle(
                                      color: AlpColors.colorAi,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12,),),
                            ),
                          ),
                          title: Text(l.title,
                              style: const TextStyle(
                                  color: AlpColors.textPrimary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,),),
                          subtitle: l.durationSeconds == null
                              ? null
                              : Text(_formatDuration(l.durationSeconds!),
                                  style: const TextStyle(
                                      color: AlpColors.textMuted,
                                      fontSize: 11,),),
                          trailing: const Icon(Icons.chevron_right,
                              color: AlpColors.textMuted, size: 18,),
                          onTap: () => onLessonTap(l),
                        ),)
                    .toList(),
          ),
        ),
      ),
    );
  }

  static String _formatDuration(int seconds) {
    final minutes = seconds ~/ 60;
    final remainder = seconds % 60;
    if (minutes == 0) return '${remainder}s';
    if (remainder == 0) return '${minutes}m';
    return '${minutes}m ${remainder}s';
  }
}

class _LessonReader extends StatelessWidget {
  const _LessonReader({
    required this.lesson,
    required this.moduleTitle,
    required this.courseTitle,
    required this.contentVisible,
  });

  final LessonItem lesson;
  final String moduleTitle;
  final String courseTitle;
  final bool contentVisible;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(title: Text(lesson.title)),
      body: !contentVisible || lesson.contentMd.trim().isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.lock_outline,
                        color: AlpColors.colorAmber, size: 36,),
                    const SizedBox(height: 12),
                    Text(
                      contentVisible
                          ? 'No content authored for this lesson yet.'
                          : 'Buy this course to unlock the full lesson body.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: AlpColors.textSecondary,
                          fontSize: 14,
                          height: 1.4,),
                    ),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              children: [
                Text(
                  moduleTitle,
                  style: const TextStyle(
                      color: AlpColors.textMuted,
                      fontSize: 11,
                      letterSpacing: 0.8,
                      fontWeight: FontWeight.w700,),
                ),
                const SizedBox(height: 4),
                Text(
                  lesson.title,
                  style: const TextStyle(
                      color: AlpColors.textPrimary,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,),
                ),
                const SizedBox(height: 16),
                MarkdownBody(
                  data: lesson.contentMd,
                  styleSheet: _markdownStyle(context),
                ),
              ],
            ),
    );
  }
}

MarkdownStyleSheet _markdownStyle(BuildContext context) {
  return MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
    p: const TextStyle(
        color: AlpColors.textSecondary, fontSize: 14, height: 1.55,),
    h1: const TextStyle(
        color: AlpColors.textPrimary, fontSize: 22, fontWeight: FontWeight.w700,),
    h2: const TextStyle(
        color: AlpColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w700,),
    h3: const TextStyle(
        color: AlpColors.textPrimary, fontSize: 15, fontWeight: FontWeight.w700,),
    code: const TextStyle(
        color: AlpColors.colorAi,
        fontFamily: 'monospace',
        fontSize: 13,
        backgroundColor: AlpColors.bgSurface3,),
    blockquote: const TextStyle(
        color: AlpColors.textMuted,
        fontSize: 13,
        fontStyle: FontStyle.italic,),
  );
}
