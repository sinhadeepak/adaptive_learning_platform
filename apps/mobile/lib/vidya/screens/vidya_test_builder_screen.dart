// VidyaTestBuilderScreen — Phase B. Build a custom practice test (mirrors
// web's TestBuilder): pick a subject + topic, difficulty, and length, then
// author a CUSTOM blueprint and launch it as a mock session. Reached from
// the Practice → "Build a Test" card.
//
// Authors via POST /catalog/exam-blueprints/custom (ApiClient.create­Custom­
// Blueprint) and starts the returned blueprint through the existing mock
// session runner. Pushed outside the shell subtree → exam passed as params.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_mock_session_screen.dart';
import 'vidya_practice_result_screen.dart';

class VidyaTestBuilderScreen extends StatefulWidget {
  final AuthClient auth;
  final String examId;
  final String examName;
  const VidyaTestBuilderScreen({
    super.key,
    required this.auth,
    required this.examId,
    required this.examName,
  });

  @override
  State<VidyaTestBuilderScreen> createState() => _VidyaTestBuilderScreenState();
}

class _VidyaTestBuilderScreenState extends State<VidyaTestBuilderScreen> {
  static const _difficulties = ['easy', 'mixed', 'hard'];
  static const _counts = [5, 10, 20];

  bool _loading = true;
  bool _error = false;
  bool _building = false;
  String? _buildError;

  List<Subject> _subjects = const [];
  List<Topic> _topics = const [];
  Subject? _subject;
  Topic? _topic;
  String _difficulty = 'mixed';
  int _count = 10;

  @override
  void initState() {
    super.initState();
    _loadSubjects();
  }

  Future<void> _loadSubjects() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final subjects =
          await ApiClient(widget.auth).subjectsForExam(widget.examId);
      if (!mounted) return;
      setState(() {
        _subjects = subjects;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = true;
          _loading = false;
        });
      }
    }
  }

  Future<void> _onSubjectChanged(Subject? s) async {
    setState(() {
      _subject = s;
      _topic = null;
      _topics = const [];
    });
    if (s == null) return;
    try {
      final topics = await ApiClient(widget.auth).topicsForSubject(s.id);
      if (!mounted) return;
      setState(() => _topics = topics);
    } catch (_) {/* leave empty; build button stays disabled */}
  }

  Future<void> _build() async {
    final topic = _topic;
    final subject = _subject;
    if (topic == null || subject == null) return;
    setState(() {
      _building = true;
      _buildError = null;
    });
    try {
      final id = await ApiClient(widget.auth).createCustomBlueprint(
        examId: widget.examId,
        name: 'Custom · ${topic.title} · ${_count}Q',
        sectionName: subject.name,
        subjectId: subject.id,
        topicIds: [topic.id],
        nQuestions: _count,
        nMinutes: _count, // ~1 min / question
        difficultyBand: _difficulty,
      );
      if (!mounted) return;
      _launch(id, topic.title);
    } on ApiException catch (e) {
      if (mounted) setState(() => _buildError = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _buildError = "Couldn't build the test. Try again.");
      }
    } finally {
      if (mounted) setState(() => _building = false);
    }
  }

  void _launch(String blueprintId, String topicTitle) {
    final userId = widget.auth.user?.id ?? '';
    if (userId.isEmpty) return;
    final client = QuizClient(auth: widget.auth);
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => VidyaMockSessionScreen(
          client: client,
          blueprintId: blueprintId,
          blueprintName: 'Custom · $topicTitle',
          userId: userId,
          itemCount: _count,
          totalMinutes: _count,
          onCompleted: (sessionId) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute<void>(
                builder: (_) => VidyaPracticeResultScreen(
                  client: client,
                  sessionId: sessionId,
                  onDone: () => Navigator.of(context).pop(),
                ),
              ),
            );
          },
          onBack: () => Navigator.of(context).pop(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Build a test',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error
              ? _ErrorState(onRetry: _loadSubjects, v: v)
              : _form(v),
    );
  }

  Widget _form(VidyaThemeData v) {
    final canBuild = _topic != null && !_building;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        Text(
          'PRACTICE · ${widget.examName.toUpperCase()}',
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Build a test',
          style: TextStyle(
            fontFamily: VidyaFonts.display,
            fontSize: 28,
            fontWeight: FontWeight.w500,
            color: v.ink,
          ),
        ),
        const SizedBox(height: 20),
        _Label(text: 'SUBJECT', v: v),
        const SizedBox(height: 8),
        _SubjectDropdown(
          subjects: _subjects,
          value: _subject,
          onChanged: _onSubjectChanged,
          v: v,
        ),
        const SizedBox(height: 18),
        _Label(text: 'TOPIC', v: v),
        const SizedBox(height: 8),
        _TopicDropdown(
          topics: _topics,
          value: _topic,
          enabled: _subject != null,
          onChanged: (t) => setState(() => _topic = t),
          v: v,
        ),
        const SizedBox(height: 18),
        _Label(text: 'DIFFICULTY', v: v),
        const SizedBox(height: 8),
        _ChipRow<String>(
          options: _difficulties,
          value: _difficulty,
          label: (d) => d[0].toUpperCase() + d.substring(1),
          onSelect: (d) => setState(() => _difficulty = d),
          v: v,
        ),
        const SizedBox(height: 18),
        _Label(text: 'QUESTIONS', v: v),
        const SizedBox(height: 8),
        _ChipRow<int>(
          options: _counts,
          value: _count,
          label: (c) => '$c',
          onSelect: (c) => setState(() => _count = c),
          v: v,
        ),
        if (_buildError != null) ...[
          const SizedBox(height: 16),
          Text(
            _buildError!,
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontSize: 13,
              color: v.bad,
            ),
          ),
        ],
        const SizedBox(height: 24),
        VidyaButton(
          label: _building ? 'Building…' : 'Build & start',
          onPressed: canBuild ? _build : null,
          size: VidyaButtonSize.lg,
        ),
      ],
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  final VidyaThemeData v;
  const _Label({required this.text, required this.v});

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 11,
          color: v.ink3,
          letterSpacing: 1.4,
        ),
      );
}

