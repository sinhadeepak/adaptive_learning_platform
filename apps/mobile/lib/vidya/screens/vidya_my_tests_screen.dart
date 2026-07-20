// VidyaMyTestsScreen — Phase B. The student's authored + AI-suggested
// tests (mirrors web's MyTests). Reached from the Test Builder app bar.
// Each test launches through the existing mock session runner; the
// student's own tests can be retired (soft-deleted).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_mock_session_screen.dart';
import 'vidya_practice_result_screen.dart';

class VidyaMyTestsScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaMyTestsScreen({super.key, required this.auth});

  @override
  State<VidyaMyTestsScreen> createState() => _VidyaMyTestsScreenState();
}

enum _State { loading, loaded, error }

class _VidyaMyTestsScreenState extends State<VidyaMyTestsScreen> {
  _State _state = _State.loading;
  List<ExamBlueprint> _mine = const [];
  List<ExamBlueprint> _suggested = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    try {
      final api = ApiClient(widget.auth);
      final mine = await api.myBlueprints();
      List<ExamBlueprint> suggested;
      try {
        suggested = await api.aiSuggestedBlueprints();
      } catch (_) {
        suggested = const [];
      }
      if (!mounted) return;
      setState(() {
        _mine = mine;
        _suggested = suggested;
        _state = _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  Future<void> _delete(ExamBlueprint bp) async {
    final ok = await ApiClient(widget.auth).deleteBlueprint(bp.id);
    if (!mounted) return;
    if (ok) {
      setState(() => _mine = _mine.where((b) => b.id != bp.id).toList());
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't delete that test.")),
      );
    }
  }

  void _launch(ExamBlueprint bp) {
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
        title: 'My tests',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.loaded => _loaded(v),
      },
    );
  }

  Widget _loaded(VidyaThemeData v) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        _SectionLabel(text: 'YOUR TESTS', v: v),
        const SizedBox(height: 12),
        if (_mine.isEmpty)
          _Empty(v: v, text: 'No saved tests yet — build one to see it here.')
        else
          for (final bp in _mine) ...[
            _TestCard(
              bp: bp,
              onStart: () => _launch(bp),
              onDelete: () => _delete(bp),
            ),
            const SizedBox(height: 10),
          ],
        const SizedBox(height: 20),
        _SectionLabel(text: 'AI-SUGGESTED', v: v),
        const SizedBox(height: 12),
        if (_suggested.isEmpty)
          _Empty(
            v: v,
            text: 'No AI-suggested tests right now — they refresh as you '
                'practise.',
          )
        else
          for (final bp in _suggested) ...[
            _TestCard(bp: bp, onStart: () => _launch(bp)),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _TestCard extends StatelessWidget {
  final ExamBlueprint bp;
  final VoidCallback onStart;
  final VoidCallback? onDelete;
  const _TestCard({required this.bp, required this.onStart, this.onDelete});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    bp.name,
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                    ),
                  ),
                ),
                if (onDelete != null)
                  IconButton(
                    icon: Icon(Icons.delete_outline, size: 20, color: v.ink3),
                    onPressed: onDelete,
                    tooltip: 'Delete',
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${bp.kind} · ${bp.totalQuestions} questions · '
              '${bp.totalMinutes} min',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
              ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: 'Start',
              onPressed: onStart,
              size: VidyaButtonSize.md,
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  final VidyaThemeData v;
  const _SectionLabel({required this.text, required this.v});

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

class _Empty extends StatelessWidget {
  final VidyaThemeData v;
  final String text;
  const _Empty({required this.v, required this.text});

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
              "We couldn't load your tests.",
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
