// VidyaMocksScreen — Phase B. The mock-test catalog for the active exam
// (mirrors web's /mocks): available blueprints to start + a history of
// taken attempts. Reached from the Practice → Mock card, which previously
// auto-launched the first blueprint with no way to choose.
//
// Pushed outside the shell subtree, so the active exam is passed in as
// params (examId for blueprint lookup, examCode to filter the attempt
// history) rather than read from the VidyaActiveExam notifier.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_mock_session_screen.dart';
import 'vidya_practice_result_screen.dart';

class VidyaMocksScreen extends StatefulWidget {
  final AuthClient auth;
  final String examId;
  final String examName;
  const VidyaMocksScreen({
    super.key,
    required this.auth,
    required this.examId,
    required this.examName,
  });

  @override
  State<VidyaMocksScreen> createState() => _VidyaMocksScreenState();
}

enum _MocksState { loading, loaded, error }

class _MocksData {
  final List<ExamBlueprint> blueprints;
  final List<MockAttemptRow> attempts;
  const _MocksData({required this.blueprints, required this.attempts});
}

class _VidyaMocksScreenState extends State<VidyaMocksScreen> {
  _MocksState _state = _MocksState.loading;
  _MocksData? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _state = _MocksState.loading);
    try {
      final api = ApiClient(widget.auth);
      // Blueprints are required; attempts degrade to empty on failure.
      final blueprints = await api.examBlueprints(widget.examId);
      List<MockAttemptRow> attempts;
      try {
        attempts = await api.mockAttempts();
      } catch (_) {
        attempts = const [];
      }
      if (!mounted) return;
      setState(() {
        _data = _MocksData(blueprints: blueprints, attempts: attempts);
        _state = _MocksState.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _MocksState.error);
    }
  }

  void _startBlueprint(ExamBlueprint bp) {
    final userId = widget.auth.user?.id ?? '';
    if (userId.isEmpty) return;
    final client = QuizClient(auth: widget.auth);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VidyaMockSessionScreen(
          client: client,
          blueprintId: bp.id,
          blueprintName: bp.name,
          userId: userId,
          itemCount: bp.totalQuestions,
          totalMinutes: bp.totalMinutes,
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
        title: 'Mock tests',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _MocksState.loading => const _MocksSkeleton(),
        _MocksState.error => _ErrorState(onRetry: _load, v: v),
        _MocksState.loaded => _LoadedView(
            data: _data!,
            examName: widget.examName,
            examId: widget.examId,
            onStart: _startBlueprint,
          ),
      },
    );
  }
}

class _LoadedView extends StatelessWidget {
  final _MocksData data;
  final String examName;
  final String examId;
  final void Function(ExamBlueprint) onStart;
  const _LoadedView({
    required this.data,
    required this.examName,
    required this.examId,
    required this.onStart,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    // Attempts are reported per exam code; match this exam by id-derived
    // blueprint set is unavailable, so we show all attempts for the exam's
    // mocks (the attempt rows already carry the exam). Keep history compact.
    final attempts = data.attempts;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        Text(
          'AVAILABLE · ${examName.toUpperCase()}',
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 12),
        if (data.blueprints.isEmpty)
          _InlineEmpty(
            v: v,
            text: 'No mock blueprints published for this exam yet.',
          )
        else
          for (final bp in data.blueprints) ...[
            _BlueprintCard(bp: bp, onStart: () => onStart(bp)),
            const SizedBox(height: 10),
          ],
        const SizedBox(height: 20),
        Text(
          'YOUR ATTEMPTS',
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 12),
        if (attempts.isEmpty)
          _InlineEmpty(
            v: v,
            text: 'No attempts yet — start a mock above to build a track '
                'record.',
          )
        else
          for (final a in attempts) ...[
            _AttemptCard(attempt: a),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _BlueprintCard extends StatelessWidget {
  final ExamBlueprint bp;
  final VoidCallback onStart;
  const _BlueprintCard({required this.bp, required this.onStart});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              bp.name,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 20,
                fontWeight: FontWeight.w500,
                color: v.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${bp.totalQuestions} questions · ${bp.totalMinutes} min · '
              '+${bp.marksCorrect} / ${bp.marksNegative} marking',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
              ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: 'Start mock',
              onPressed: onStart,
              size: VidyaButtonSize.md,
            ),
          ],
        ),
      ),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  final MockAttemptRow attempt;
  const _AttemptCard({required this.attempt});

  String _date() {
    final raw = attempt.createdAt;
    // createdAt is an ISO string; show just the date portion.
    final t = DateTime.tryParse(raw);
    if (t == null) return raw;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[t.month - 1]} ${t.day}, ${t.year}';
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final pct = (attempt.accuracy * 100).round();
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
                    attempt.examName ?? attempt.examCode,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${_date()} · ${attempt.nCorrect}/${attempt.totalQuestions} '
                    'correct',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      color: v.ink3,
                    ),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${attempt.rawScore}/${attempt.maxMarks}',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: v.ink,
                  ),
                ),
                Text(
                  '$pct% acc',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 11,
                    color: v.ink3,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InlineEmpty extends StatelessWidget {
  final VidyaThemeData v;
  final String text;
  const _InlineEmpty({required this.v, required this.text});

  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          text,
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
              "We couldn't load mock tests.",
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

class _MocksSkeleton extends StatelessWidget {
  const _MocksSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        const VidyaSkeletonBlock(width: 120, height: 12),
        const SizedBox(height: 16),
        for (var i = 0; i < 3; i++) ...[
          VidyaCard(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  VidyaSkeletonBlock(width: 180, height: 20),
                  SizedBox(height: 10),
                  VidyaSkeletonBlock(width: 220, height: 12),
                  SizedBox(height: 14),
                  VidyaSkeletonBlock(width: 110, height: 36),
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