class _SubjectDropdown extends StatelessWidget {
  final List<Subject> subjects;
  final Subject? value;
  final ValueChanged<Subject?> onChanged;
  final VidyaThemeData v;
  const _SubjectDropdown({
    required this.subjects,
    required this.value,
    required this.onChanged,
    required this.v,
  });

  @override
  Widget build(BuildContext context) {
    return _DropdownShell(
      v: v,
      child: DropdownButton<Subject>(
        value: value,
        isExpanded: true,
        underline: const SizedBox.shrink(),
        hint: Text('Choose a subject', style: TextStyle(color: v.ink3)),
        dropdownColor: v.paper,
        items: [
          for (final s in subjects)
            DropdownMenuItem(
              value: s,
              child: Text(s.name, style: TextStyle(color: v.ink)),
            ),
        ],
        onChanged: onChanged,
      ),
    );
  }
}

class _TopicDropdown extends StatelessWidget {
  final List<Topic> topics;
  final Topic? value;
  final bool enabled;
  final ValueChanged<Topic?> onChanged;
  final VidyaThemeData v;
  const _TopicDropdown({
    required this.topics,
    required this.value,
    required this.enabled,
    required this.onChanged,
    required this.v,
  });

  @override
  Widget build(BuildContext context) {
    return _DropdownShell(
      v: v,
      child: DropdownButton<Topic>(
        value: value,
        isExpanded: true,
        underline: const SizedBox.shrink(),
        hint: Text(
          enabled ? 'Choose a topic' : 'Pick a subject first',
          style: TextStyle(color: v.ink3),
        ),
        dropdownColor: v.paper,
        items: [
          for (final t in topics)
            DropdownMenuItem(
              value: t,
              child: Text(
                t.title,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: v.ink),
              ),
            ),
        ],
        onChanged: enabled ? onChanged : null,
      ),
    );
  }
}

class _DropdownShell extends StatelessWidget {
  final Widget child;
  final VidyaThemeData v;
  const _DropdownShell({required this.child, required this.v});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: v.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: v.rule),
      ),
      child: child,
    );
  }
}

class _ChipRow<T> extends StatelessWidget {
  final List<T> options;
  final T value;
  final String Function(T) label;
  final ValueChanged<T> onSelect;
  final VidyaThemeData v;
  const _ChipRow({
    required this.options,
    required this.value,
    required this.label,
    required this.onSelect,
    required this.v,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      children: [
        for (final o in options)
          GestureDetector(
            onTap: () => onSelect(o),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              decoration: BoxDecoration(
                color: o == value ? v.accent : v.ink3.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                label(o),
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: o == value ? Colors.white : v.ink2,
                ),
              ),
            ),
          ),
      ],
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
              "We couldn't load subjects.",
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
