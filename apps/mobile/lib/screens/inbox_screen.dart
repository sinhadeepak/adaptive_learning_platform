import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_result_screen.dart';
import '../widgets/alp_card.dart';
import 'doubt_detail_screen.dart';
import 'mock_result_screen.dart';

/// In-app notification inbox — pulls from the notification service.
/// Tap any unread row to mark it read; tap-and-route to the relevant
/// surface (quiz result for `quiz.completed`, doubts for `doubt.answered`).
class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  bool _loading = true;
  String? _error;
  InboxPage _page = InboxPage.empty();
  bool _busy = false;
  String _filter = 'all'; // 'all' | 'unread'

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final user = widget.auth.user;
    if (user == null) {
      setState(() {
        _loading = false;
        _error = 'Not signed in';
      });
      return;
    }
    try {
      final p = await widget.api.inbox(user.id);
      if (!mounted) return;
      setState(() {
        _page = p;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  Future<void> _markOne(InboxItem n) async {
    final user = widget.auth.user;
    if (user == null || !n.unread) return;
    setState(() {
      _page = InboxPage(
        unreadCount: (_page.unreadCount - 1).clamp(0, 1 << 30),
        items: _page.items
            .map((it) => it.id == n.id
                ? InboxItem(
                    id: it.id,
                    type: it.type,
                    channel: it.channel,
                    payload: it.payload,
                    createdAt: it.createdAt,
                    readAt: DateTime.now().toUtc().toIso8601String(),
                  )
                : it)
            .toList(),
      );
    });
    await widget.api.markNotificationRead(user.id, n.id);
  }

  Future<void> _markAll() async {
    final user = widget.auth.user;
    if (user == null || _busy) return;
    setState(() => _busy = true);
    try {
      await widget.api.markAllNotificationsRead(user.id);
      final now = DateTime.now().toUtc().toIso8601String();
      if (!mounted) return;
      setState(() {
        _page = InboxPage(
          unreadCount: 0,
          items: _page.items
              .map((it) => InboxItem(
                    id: it.id,
                    type: it.type,
                    channel: it.channel,
                    payload: it.payload,
                    createdAt: it.createdAt,
                    readAt: it.readAt ?? now,
                  ))
              .toList(),
        );
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(InboxItem n) async {
    await _markOne(n);
    if (!mounted) return;
    if (n.type == 'quiz.completed') {
      final sessionId = n.payload['sessionId'];
      if (sessionId is String && sessionId.isNotEmpty) {
        final client = QuizClient(auth: widget.auth);
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => QuizResultScreen(
            client: client,
            sessionId: sessionId,
            api: widget.api,
          ),
        ));
      }
    } else if (n.type == 'doubt.answered') {
      final doubtId = n.payload['doubtId'];
      if (doubtId is String && doubtId.isNotEmpty) {
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => DoubtDetailScreen(api: widget.api, doubtId: doubtId),
        ));
      }
    } else if (n.type == 'mock.completed') {
      // Hydrate the persisted attempt so we can re-render the result page
      // without a new score round-trip. Falls back to a no-op when the
      // attempt id isn't reachable.
      final attemptId = n.payload['attemptId'];
      if (attemptId is String && attemptId.isNotEmpty) {
        final attempts = await widget.api.mockAttempts();
        final match = attempts.firstWhere(
          (a) => a.id == attemptId,
          orElse: () => MockAttemptRow(
            id: '',
            examCode: '',
            examName: null,
            rawScore: 0,
            maxMarks: 0,
            accuracy: 0,
            totalQuestions: 0,
            nCorrect: 0,
            nWrong: 0,
            nUnanswered: 0,
            createdAt: '',
          ),
        );
        if (match.id.isEmpty || !mounted) return;
        final rank = match.projectedRank ?? 0;
        final conf = (match.confidence ?? 'low').toLowerCase();
        final halfWidth = conf == 'high' ? 0.05 : conf == 'medium' ? 0.15 : 0.30;
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => MockResultScreen(
            result: MockResult(
              examCode: match.examCode,
              examName: match.examName ?? match.examCode,
              rawScore: match.rawScore,
              maxMarks: match.maxMarks,
              accuracy: match.accuracy,
              totalQuestions: match.totalQuestions,
              nCorrect: match.nCorrect,
              nWrong: match.nWrong,
              nUnanswered: match.nUnanswered,
              percentile: match.percentile ?? 0,
              projectedRank: rank,
              rankLow:
                  rank > 0 ? (rank * (1 - halfWidth)).round().clamp(1, 1 << 30) : 0,
              rankHigh: rank > 0 ? (rank * (1 + halfWidth)).round() : 0,
              confidence: conf,
              sections: match.sections,
            ),
          ),
        ));
      }
    }
    // streak.milestone / goal.reached are presentational — no destination.
  }

  @override
  Widget build(BuildContext context) {
    final unread = _page.unreadCount;
    final filtered = _filter == 'unread'
        ? _page.items.where((i) => i.unread).toList()
        : _page.items;
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(
        title: Text(unread > 0 ? 'Inbox · $unread unread' : 'Inbox'),
        backgroundColor: AlpColors.bgSurface1,
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: _busy ? null : _markAll,
              child: Text(_busy ? 'Marking…' : 'Mark all read',
                  style: const TextStyle(color: AlpColors.colorAi, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  for (final f in const ['all', 'unread']) ...[
                    GestureDetector(
                      onTap: () => setState(() => _filter = f),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: _filter == f ? AlpColors.colorBlue : Colors.transparent,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: _filter == f ? AlpColors.colorBlue : AlpColors.borderDefault,
                          ),
                        ),
                        child: Text(
                          f == 'unread'
                              ? (unread > 0 ? 'Unread ($unread)' : 'Unread')
                              : 'All',
                          style: TextStyle(
                            color: _filter == f ? Colors.white : AlpColors.textPrimary,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                color: AlpColors.colorAi,
                backgroundColor: AlpColors.bgSurface2,
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: AlpColors.colorAi))
                    : _error != null
                        ? _ErrorState(error: _error!, onRetry: _load)
                        : filtered.isEmpty
                            ? _InboxEmptyState(filter: _filter)
                            : ListView.separated(
                                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                                physics: const AlwaysScrollableScrollPhysics(),
                                itemCount: filtered.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 8),
                                itemBuilder: (_, i) => _NotifRow(
                                  item: filtered[i],
                                  onTap: () => _open(filtered[i]),
                                ),
                              ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotifRow extends StatelessWidget {
  const _NotifRow({required this.item, required this.onTap});
  final InboxItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: item.unread ? AlpColors.bgSurface2 : AlpColors.bgSurface1,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: item.unread ? AlpColors.colorBlue : AlpColors.borderDefault,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                AlpPill(
                  label: _prettyType(item.type),
                  color: item.unread ? AlpColors.colorBlue : AlpColors.textMuted,
                ),
                const Spacer(),
                Text(
                  _relative(item.createdAt),
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                ),
                if (item.unread) ...[
                  const SizedBox(width: 6),
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AlpColors.colorBlue,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Text(
              inboxSummary(item),
              style: const TextStyle(color: AlpColors.textPrimary, fontSize: 14, height: 1.45),
            ),
          ],
        ),
      ),
    );
  }
}

String _prettyType(String t) {
  final stripped = t.replaceFirst(RegExp(r'^[a-zA-Z]+\.'), '');
  return stripped.replaceAll(RegExp(r'[._]'), ' ').toUpperCase();
}

String inboxSummary(InboxItem n) {
  final p = n.payload;
  if (n.type == 'quiz.completed') {
    final score = p['score'];
    final pct = score is num ? (score * 100).round() : null;
    if (pct != null) return 'Practice session scored — $pct% accuracy.';
    return 'Practice session completed.';
  }
  if (n.type == 'streak.milestone') {
    final days = p['days'];
    if (days is num) return '🔥 ${days.toInt()}-day streak — keep it going!';
    return 'Streak milestone reached.';
  }
  if (n.type == 'streak.broken') {
    final prev = p['previousStreak'];
    if (prev is num) {
      return "Streak reset — you lost a ${prev.toInt()}-day run, but you're back. Fresh start today.";
    }
    return 'Streak reset — fresh start today.';
  }
  if (n.type == 'goal.reached') {
    final goal = p['goalMinutes'];
    if (goal is num) return '✓ Daily goal hit — ${goal.toInt()} minutes today!';
    return 'Daily goal reached.';
  }
  if (n.type == 'mock.completed') {
    final exam = (p['examName'] as String?) ?? (p['examCode'] as String?) ?? 'Mock test';
    final pct = p['scorePct'];
    final rank = p['projectedRank'];
    final parts = <String>[];
    if (pct is num) parts.add('${pct.toInt()}% accuracy');
    if (rank is num) parts.add('projected AIR ~${rank.toInt()}');
    return parts.isNotEmpty ? '$exam scored — ${parts.join(' · ')}.' : '$exam scored.';
  }
  if (n.type == 'doubt.answered') {
    return 'An expert or AI tutor replied to your doubt.';
  }
  if (n.type == 'achievement.unlocked') {
    final kind = (p['kind'] as String?) ?? '';
    if (kind.startsWith('streak_')) {
      final days = p['days'];
      if (days is num) return '🏆 Achievement: ${days.toInt()}-day streak';
      return '🏆 Achievement unlocked';
    }
    if (kind == 'first_session') return '🎯 Achievement: First session completed';
    if (kind == 'daily_goal_first') return '✓ Achievement: First daily goal hit';
    if (kind == 'mock_first') return '🎓 Achievement: First mock test completed';
    return '🏆 Achievement unlocked: ${kind.replaceAll('_', ' ')}';
  }
  return n.type.replaceFirst(RegExp(r'^[a-zA-Z]+\.'), '').replaceAll(RegExp(r'[._]'), ' ');
}

String _relative(String iso) {
  try {
    final t = DateTime.parse(iso).toLocal();
    final delta = DateTime.now().difference(t);
    if (delta.inSeconds < 60) return 'just now';
    if (delta.inMinutes < 60) return '${delta.inMinutes}m ago';
    if (delta.inHours < 24) return '${delta.inHours}h ago';
    if (delta.inDays < 7) return '${delta.inDays}d ago';
    return '${t.day}/${t.month}/${t.year}';
  } catch (_) {
    return iso;
  }
}

class _InboxEmptyState extends StatelessWidget {
  const _InboxEmptyState({required this.filter});
  final String filter;

  @override
  Widget build(BuildContext context) {
    final caughtUp = filter == 'unread';
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Icon(
          caughtUp ? Icons.celebration : Icons.notifications_none,
          color: AlpColors.textMuted,
          size: 56,
        ),
        const SizedBox(height: 12),
        Center(
          child: Text(
            caughtUp ? 'All caught up' : 'No notifications yet',
            style: const TextStyle(
              color: AlpColors.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Center(
            child: Text(
              caughtUp
                  ? 'Nothing unread. Switch to All to revisit older notifications.'
                  : 'Quiz results, streak milestones, and tutor replies show up here.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 13, height: 1.4),
            ),
          ),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: const [
        SizedBox(height: 80),
        Icon(Icons.notifications_none, color: AlpColors.textMuted, size: 56),
        SizedBox(height: 12),
        Center(
          child: Text(
            'No notifications yet',
            style: TextStyle(color: AlpColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
        SizedBox(height: 6),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 32),
          child: Center(
            child: Text(
              'Quiz results, streak milestones, and tutor replies show up here.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AlpColors.textMuted, fontSize: 13, height: 1.4),
            ),
          ),
        ),
      ],
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, required this.onRetry});
  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(error,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AlpColors.colorRed)),
          ),
        ),
        const SizedBox(height: 12),
        Center(
          child: TextButton(onPressed: onRetry, child: const Text('Retry')),
        ),
      ],
    );
  }
}
