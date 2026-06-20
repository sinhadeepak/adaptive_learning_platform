import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../aurora/widgets/widgets.dart';
import '../auth/auth_client.dart';
import '../quiz/content_language_helper.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';
import '../widgets/alp_card.dart';
import 'mock_test_screen.dart';
import 'persona.dart';

/// Practice mode picker — Adaptive / Topic Quiz / Mock Test.
/// Mirrors docs/ui/02_MobileApp/18_ai-practice.html.
class PracticeTab extends StatelessWidget {
  const PracticeTab(
      {super.key,
      required this.api,
      required this.auth,
      this.persona = LegacyAudience.senior,
      this.activeExamCode,});
  final ApiClient api;
  final AuthClient auth;
  // Junior audience swaps "Mock Test" copy to "Practice test" and
  // softens the framing — competitive-exam vocabulary is intimidating
  // for a Class 8 student. Renamed from `Persona` to `LegacyAudience`
  // as part of Aurora v3 W2.0 to clear a type collision with the new
  // four-mode Persona system. This whole field goes away when
  // PracticeTab is replaced by the persona-aware variant in W2.5/W2.7.
  final LegacyAudience persona;
  // The user's active exam code (e.g. "NEET", "CBSE"). Drives the
  // pill on the Adaptive card so we don't hardcode "NEET" for a
  // CBSE-Class-8 student.
  final String? activeExamCode;

  static const _seededMechanicsTopic = '33333333-0000-0000-0000-000000000001';

