// VidyaMockSessionScreen — Phase 3c.full v3 Task 3.
//
// Runs a Mock Test session against `QuizClient.startFromBlueprint` +
// `next` / `answer`. Sibling (not subclass) of
// `VidyaPracticeSessionScreen` because Mock chrome differs materially:
//
//   * Real `Timer.periodic` countdown driven off `totalMinutes` — tests
//     advance the simulated clock via `tester.pump(Duration(seconds: N))`
//     instead of `pumpAndSettle()` (a periodic timer never settles).
//   * Section indicator above the question, derived from the blueprint
//     section composition by walking the served-count range — `QuizItem`
//     doesn't yet carry `sectionId`, so the fallback is positional: as
//     served-count crosses the cumulative `nComposed` of each section
//     entry, we surface that section's `name`.
//   * Variable target question count from the blueprint (`itemCount`),
//     not a hard-coded 10.
//   * Exit confirm dialog on ✕ — Mock sessions can run 3 hours, far too
//     expensive to bail on accidentally.
//   * "Time's up" banner on timer expiry. Auto-submit defers to v3.v3.
//
// State machine: `initState` calls `startFromBlueprint`, then `next` for
// Q1; submitting an answer flows through `answer → next`; when the server
// signals `done == true` (or returns no `item`), `widget.onCompleted(
// sessionId)` fires and the caller pushReplaces into the result screen.
//
// Out of scope (deferred to later v3 slices):
//   * OMR-style sticky palette                (v3.v2)
//   * Inter-section navigation                (v3.v2)
//   * Pause/resume                            (v3.v3)
//   * Auto-submit on timer expiry             (v3.v3)
//   * 5-minute warning                        (v3.v3)
//   * Mark-for-review queue                   (v3.v3)

import 'dart:async';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../quiz/quiz_client.dart';

class VidyaMockSessionScreen extends StatefulWidget {
  final QuizClient client;
  final String blueprintId;
  final String blueprintName;
  final String userId;

  /// Target question count for the "X / Y" progress indicator. The
  /// server is still the source of truth for session termination (via
  /// `QuizNext.done`); this is purely UI.
  final int itemCount;

  /// Total session window. Drives the countdown timer (seconds = minutes
  /// × 60). Smaller values are useful for tests — see
  /// `phase_3c_full_v3_test.dart` Task 3 fixtures (minutes: 1).
  final int totalMinutes;

  /// Called when the server signals the session is complete. Caller is
  /// expected to pushReplace into the result screen with this sessionId.
  final void Function(String sessionId) onCompleted;

  /// Called when the user confirms ✕ (after the exit-confirm dialog) or
  /// when the empty-state Back button is tapped from an unrecoverable
  /// error. Caller decides where to go (usually `Navigator.pop`).
  final VoidCallback onBack;

  const VidyaMockSessionScreen({
    super.key,
    required this.client,
    required this.blueprintId,
    required this.blueprintName,
    required this.userId,
    required this.itemCount,
    required this.totalMinutes,
    required this.onCompleted,
    required this.onBack,
  });

  @override
  State<VidyaMockSessionScreen> createState() => _VidyaMockSessionScreenState();
}

