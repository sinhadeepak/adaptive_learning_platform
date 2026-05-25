// VidyaScreeningQuizScreen — runs the adaptive screening loop.
// Calls ScreeningClient.start on init, then loops next → answer until
// ScreeningComplete arrives, at which point it surfaces the token to
// the parent via onCompleted. Errors surface in a VidyaBanner with a
// Skip-only escape hatch.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../screening_client.dart';

class VidyaScreeningQuizScreen extends StatefulWidget {
  final ScreeningClient client;
  final String examCode;
  final void Function(String token) onCompleted;
  final VoidCallback onBack;

  const VidyaScreeningQuizScreen({
    super.key,
    required this.client,
    required this.examCode,
    required this.onCompleted,
    required this.onBack,
  });

  @override
  State<VidyaScreeningQuizScreen> createState() =>
      _VidyaScreeningQuizScreenState();
}

class _VidyaScreeningQuizScreenState extends State<VidyaScreeningQuizScreen> {
  String? _token;
  ScreeningQuestion? _question;
  int? _selectedIdx;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      final start = await widget.client.start(examCode: widget.examCode);
      _token = start.token;
      await _fetchNext();
    } on ScreeningUnavailable catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = "We couldn't start the diagnostic.");
    }
  }

  Future<void> _fetchNext() async {
    final result = await widget.client.next(_token!);
    if (!mounted) return;
    if (result is ScreeningComplete) {
      widget.onCompleted(_token!);
      return;
    }
    setState(() {
      _question = result as ScreeningQuestion;
      _selectedIdx = null;
    });
  }

  Future<void> _submit() async {
    if (_selectedIdx == null || _submitting || _question == null) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.client.answer(
        _token!,
        itemIdx: _question!.itemIdx,
        answerIdx: _selectedIdx!,
      );
      await _fetchNext();
    } catch (_) {
      if (mounted) setState(() => _error = "We couldn't record that answer.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
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
          leading: IconButton(
            icon: Icon(Icons.arrow_back, color: ink),
            onPressed: widget.onBack,
          ),
        ),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
              const Spacer(),
              VidyaButton(
                label: 'Skip',
                onPressed: widget.onBack,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      );
    }

    if (_question == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final q = _question!;
    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Question ${q.itemIdx + 1} of ${q.total}',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 12,
                color: muted,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: (q.itemIdx + 1) / q.total,
                minHeight: 4,
                backgroundColor: muted.withValues(alpha: 0.2),
                valueColor: AlwaysStoppedAnimation<Color>(accent),
              ),
            ),
            const SizedBox(height: 24),
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
                            child: RichText(
                              text: TextSpan(
                                text: String.fromCharCode(65 + i),
                                style: TextStyle(
                                  fontFamily: VidyaFonts.ui,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: selected ? Colors.white : ink,
                                ),
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
              key: const Key('vidya.screening.quiz.submit'),
              label: _submitting ? 'Saving…' : 'Submit',
              onPressed: _selectedIdx == null || _submitting ? null : _submit,
              disabled: _selectedIdx == null || _submitting,
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }
}
