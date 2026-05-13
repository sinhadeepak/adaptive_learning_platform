// Diagnostic flow — shown to brand-new users instead of dropping
// them on a dashboard full of zeros. Three stages:
//
//   1. Intro     — persona-aware framing, 3 numbered steps.
//   2. Quiz      — embedded QuizScreen on a topic picked from the
//                  user's active exam's first subject.
//   3. Outro     — shows the readiness number that just got seeded,
//                  plus the top-3 weakest topics so the student knows
//                  what to do next.
//
// Pushed from the cold-start hero on Home (replaces the old
// `widget.onJump(2)` jump-to-Practice-tab behaviour).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';
import '../widgets/alp_card.dart';
import 'exam_dashboard_screen.dart';
import 'persona.dart';

class DiagnosticScreen extends StatefulWidget {
  const DiagnosticScreen({
    super.key,
    required this.api,
    required this.auth,
    required this.examId,
    required this.examCode,
    required this.examName,
    this.examSubtitle,
    this.targetDate,
  });

  final ApiClient api;
  final AuthClient auth;
  final String examId;
  final String examCode;
  final String examName;
  final String? examSubtitle;
  final DateTime? targetDate;

  @override
  State<DiagnosticScreen> createState() => _DiagnosticScreenState();
}

enum _Stage { intro, quiz, outro }

class _DiagnosticScreenState extends State<DiagnosticScreen> {
  _Stage _stage = _Stage.intro;
  bool _starting = false;
  String? _error;

  // Outro data — refreshed after the quiz session ends.
  Readiness? _readinessAfter;
  List<TopicMastery> _masteryAfter = const [];
  Map<String, String> _topicTitles = const {};

  Persona get _persona => personaForExamCode(widget.examCode);

