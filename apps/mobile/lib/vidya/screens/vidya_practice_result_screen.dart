// VidyaPracticeResultScreen — Phase 3c.full v1 Task 2.
//
// Minimal landing page after a practice session completes. On mount it
// calls `QuizClient.session(sessionId)` to fetch the summary, then
// renders: eyebrow `PRACTICE COMPLETE`, big `${correct} / ${served}`
// score, single `Done` CTA that fires `onDone`.
//
// Intentionally barebones — the rich result UI (subtopic breakdown,
// Insights deep link, mistake patterns) lands in Phase 3c.full v2.
// This slice exists just to close the loop so the user has somewhere
// to land after the last question.
//
// QuizClient.session() returns a QuizSessionDetail with `correctCount`
// and `servedCount` ints. The plan's draft test sketch referenced a
// `QuizSession(score, total)` shape — that's the `/submit` response
// (score is a 0-1 ratio there). The result screen uses the detail
// endpoint because it's what the session screen's onCompleted hands
// off, and because `correct/served` reads cleanly as `7 / 10`.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../quiz/quiz_client.dart';

class VidyaPracticeResultScreen extends StatefulWidget {
  final QuizClient client;
  final String sessionId;
  final VoidCallback onDone;

  const VidyaPracticeResultScreen({
    super.key,
    required this.client,
    required this.sessionId,
    required this.onDone,
  });

  @override
  State<VidyaPracticeResultScreen> createState() =>
      _VidyaPracticeResultScreenState();
}

class _VidyaPracticeResultScreenState
    extends State<VidyaPracticeResultScreen> {
  QuizSessionDetail? _summary;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await widget.client.session(widget.sessionId);
      if (mounted) setState(() => _summary = s);
    } on QuizError catch (e) {
      if (mounted) {
        setState(() => _error = "We couldn't load your result. ${e.message}");
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't load your result.");
      }
    }
  }

  Future<void> _retry() async {
    setState(() => _error = null);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final muted = theme.ink3;
    final accent = theme.accent;

    if (_error != null && _summary == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              VidyaBanner(
                tone: VidyaBannerTone.warn,
                message: _error!,
                action: TextButton(
                  onPressed: _retry,
                  child: Text(
                    'Retry',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: accent,
                    ),
                  ),
                ),
              ),
              const Spacer(),
              VidyaButton(
                label: 'Done',
                style: VidyaButtonStyle.ghost,
                onPressed: widget.onDone,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      );
    }

    if (_summary == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final s = _summary!;
    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Spacer(),
            Text(
              'PRACTICE COMPLETE',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 12,
                color: muted,
                letterSpacing: 1.8,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              '${s.correctCount} / ${s.servedCount}',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 64,
                fontWeight: FontWeight.w600,
                color: accent,
                height: 1.1,
              ),
            ),
            const Spacer(),
            VidyaButton(
              key: const Key('vidya.practice.result.done'),
              label: 'Done',
              onPressed: widget.onDone,
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }
}
