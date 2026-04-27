import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';
import '../widgets/alp_card.dart';
import 'mock_test_screen.dart';

/// Practice mode picker — Adaptive / Topic Quiz / Mock Test.
/// Mirrors docs/ui/02_MobileApp/18_ai-practice.html.
class PracticeTab extends StatelessWidget {
  const PracticeTab({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  static const _seededMechanicsTopic = '33333333-0000-0000-0000-000000000001';

  Future<void> _startAdaptive(BuildContext context) async {
    final user = auth.user;
    if (user == null) return;
    try {
      final client = QuizClient(auth: auth);
      final session = await client.start(topicId: _seededMechanicsTopic, userId: user.id);
      if (!context.mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: session.sessionId, api: api),
      ));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not start: $e')));
      }
    }
  }

  Future<void> _pickTopic(BuildContext context) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AlpColors.bgSurface1,
      isScrollControlled: true,
      builder: (_) => _TopicPicker(api: api),
    );
    if (picked == null || !context.mounted) return;
    final user = auth.user;
    if (user == null) return;
    try {
      final client = QuizClient(auth: auth);
      final session = await client.start(topicId: picked, userId: user.id);
      if (!context.mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: session.sessionId, api: api),
      ));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not start: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        const Text(
          'Practice Modes',
          style: TextStyle(color: AlpColors.textPrimary, fontSize: 24, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        const Text(
          'Choose how you want to study today',
          style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
        ),
        const SizedBox(height: 20),

        // Adaptive Practice (highlighted)
        AlpCard(
          padding: const EdgeInsets.all(18),
          borderColor: AlpColors.colorBlue.withValues(alpha: 0.30),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AlpColors.colorBlue.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.bolt_rounded, color: AlpColors.colorBlue, size: 26),
                  ),
                  const Spacer(),
                  const AlpPill(label: 'AI-POWERED', color: AlpColors.colorAi),
                ],
              ),
              const SizedBox(height: 14),
              const Text(
                'Adaptive Practice',
                style: TextStyle(color: AlpColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              const Text(
                'Questions adapt to your exact ability level using 3PL IRT model. Gets smarter with every answer.',
                style: TextStyle(color: AlpColors.textSecondary, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                children: const [
                  AlpPill(label: '15 Qs', color: AlpColors.colorBlue),
                  AlpPill(label: 'NEET', color: AlpColors.colorGreen),
                  AlpPill(label: '~20 min', color: AlpColors.colorAmber),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => _startAdaptive(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AlpColors.colorBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text(
                    'Start Adaptive Practice ▶',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // Topic Quiz
        AlpCard(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AlpColors.colorPurple.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.menu_book_outlined, color: AlpColors.colorPurple, size: 24),
              ),
              const SizedBox(height: 14),
              const Text(
                'Topic Quiz',
                style: TextStyle(color: AlpColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              const Text(
                'Focus on a single topic to build targeted mastery. Pick subject, chapter, and difficulty.',
                style: TextStyle(color: AlpColors.textSecondary, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                children: const [
                  AlpPill(label: '10–30 Qs', color: AlpColors.colorPurple),
                  AlpPill(label: 'All subjects', color: AlpColors.textMuted),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => _pickTopic(context),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AlpColors.borderStrong),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text(
                    'Select Topic →',
                    style: TextStyle(color: AlpColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // Mock Test
        AlpCard(
          padding: const EdgeInsets.all(18),
          borderColor: AlpColors.colorAmber.withValues(alpha: 0.30),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AlpColors.colorAmber.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.emoji_events_outlined, color: AlpColors.colorAmber, size: 24),
                  ),
                  const Spacer(),
                  const AlpPill(label: '◈ AI MOCK', color: AlpColors.colorAmber),
                ],
              ),
              const SizedBox(height: 14),
              const Text(
                'Mock Test',
                style: TextStyle(color: AlpColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              const Text(
                'Exam-blueprint paper, mastery-calibrated, timed, scored against historical percentile + projected AIR.',
                style: TextStyle(color: AlpColors.textSecondary, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 12),
              const Wrap(
                spacing: 6,
                children: [
                  AlpPill(label: '20 Qs', color: AlpColors.colorAmber),
                  AlpPill(label: '25 min', color: AlpColors.colorRed),
                  AlpPill(label: '+4/-1', color: AlpColors.colorBlue),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => _startMock(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AlpColors.colorAmber,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text(
                    'Start Mock Test ▶',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _startMock(BuildContext context) async {
    final user = auth.user;
    if (user == null) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator(color: AlpColors.colorAi)),
    );
    try {
      // Default to NEET; future: read user's target exam from profile.
      final plan = await api.mockPlan(userId: user.id, examCode: 'NEET');
      if (!context.mounted) return;
      Navigator.pop(context); // close loader
      if (plan.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(plan.message ?? 'Could not build mock')),
        );
        return;
      }
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => MockTestScreen(api: api, plan: plan),
      ));
    } catch (e) {
      if (context.mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Mock failed: $e')),
        );
      }
    }
  }
}

/// Bottom-sheet topic picker — Exam → Subject → Topic. Returns the picked topic id.
class _TopicPicker extends StatefulWidget {
  const _TopicPicker({required this.api});
  final ApiClient api;

  @override
  State<_TopicPicker> createState() => _TopicPickerState();
}

class _TopicPickerState extends State<_TopicPicker> {
  List<Exam> _exams = [];
  List<Subject> _subjects = [];
  List<Topic> _topics = [];
  Exam? _exam;
  Subject? _subject;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadExams();
  }

  Future<void> _loadExams() async {
    try {
      final list = await widget.api.exams();
      setState(() {
        _exams = list;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _pickExam(Exam e) async {
    setState(() {
      _exam = e;
      _subject = null;
      _subjects = [];
      _topics = [];
    });
    final list = await widget.api.subjectsForExam(e.id);
    if (!mounted) return;
    setState(() => _subjects = list);
  }

  Future<void> _pickSubject(Subject s) async {
    setState(() {
      _subject = s;
      _topics = [];
    });
    final list = await widget.api.topicsForSubject(s.id);
    if (!mounted) return;
    setState(() => _topics = list);
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollController) => Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: AlpColors.bgSurface1,
          borderRadius: BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
        ),
        child: ListView(
          controller: scrollController,
          children: [
            const Center(
              child: SizedBox(
                width: 40,
                height: 4,
                child: DecoratedBox(decoration: BoxDecoration(color: AlpColors.borderStrong)),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _subject != null
                  ? 'Pick a topic'
                  : _exam != null
                      ? 'Pick a subject in ${_exam!.name}'
                      : 'Pick an exam',
              style: const TextStyle(color: AlpColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Center(child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(color: AlpColors.colorAi),
              ))
            else if (_subject != null)
              ..._topics.map((t) => _PickerRow(
                    title: t.title,
                    subtitle: '${t.questionCount} questions',
                    onTap: () => Navigator.of(context).pop(t.id),
                  ))
            else if (_exam != null)
              ..._subjects.map((s) => _PickerRow(
                    title: s.name,
                    subtitle: '${s.topicCount} topics',
                    onTap: () => _pickSubject(s),
                  ))
            else
              ..._exams.map((e) => _PickerRow(
                    title: e.name,
                    subtitle: e.subtitle ?? e.code,
                    onTap: () => _pickExam(e),
                  )),
          ],
        ),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  const _PickerRow({required this.title, required this.subtitle, required this.onTap});
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AlpCard(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(color: AlpColors.textPrimary, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: const TextStyle(color: AlpColors.textMuted, fontSize: 11)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AlpColors.textMuted),
          ],
        ),
      ),
    );
  }
}