class _VidyaMockSessionScreenState extends State<VidyaMockSessionScreen> {
  QuizSessionStartFromBlueprint? _session;
  QuizItem? _item;
  int? _selectedIdx;
  bool _submitting = false;
  String? _error;
  int _servedCount = 0;
  late int _remainingSeconds;
  bool _expired = false;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _remainingSeconds = widget.totalMinutes * 60;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_remainingSeconds > 0) {
          _remainingSeconds -= 1;
          if (_remainingSeconds == 0) {
            _expired = true;
            _ticker?.cancel();
          }
        }
      });
    });
    _start();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() {
      _error = null;
      _item = null;
      _session = null;
      _selectedIdx = null;
      _servedCount = 0;
    });
    try {
      final start = await widget.client.startFromBlueprint(
        blueprintId: widget.blueprintId,
        userId: widget.userId,
      );
      if (!mounted) return;
      setState(() => _session = start);
      await _fetchNext();
    } on QuizError catch (e) {
      if (mounted) {
        setState(() => _error = "We couldn't start your mock test. ${e.message}");
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't start your mock test.");
      }
    }
  }

  Future<void> _fetchNext() async {
    final sess = _session;
    if (sess == null) return;
    try {
      final result = await widget.client.next(sess.sessionId);
      if (!mounted) return;
      if (result.done || result.item == null) {
        widget.onCompleted(sess.sessionId);
        return;
      }
      setState(() {
        _item = result.item;
        _selectedIdx = null;
        _servedCount += 1;
      });
    } on QuizError catch (e) {
      if (e.code == QuizErrorCode.sessionDone) {
        widget.onCompleted(sess.sessionId);
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

  Future<void> _submit() async {
    if (_selectedIdx == null ||
        _submitting ||
        _item == null ||
        _session == null) {
      return;
    }
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.client.answer(
        _session!.sessionId,
        itemIdx: _item!.itemIdx,
        answerIdx: _selectedIdx!,
      );
      await _fetchNext();
    } on QuizError catch (e) {
      if (mounted) {
        setState(() => _error = "We couldn't record that answer. ${e.message}");
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't record that answer.");
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _retry() async {
    if (_session == null) {
      await _start();
    } else {
      setState(() => _error = null);
      await _fetchNext();
    }
  }

  /// Show the exit-confirm dialog and return whether the user tapped
  /// Exit. Caller decides what to do with the result (✕ button invokes
  /// `widget.onBack()`; the Android-back PopScope handler pops the route
  /// manually). Returns `false` if the dialog was dismissed or Cancel
  /// was tapped.
  Future<bool> _confirmExit() async {
    final exit = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Exit mock test?'),
        content: const Text('Your progress will be lost.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Exit'),
          ),
        ],
      ),
    );
    return exit == true;
  }

  /// Format remaining seconds as `HH:MM:SS` (Mock can run 3 hours so
  /// `MM:SS` would silently roll over).
  String _formatCountdown() {
    final s = _remainingSeconds.clamp(0, 24 * 3600);
    final h = s ~/ 3600;
    final m = (s % 3600) ~/ 60;
    final sec = s % 60;
    return '${h.toString().padLeft(2, '0')}:'
        '${m.toString().padLeft(2, '0')}:'
        '${sec.toString().padLeft(2, '0')}';
  }

  /// Resolve the section name for the currently-served question by
  /// walking the blueprint's per-section composed counts. QuizItem
  /// doesn't (yet) carry `sectionId`, so we treat the sections as a
  /// contiguous range partition over the served-count axis. Falls back
  /// to '' when the session hasn't loaded or sections are empty.
  String _currentSectionName() {
    final sess = _session;
    if (sess == null || sess.sections.isEmpty || _servedCount == 0) return '';
    var cumulative = 0;
    for (final s in sess.sections) {
      cumulative += s.nComposed;
      if (_servedCount <= cumulative) return s.name;
    }
    return sess.sections.last.name;
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    Widget closeButton() => IconButton(
          icon: Icon(Icons.close, color: ink),
          onPressed: () async {
            if (await _confirmExit()) widget.onBack();
          },
        );

    // Wrap the whole screen in PopScope so the Android system back
    // gesture / hardware back button funnels through `_confirmExit`
    // instead of silently popping a 3-hour Mock session. canPop: false
    // means Flutter never auto-pops; we pop manually if (and only if)
    // the user confirms via the dialog.
    Widget wrap(Widget child) => PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, _) async {
            if (didPop) return;
            if (await _confirmExit()) {
              widget.onBack();
            }
          },
          child: child,
        );

    if (_error != null) {
      return wrap(VidyaScaffold(
        appBar: VidyaAppBar(title: '', actions: [closeButton()]),
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
                label: 'Close',
                style: VidyaButtonStyle.ghost,
                onPressed: widget.onBack,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      ),);
    }

    if (_item == null) {
      return wrap(VidyaScaffold(
        appBar: VidyaAppBar(title: '', actions: [closeButton()]),
        body: const Center(child: CircularProgressIndicator()),
      ),);
    }

    final q = _item!;
    final sectionName = _currentSectionName();
    final total = widget.itemCount;

    return wrap(VidyaScaffold(
      appBar: VidyaAppBar(
        title: _formatCountdown(),
        actions: [closeButton()],
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.blueprintName,
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: muted,
                letterSpacing: 1.4,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Text(
                    sectionName.isEmpty
                        ? 'Section'
                        : 'Section: $sectionName',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: ink,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  'Question $_servedCount of $total',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 12,
                    color: muted,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (_expired) ...[
              VidyaBanner(
                tone: VidyaBannerTone.warn,
                message: "Time's up — please submit your answers.",
              ),
              const SizedBox(height: 12),
            ],
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
                    onTap: _submitting
                        ? null
                        : () => setState(() => _selectedIdx = i),
                    tone: selected
                        ? VidyaCardTone.accent
                        : VidyaCardTone.defaultTone,
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
            const SizedBox(height: 12),
            VidyaButton(
              key: const Key('vidya.mock.session.submit'),
              label: _submitting ? 'Saving…' : 'Submit answer',
              onPressed: _selectedIdx == null || _submitting ? null : _submit,
              disabled: _selectedIdx == null || _submitting,
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    ),);
  }
}