  Future<void> _startAdaptive(BuildContext context) async {
    final user = auth.user;
    if (user == null) return;
    try {
      final langField = await contentLanguageField(api);
      final client = QuizClient(auth: auth);
      final session = await client.start(
          topicId: _seededMechanicsTopic, userId: user.id, extraFields: langField);
      if (!context.mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: session.sessionId, api: api),
      ),);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not start: $e')));
      }
    }
  }

  Future<void> _pickTopic(BuildContext context) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TopicPicker(api: api),
    );
    if (picked == null || !context.mounted) return;
    final user = auth.user;
    if (user == null) return;
    try {
      final langField = await contentLanguageField(api);
      final client = QuizClient(auth: auth);
      final session = await client.start(
          topicId: picked, userId: user.id, extraFields: langField);
      if (!context.mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: session.sessionId, api: api),
      ),);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not start: $e')));
      }
    }
  }

  /// F1 — Mistake replay. Bottom sheet asks for recency filter, then
  /// kicks off a 10-item replay session.
  Future<void> _startMistakeReplay(BuildContext context) async {
    final user = auth.user;
    if (user == null) return;
    final choice = await showModalBottomSheet<int?>(
      context: context,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Drill mistakes — pick recency',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'You can also filter by topic on the web app.',
                style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
              ),
              const SizedBox(height: 14),
              _MistakeChoiceTile(
                label: 'All recent',
                subtitle: 'Most recent 10 across all topics',
                icon: Icons.history,
                onTap: () => Navigator.of(context).pop(0),
              ),
              const SizedBox(height: 10),
              _MistakeChoiceTile(
                label: 'Last 7 days',
                subtitle: 'Only this week’s mistakes',
                icon: Icons.calendar_today_outlined,
                onTap: () => Navigator.of(context).pop(7),
              ),
              const SizedBox(height: 10),
              _MistakeChoiceTile(
                label: 'Last 30 days',
                subtitle: 'Broader window',
                icon: Icons.event_note_outlined,
                onTap: () => Navigator.of(context).pop(30),
              ),
            ],
          ),
        ),
      ),
    );
    if (choice == null || !context.mounted) return;
    try {
      final client = QuizClient(auth: auth);
      final session = await client.startMistakeReplay(
        userId: user.id,
        sinceDays: choice > 0 ? choice : null,
      );
      if (!context.mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(
          client: client,
          sessionId: session.sessionId,
          api: api,
        ),
      ),);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Text(
          'Practice Modes',
          style: typography.h1.copyWith(color: colors.neutral900),
        ),
        const SizedBox(height: 4),
        Text(
          'Choose how you want to study today',
          style: typography.body.copyWith(color: colors.neutral600),
        ),
        const SizedBox(height: 20),

        // Adaptive Practice — Aurora hero card.
        AuroraCard(
          tone: AuroraCardTone.auroraAi,
          padding: AuroraCardPadding.lg,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: colors.auroraAi,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.bolt_rounded,
                      color: colors.neutral0,
                      size: 26,
                    ),
                  ),
                  const Spacer(),
                  AuroraTag(
                    label: 'AI-POWERED',
                    tone: AuroraTagTone.aurora,
                    variant: AuroraTagVariant.soft,
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                'Adaptive Practice',
                style: typography.h3.copyWith(color: colors.neutral900),
              ),
              const SizedBox(height: 6),
              Text(
                'Questions adapt to your exact ability level using 3PL IRT model. '
                'Gets smarter with every answer.',
                style: typography.bodySm.copyWith(color: colors.neutral700),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  AuroraTag(
                    label: '15 Qs',
                    tone: AuroraTagTone.brand,
                    variant: AuroraTagVariant.soft,
                  ),
                  if (activeExamCode != null && activeExamCode!.isNotEmpty)
                    AuroraTag(
                      label: activeExamCode!.replaceAll('_', ' '),
                      tone: AuroraTagTone.success,
                      variant: AuroraTagVariant.soft,
                    ),
                  AuroraTag(
                    label: '~20 min',
                    tone: AuroraTagTone.warning,
                    variant: AuroraTagVariant.soft,
                  ),
                ],
              ),
              const SizedBox(height: 14),
              AuroraButton(
                label: 'Start Adaptive Practice',
                variant: AuroraButtonVariant.aurora,
                size: AuroraButtonSize.lg,
                fullWidth: true,
                iconLeft: const Text('✦'),
                onPressed: () => _startAdaptive(context),
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
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
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
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // F1 — Drill mistakes (promoted from /analysis button to a
        // first-class practice mode).
        AlpCard(
          padding: const EdgeInsets.all(18),
          borderColor: AlpColors.colorAmber.withValues(alpha: 0.30),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AlpColors.colorAmber.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.refresh, color: AlpColors.colorAmber, size: 24),
              ),
              const SizedBox(height: 14),
              const Text(
                'Drill your mistakes',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Re-attempt questions you got wrong. Filter by recency, drill 10 at a time.',
                style: TextStyle(color: AlpColors.textSecondary, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                children: const [
                  AlpPill(label: '10 Qs', color: AlpColors.colorAmber),
                  AlpPill(label: 'All / 7d / 30d', color: AlpColors.textMuted),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => _startMistakeReplay(context),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(
                      color: AlpColors.colorAmber.withValues(alpha: 0.45),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text(
                    '🎯 Start mistake drill →',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
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
                  AlpPill(
                      label: persona.isJunior ? '◈ TIMED TEST' : '◈ AI MOCK',
                      color: AlpColors.colorAmber,),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                persona.isJunior ? 'Practice Test' : 'Mock Test',
                style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,),
              ),
              const SizedBox(height: 6),
              Text(
                persona.isJunior
                    ? 'A timed chapter-style test — like the one your teacher gives. See where you stand and which topics to revisit.'
                    : 'Exam-blueprint paper, mastery-calibrated, timed, scored against historical percentile + projected AIR.',
                style: const TextStyle(
                    color: AlpColors.textSecondary, fontSize: 13, height: 1.4,),
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
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: Text(
                    persona.isJunior ? 'Start Practice Test ▶' : 'Start Mock Test ▶',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
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
      builder: (_) => const Center(child: AuroraSpinner(size: 32)),
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
      ),);
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
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Center(child: Padding(
                padding: EdgeInsets.all(24),
                child: AuroraSpinner(size: 32),
              ),)
            else if (_subject != null)
              ..._topics.map((t) => _PickerRow(
                    title: t.title,
                    subtitle: '${t.questionCount} questions',
                    onTap: () => Navigator.of(context).pop(t.id),
                  ),)
            else if (_exam != null)
              ..._subjects.map((s) => _PickerRow(
                    title: s.name,
                    subtitle: '${s.topicCount} topics',
                    onTap: () => _pickSubject(s),
                  ),)
            else
              ..._exams.map((e) => _PickerRow(
                    title: e.name,
                    subtitle: e.subtitle ?? e.code,
                    onTap: () => _pickExam(e),
                  ),),
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
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
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

/// F1 — bottom-sheet tile for recency choice on the Drill mistakes flow.
class _MistakeChoiceTile extends StatelessWidget {
  const _MistakeChoiceTile({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });
  final String label;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AlpColors.bgSurface2,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(icon, color: AlpColors.colorAmber, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: AlpColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AlpColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
