// VidyaScreeningResultScreen — reveal + persist gate.
// Calls reveal on init to show the score; on "Save & continue", calls
// persist + diagnosticComplete (FSM advance) then onCompleted (parent
// routes to home). Errors at either stage surface in a banner.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../screening_client.dart';

class VidyaScreeningResultScreen extends StatefulWidget {
  final ScreeningClient client;
  final String token;
  final VoidCallback onCompleted;

  const VidyaScreeningResultScreen({
    super.key,
    required this.client,
    required this.token,
    required this.onCompleted,
  });

  @override
  State<VidyaScreeningResultScreen> createState() =>
      _VidyaScreeningResultScreenState();
}

class _VidyaScreeningResultScreenState
    extends State<VidyaScreeningResultScreen> {
  ScreeningReveal? _reveal;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await widget.client.reveal(widget.token);
      if (mounted) setState(() => _reveal = r);
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't load your result. Try again later.");
      }
    }
  }

  Future<void> _saveAndContinue() async {
    if (_saving) return;
    setState(() {
      _error = null;
      _saving = true;
    });
    try {
      await widget.client.persist(widget.token);
      await widget.client.diagnosticComplete();
      widget.onCompleted();
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't save your result. Try again.");
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    if (_error != null && _reveal == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
          ),
        ),
      );
    }

    if (_reveal == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final r = _reveal!;
    final weakest = [...r.topicBreakdown]..sort((a, b) {
        final aR = a.total == 0 ? 0.0 : a.correct / a.total;
        final bR = b.total == 0 ? 0.0 : b.correct / b.total;
        return aR.compareTo(bR);
      });
    final top3 = weakest.take(3).toList();

    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 16),
                  Text(
                    'Calibrated!',
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 28,
                      fontWeight: FontWeight.w500,
                      color: ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Your starting readiness is set.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 14,
                      color: muted,
                    ),
                  ),
                  const SizedBox(height: 24),
                  VidyaCard(
                    tone: VidyaCardTone.accent,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Column(
                        children: [
                          Text(
                            '${r.scorePct.toStringAsFixed(0)}%',
                            style: TextStyle(
                              fontFamily: VidyaFonts.display,
                              fontSize: 56,
                              fontWeight: FontWeight.w600,
                              color: accent,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${r.correct} of ${r.total} correct',
                            style: TextStyle(
                              fontFamily: VidyaFonts.ui,
                              fontSize: 14,
                              color: muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (top3.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    Text(
                      'Focus areas',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: muted,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final t in top3) ...[
                      _TopicRow(topic: t),
                      const SizedBox(height: 8),
                    ],
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                  ],
                  const Spacer(),
                  VidyaButton(
                    key: const Key('vidya.screening.result.continue'),
                    label: _saving ? 'Saving…' : 'Save & continue',
                    onPressed: _saving ? null : _saveAndContinue,
                    disabled: _saving,
                    size: VidyaButtonSize.lg,
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _TopicRow extends StatelessWidget {
  final TopicBreakdown topic;
  const _TopicRow({required this.topic});

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accuracy = topic.total == 0 ? 0.0 : topic.correct / topic.total;
    final pct = (accuracy * 100).toStringAsFixed(0);
    return Row(children: [
      Expanded(
        child: Text(
          topic.topicId,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 14,
            color: ink,
          ),
        ),
      ),
      Text(
        '$pct% (${topic.correct}/${topic.total})',
        style: TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 13,
          color: muted,
        ),
      ),
    ]);
  }
}
