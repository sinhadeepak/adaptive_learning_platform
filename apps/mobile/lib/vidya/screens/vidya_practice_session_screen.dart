// VidyaPracticeSessionScreen — Phase 3c.full v1 Task 1.
//
// Drives the Quick Practice quiz loop end-to-end against `QuizClient`:
// on mount it calls `start → next`, then loops `answer → next` until the
// server signals completion (`QuizNext.done == true` / `item == null`),
// at which point it surfaces the sessionId to the parent via
// `onCompleted(sessionId)`.
//
// Chrome mirrors `VidyaScreeningQuizScreen` (Phase 2c + 2f) — AppBar
// with ✕ close action, decorative countdown timer, eyebrow + progress
// row, metadata pill row, question stem, choice radios, then a Submit
// button. Errors surface in a `VidyaBanner` with a Retry CTA (the
// equivalent of screening's Skip-only escape hatch — practice can
// retry-in-place because there's no token to lose).
//
// θ-live readout slot is reserved in the layout but renders
// `SizedBox.shrink()` for v1. The card wiring lands in
// Phase 3c.full v4 once `/quiz/sessions/next` exposes
// `theta_estimate` + `next_q_b` on the response (analogous to what
// Phase 2f did for `/screening/{token}/next`).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../quiz/content_language_helper.dart';
import '../../quiz/polymorphic_renderer.dart';
import '../../quiz/quiz_client.dart';

/// Practice session mode. v1 only ships PRACTICE (Quick mode). The
/// Focused + Mock cards still snackbar; their slices in v2 + v3 will
/// parameterise this enum further (e.g. add subjectId, switch to MOCK).
enum QuizSessionMode {
  practice,
  mock;

  String get wireName => switch (this) {
        QuizSessionMode.practice => 'PRACTICE',
        QuizSessionMode.mock => 'MOCK',
      };

  String get eyebrow => switch (this) {
        QuizSessionMode.practice => 'PRACTICE · Quick',
        QuizSessionMode.mock => 'MOCK',
      };
}

class VidyaPracticeSessionScreen extends StatefulWidget {
  final QuizClient client;

  /// Mode passed to QuizClient.start. v1 only uses PRACTICE; later
  /// slices may parameterise on `subjectId` (Focused) or `mode: MOCK`.
  final QuizSessionMode mode;

  /// How many questions the session is targeted for. Used purely for
  /// the "X of Y" progress display — the server is still the source of
  /// truth on when the session actually ends (via QuizNext.done).
  final int questionCount;

  /// Called when the session finishes (the server returns `done=true`
  /// or hands us no item). The sessionId is needed for the result
  /// screen to fetch the summary.
  final void Function(String sessionId) onCompleted;

  /// Called when the user taps the ✕ close action. The caller decides
  /// where to go (usually `Navigator.pop`). No confirm dialog in v1.
  final VoidCallback onBack;

  /// Required. `topicId` selects the question pool (Phase 3c.full v1 uses
  /// the seeded Mechanics UUID; v2 will source from the user's active
  /// subject). `userId` comes from the authenticated `AuthClient.user.id`.
  /// Both are forwarded verbatim to `QuizClient.start`.
  final String topicId;
  final String userId;

  const VidyaPracticeSessionScreen({
    super.key,
    required this.client,
    this.mode = QuizSessionMode.practice,
    this.questionCount = 10,
    required this.onCompleted,
    required this.onBack,
    required this.topicId,
    required this.userId,
  });

  @override
  State<VidyaPracticeSessionScreen> createState() =>
      _VidyaPracticeSessionScreenState();
}