  Future<void> _start() async {
    if (_starting) return;
    setState(() {
      _starting = true;
      _error = null;
    });
    final user = widget.auth.user;
    if (user == null) {
      setState(() {
        _starting = false;
        _error = 'Please log in to start the diagnostic.';
      });
      return;
    }
    try {
      // Pick the first topic of the first subject — a reasonable
      // anchor for the diagnostic. The IRT engine adapts difficulty
      // from the very first answer so this still produces a useful
      // readiness signal regardless of which topic we land on.
      final subjects = await widget.api.subjectsForExam(widget.examId);
      if (subjects.isEmpty) {
        throw 'This exam has no subjects yet.';
      }
      String? topicId;
      for (final s in subjects) {
        try {
          final ts = await widget.api.topicsForSubject(s.id);
          if (ts.isNotEmpty) {
            topicId = ts.first.id;
            break;
          }
        } catch (_) {/* try next subject */}
      }
      if (topicId == null) {
        throw 'No topics found in any subject.';
      }
      final client = QuizClient(auth: widget.auth);
      final session = await client.start(topicId: topicId, userId: user.id);
      if (!mounted) return;
      setState(() {
        _stage = _Stage.quiz;
        _starting = false;
      });
      // Push the quiz; once it pops, fetch the new readiness numbers
      // and switch to the outro stage.
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(
            client: client, sessionId: session.sessionId, api: widget.api,),
      ),);
      if (!mounted) return;
      await _loadOutro(user.id);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _starting = false;
        _error = '$e';
      });
    }
  }

  Future<void> _loadOutro(String userId) async {
    setState(() => _stage = _Stage.outro);
    try {
      final results = await Future.wait([
        widget.api.readiness(userId, scope: widget.examCode),
        widget.api.mastery(userId),
      ]);
      final readiness = results[0] as Readiness;
      final mastery = results[1] as List<TopicMastery>;
      // Hydrate titles for the weakest 3 topics so the outro can
      // surface them by name instead of "Topic 33333333".
      final weakest = [...mastery]..sort((a, b) => a.ewa.compareTo(b.ewa));
      final titles = <String, String>{};
      for (final m in weakest.take(3)) {
        try {
          final t = await widget.api.topic(m.topicId);
          if (t != null) titles[m.topicId] = t.title;
        } catch (_) {/* skip */}
      }
      if (!mounted) return;
      setState(() {
        _readinessAfter = readiness;
        _masteryAfter = mastery;
        _topicTitles = titles;
      });
    } catch (_) {/* outro renders with whatever loaded */}
  }

  void _openExamDashboard() {
    Navigator.of(context).pushReplacement(MaterialPageRoute(
      builder: (_) => ExamDashboardScreen(
        api: widget.api,
        auth: widget.auth,
        examId: widget.examId,
        examCode: widget.examCode,
        examName: widget.examName,
        examSubtitle: widget.examSubtitle,
        targetDate: widget.targetDate,
      ),
    ),);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(
        title: Text(_stage == _Stage.outro
            ? 'Diagnostic — Done'
            : 'Diagnostic Round',),
        backgroundColor: AlpColors.bgBase,
      ),
      body: switch (_stage) {
        _Stage.intro => _buildIntro(),
        _Stage.quiz => const Center(
            child: CircularProgressIndicator(color: AlpColors.colorAi),),
        _Stage.outro => _buildOutro(),
      },
    );
  }

  Widget _buildIntro() {
    final isJunior = _persona.isJunior;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        AlpCard(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1A2540), Color(0xFF221E45)],
          ),
          borderColor: AlpColors.colorAi.withValues(alpha: 0.40),
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AlpColors.colorAi.withValues(alpha: 0.20),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.auto_awesome,
                        color: AlpColors.colorAi, size: 22,),
                  ),
                  const Spacer(),
                  const AlpPill(
                      label: '◈ ~5 minutes', color: AlpColors.colorAi,),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                isJunior
                    ? "Let's see what you already know"
                    : 'Calibrate your readiness',
                style: const TextStyle(
                    color: AlpColors.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,),
              ),
              const SizedBox(height: 6),
              Text(
                isJunior
                    ? "We'll ask a few questions to figure out which topics need a little more practice. No pressure — you can skip any question."
                    : 'A short adaptive round seeds your readiness score and unlocks the rest of the dashboard. Without it, every other stat reads as zero.',
                style: const TextStyle(
                    color: AlpColors.textSecondary,
                    fontSize: 13,
                    height: 1.45,),
              ),
              const SizedBox(height: 14),
              ..._steps(isJunior).map((s) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(top: 5, right: 8),
                          child: Icon(Icons.check_circle_outline,
                              color: AlpColors.colorAi, size: 14,),
                        ),
                        Expanded(
                          child: Text(
                            s,
                            style: const TextStyle(
                                color: AlpColors.textSecondary,
                                fontSize: 13,
                                height: 1.4,),
                          ),
                        ),
                      ],
                    ),
                  ),),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0x33F43F5E),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _error!,
                    style: const TextStyle(
                        color: AlpColors.colorRed, fontSize: 12,),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _starting ? null : _start,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AlpColors.colorAi,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),),
                  ),
                  child: Text(
                    _starting
                        ? 'Starting…'
                        : (isJunior ? 'Start the check ▶' : 'Run diagnostic ▶'),
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14,),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  List<String> _steps(bool isJunior) {
    if (isJunior) {
      return const [
        'Answer a few short questions about your subjects.',
        "We'll show you a friendly readiness score — green if you're on track, amber if a topic needs a second look.",
        'Your study plan updates with what to do next.',
      ];
    }
    return const [
      'Answer ~5 IRT-calibrated items across the active exam.',
      'Your readiness score and per-topic ability θ get seeded.',
      'Mock blueprints, weakness diagnosis and rank projection unlock.',
    ];
  }

  Widget _buildOutro() {
    final pct = _readinessAfter == null
        ? 0
        : (_readinessAfter!.score * 100).round();
    final weakest = [..._masteryAfter]..sort((a, b) => a.ewa.compareTo(b.ewa));
    final isJunior = _persona.isJunior;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        AlpCard(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1A2540), Color(0xFF221E45)],
          ),
          borderColor: AlpColors.colorAi.withValues(alpha: 0.40),
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.celebration,
                      color: AlpColors.colorAi, size: 22,),
                  SizedBox(width: 8),
                  Text('Diagnostic complete',
                      style: TextStyle(
                          color: AlpColors.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,),),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                isJunior
                    ? "You're at $pct% ready"
                    : 'Starting readiness: $pct%',
                style: const TextStyle(
                    color: AlpColors.colorAi,
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    height: 1,),
              ),
              const SizedBox(height: 6),
              Text(
                _readinessAfter == null
                    ? 'Your readiness will keep updating as you practice.'
                    : '${_readinessAfter!.nTopics} topic${_readinessAfter!.nTopics == 1 ? '' : 's'} tracked. Every quiz from here updates this number.',
                style: const TextStyle(
                    color: AlpColors.textSecondary, fontSize: 13, height: 1.4,),
              ),
              if (weakest.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Top priorities',
                    style: TextStyle(
                        color: AlpColors.textMuted,
                        fontSize: 11,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w700,),),
                const SizedBox(height: 6),
                ...weakest.take(3).map((m) => Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(right: 8),
                            child: Icon(Icons.arrow_forward_rounded,
                                color: AlpColors.colorAi, size: 14,),
                          ),
                          Expanded(
                            child: Text(
                              _topicTitles[m.topicId] ??
                                  'Topic ${m.topicId.substring(0, 8)}',
                              style: const TextStyle(
                                  color: AlpColors.textPrimary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,),
                            ),
                          ),
                          Text(
                            '${(m.ewa * 100).round()}%',
                            style: const TextStyle(
                                color: AlpColors.colorRed,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,),
                          ),
                        ],
                      ),
                    ),),
              ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _openExamDashboard,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AlpColors.colorAi,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),),
                  ),
                  child: const Text(
                    'View my dashboard ▶',
                    style: TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14,),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
