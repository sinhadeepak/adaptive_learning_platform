// VidyaRevisionScreen — Phase 4. Spaced-repetition (SM-2) revision queue,
// the mobile counterpart of web's Revision.tsx. Lists topics that are due
// for review (from /analytics/revision/{userId}) with their overdue /
// interval / attempt metadata, and launches a focused practice session on
// the chosen topic through the shared polymorphic session screen.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/analytics.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_practice_result_screen.dart';
import 'vidya_practice_session_screen.dart';

enum _RevState { loading, loaded, empty, error }

class VidyaRevisionScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaRevisionScreen({super.key, required this.auth});

  @override
  State<VidyaRevisionScreen> createState() => _VidyaRevisionScreenState();
}

class _VidyaRevisionScreenState extends State<VidyaRevisionScreen> {
  _RevState _state = _RevState.loading;
  List<RevisionItem> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _state = _RevState.loading);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _RevState.empty);
      return;
    }
    try {
      final items = await AnalyticsClient(widget.auth).revisionDue(user.id);
      if (!mounted) return;
      setState(() {
        _items = items;
        _state = items.isEmpty ? _RevState.empty : _RevState.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _RevState.error);
    }
  }

  void _startRevision(RevisionItem item) {
    final userId = widget.auth.user?.id ?? '';
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VidyaPracticeSessionScreen(
          client: QuizClient(auth: widget.auth),
          topicId: item.topicId,
          userId: userId,
          onCompleted: (sessionId) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute<void>(
                builder: (_) => VidyaPracticeResultScreen(
                  client: QuizClient(auth: widget.auth),
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
      appBar: VidyaAppBar(title: 'Revision'),
      body: switch (_state) {
        _RevState.loading => const Center(child: CircularProgressIndicator()),
        _RevState.error => _RevError(onRetry: _load),
        _RevState.empty => const _RevEmpty(),
        _RevState.loaded => ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            children: [
              Text(
                'DUE FOR REVIEW',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: v.ink3,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${_items.length} ${_items.length == 1 ? "topic" : "topics"} '
                'scheduled by spaced repetition',
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink2,
                ),
              ),
              const SizedBox(height: 16),
              for (final item in _items) ...[
                _RevisionCard(item: item, onPractice: () => _startRevision(item)),
                const SizedBox(height: 10),
              ],
            ],
          ),
      },
    );
  }
}

class _RevisionCard extends StatelessWidget {
  final RevisionItem item;
  final VoidCallback onPractice;
  const _RevisionCard({required this.item, required this.onPractice});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final overdue = item.overdueDays > 0;
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item.topicTitle.isEmpty ? 'Topic' : item.topicTitle,
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                    ),
                  ),
                ),
                if (overdue)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: v.bad.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${item.overdueDays}d overdue',
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: v.bad,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              [
                if (item.intervalDays != null)
                  'Interval ${item.intervalDays}d',
                if (item.attemptCount != null)
                  '${item.attemptCount} review${item.attemptCount == 1 ? '' : 's'}',
              ].join('  ·  '),
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
              ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: 'Revise now',
              onPressed: onPractice,
              size: VidyaButtonSize.md,
            ),
          ],
        ),
      ),
    );
  }
}

class _RevEmpty extends StatelessWidget {
  const _RevEmpty();

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_outline, size: 48, color: v.good),
            const SizedBox(height: 16),
            Text(
              "You're all caught up",
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: v.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Nothing is due for revision right now. Keep practising and '
              'topics will reappear here when they need a refresh.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink2,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RevError extends StatelessWidget {
  final VoidCallback onRetry;
  const _RevError({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          VidyaBanner(
            tone: VidyaBannerTone.warn,
            message: "We couldn't load your revision queue.",
            action: TextButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ),
        ],
      ),
    );
  }
}