class _VidyaPracticeSessionScreenState
    extends State<VidyaPracticeSessionScreen> {
  String? _sessionId;
  QuizItem? _item;
  int? _selectedIdx;
  // Structured renderer value for non-MCQ types. This is exactly the map
  // the grader expects as `responsePayload` — the PolymorphicRenderer
  // emits it via onChange and we forward it verbatim on submit.
  dynamic _response;
  bool _submitting = false;
  String? _error;
  DateTime? _started;
  static const _sessionWindow = Duration(minutes: 15);

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    setState(() {
      _error = null;
      _item = null;
      _sessionId = null;
      _selectedIdx = null;
      _response = null;
    });
    try {
      final api = ApiClient(widget.client.auth);
      final langField = await contentLanguageField(api);
      final start = await widget.client.start(
        topicId: widget.topicId,
        userId: widget.userId,
        mode: widget.mode.wireName,
        extraFields: langField,
      );
      _sessionId = start.sessionId;
      _started = DateTime.now();
      await _fetchNext();
    } on QuizError catch (e) {
      if (mounted) {
        setState(() => _error = "We couldn't start your practice. ${e.message}");
      }
    } catch (_) {
      if (mounted) setState(() => _error = "We couldn't start your practice.");
    }
  }

  Future<void> _fetchNext() async {
    try {
      final result = await widget.client.next(_sessionId!);
      if (!mounted) return;
      if (result.done || result.item == null) {
        widget.onCompleted(_sessionId!);
        return;
      }
      setState(() {
        _item = result.item;
        _selectedIdx = null;
        _response = null;
      });
    } on QuizError catch (e) {
      if (e.code == QuizErrorCode.sessionDone) {
        // Server already considers us done — bubble up to the caller.
        widget.onCompleted(_sessionId!);
        return;
      }
      if (mounted) {
        setState(() => _error = "We couldn't load the next question. ${e.message}");
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't load the next question.");
      }
    }
  }

  /// Whether the current item has enough input to submit. MCQ needs a
  /// selected choice; every other type needs the renderer to have emitted
  /// a non-null response payload.
  bool get _canSubmit {
    final item = _item;
    if (item == null) return false;
    return item.isMcq ? _selectedIdx != null : _response != null;
  }

  Future<void> _submit() async {
    if (!_canSubmit || _submitting || _sessionId == null) {
      return;
    }
    final item = _item!;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      if (item.isMcq) {
        await widget.client.answer(
          _sessionId!,
          itemIdx: item.itemIdx,
          answerIdx: _selectedIdx!,
        );
      } else {
        // Non-MCQ: the renderer's value IS the grader payload. answerIdx is
        // ignored server-side for typed grading (canonical for MCQ only).
        await widget.client.answer(
          _sessionId!,
          itemIdx: item.itemIdx,
          answerIdx: 0,
          responsePayload: _response is Map<String, dynamic>
              ? _response as Map<String, dynamic>
              : <String, dynamic>{'value': _response},
        );
      }
      await _fetchNext();
    } on QuizError catch (e) {
      if (mounted) {
        setState(() => _error = "We couldn't record that answer. ${e.message}");
      }
    } catch (_) {
      if (mounted) setState(() => _error = "We couldn't record that answer.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _retry() async {
    // If we never got past start, restart the session. Otherwise just
    // re-fetch the next question (sessionId is still valid server-side).
    if (_sessionId == null) {
      await _start();
    } else {
      setState(() => _error = null);
      await _fetchNext();
    }
  }

  String _formatCountdown() {
    if (_started == null) return '';
    final remaining = _sessionWindow - DateTime.now().difference(_started!);
    if (remaining.isNegative) return '0:00';
    final m = remaining.inMinutes;
    final s = remaining.inSeconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    if (_error != null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          actions: [
            IconButton(
              icon: Icon(Icons.close, color: ink),
              onPressed: widget.onBack,
            ),
          ],
        ),
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
                      color: theme.accent,
                    ),
                  ),
                ),
              ),
              const Spacer(),
              VidyaButton(
                label: 'Close',
                style: VidyaButtonStyle.ghost,
                onPressed: widget.onBack,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      );
    }

    if (_item == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          actions: [
            IconButton(
              icon: Icon(Icons.close, color: ink),
              onPressed: widget.onBack,
            ),
          ],
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final q = _item!;
    final currentNumber = q.itemIdx + 1;
    final total = widget.questionCount;
    final progressValue = total > 0
        ? (currentNumber / total).clamp(0.0, 1.0)
        : 0.0;

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: _formatCountdown(),
        actions: [
          IconButton(
            icon: Icon(Icons.close, color: ink),
            onPressed: widget.onBack,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  widget.mode.eyebrow,
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 11,
                    color: muted,
                    letterSpacing: 1.5,
                  ),
                ),
                Text(
                  '$currentNumber of $total',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 12,
                    color: muted,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: progressValue,
                minHeight: 4,
                backgroundColor: muted.withValues(alpha: 0.2),
                valueColor: AlwaysStoppedAnimation<Color>(accent),
              ),
            ),
            const SizedBox(height: 16),
            const _MetadataRow(),
            const SizedBox(height: 16),
            // MCQ_SINGLE / legacy items render the lettered-choice UI and
            // submit answerIdx. Every other of the 29 question types renders
            // through the PolymorphicRenderer (which owns its own stem) and
            // submits a structured responsePayload. Mirrors web Quiz.tsx.
            Expanded(
              child: q.isMcq
                  ? _buildMcqChoices(q, ink, muted, accent)
                  : SingleChildScrollView(
                      child: PolymorphicRenderer.build(
                        typeId: q.questionType,
                        payload: q.payload,
                        value: _response,
                        onChange: (v) => setState(() => _response = v),
                        disabled: _submitting,
                      ),
                    ),
            ),
            // θ readout deferred to Phase 3c.full v4 (requires
            // /quiz/sessions/next to expose theta_estimate + next_q_b,
            // analogous to what Phase 2f did for screening).
            const SizedBox.shrink(),
            const SizedBox(height: 12),
            VidyaButton(
              key: const Key('vidya.practice.session.submit'),
              label: _submitting ? 'Saving…' : 'Submit answer',
              onPressed: !_canSubmit || _submitting ? null : _submit,
              disabled: !_canSubmit || _submitting,
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }

  /// Lettered-choice MCQ body: the question stem followed by a scrollable
  /// list of tappable choice cards. Used only for MCQ_SINGLE / legacy
  /// items — all other types render via [PolymorphicRenderer].
  Widget _buildMcqChoices(QuizItem q, Color ink, Color muted, Color accent) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          q.stem,
          style: TextStyle(
            fontFamily: VidyaFonts.display,
            fontSize: 22,
            fontWeight: FontWeight.w500,
            color: ink,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 20),
        Expanded(
          child: ListView.separated(
            itemCount: q.choices.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (ctx, i) {
              final selected = _selectedIdx == i;
              return VidyaCard(
                onTap: _submitting ? null : () => setState(() => _selectedIdx = i),
                tone: selected ? VidyaCardTone.accent : VidyaCardTone.defaultTone,
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: selected
                              ? accent
                              : muted.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          String.fromCharCode(65 + i),
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: selected ? Colors.white : ink,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          q.choices[i],
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 15,
                            color: ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

// Compact pill row above the question stem. All three pills are static
// placeholders in v1 — the b-value comes back in v4 with the θ readout,
// subject + marks come back when /quiz/sessions/next exposes blueprint
// metadata.
class _MetadataRow extends StatelessWidget {
  const _MetadataRow();

  @override
  Widget build(BuildContext context) {
    return const Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        _Pill(text: '4 marks'),
        _Pill(text: 'Mixed topics'),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  const _Pill({required this.text});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: v.ink3.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 11,
          color: v.ink2,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
