import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_result_screen.dart';
import '../quiz/quiz_screen.dart';
import '../widgets/alp_card.dart';
import 'mock_result_screen.dart';

/// Practice history — every quiz session this user has run, newest first.
/// Tap a row to revisit the result; in-progress sessions resume the quiz.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  bool _loading = true;
  String? _error;
  List<SessionHistoryRow> _items = const [];
  List<MockAttemptRow> _mocks = const [];
  final Map<String, String> _topicTitles = <String, String>{};
  String _filter = 'all'; // 'all' | 'submitted' | 'in-progress'

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
      final results = await Future.wait([
        widget.api.sessionHistory(user.id, limit: 100),
        widget.api.mockAttempts(),
      ]);
      final rows = results[0] as List<SessionHistoryRow>;
      final mocks = results[1] as List<MockAttemptRow>;
      if (!mounted) return;
      setState(() {
        _items = rows;
        _mocks = mocks;
        _loading = false;
      });
      // Background topic-title fan-out — tolerate failures.
      final unique = rows.map((r) => r.topicId).toSet();
      for (final id in unique) {
        if (_topicTitles.containsKey(id)) continue;
        try {
          final t = await widget.api.topic(id);
          if (!mounted) return;
          if (t != null) setState(() => _topicTitles[id] = t.title);
        } catch (_) {/* keep going */}
      }
    } catch (e) {
      if (mounted) setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  List<SessionHistoryRow> get _filtered {
    if (_filter == 'submitted') return _items.where((r) => r.status == 'SUBMITTED').toList();
    if (_filter == 'in-progress') return _items.where((r) => r.status == 'IN_PROGRESS').toList();
    return _items;
  }

  void _openMock(MockAttemptRow m) {
    // Synthesise rankLow/rankHigh from the persisted projectedRank +
    // confidence band so the inline result page renders the same way as
    // the just-scored flow does.
    final rank = m.projectedRank ?? 0;
    final conf = (m.confidence ?? 'low').toLowerCase();
    final halfWidth = conf == 'high' ? 0.05 : conf == 'medium' ? 0.15 : 0.30;
    final result = MockResult(
      examCode: m.examCode,
      examName: m.examName ?? m.examCode,
      rawScore: m.rawScore,
      maxMarks: m.maxMarks,
      accuracy: m.accuracy,
      totalQuestions: m.totalQuestions,
      nCorrect: m.nCorrect,
      nWrong: m.nWrong,
      nUnanswered: m.nUnanswered,
      percentile: m.percentile ?? 0,
      projectedRank: rank,
      rankLow: rank > 0 ? (rank * (1 - halfWidth)).round().clamp(1, 1 << 30) : 0,
      rankHigh: rank > 0 ? (rank * (1 + halfWidth)).round() : 0,
      confidence: conf,
      sections: m.sections,
    );
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => MockResultScreen(result: result),
    ));
  }

  Future<void> _open(SessionHistoryRow r) async {
    final client = QuizClient(auth: widget.auth);
    if (r.status == 'IN_PROGRESS') {
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: r.sessionId, api: widget.api),
      ));
    } else {
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizResultScreen(client: client, sessionId: r.sessionId, api: widget.api),
      ));
    }
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(
        title: const Text('Practice history'),
        backgroundColor: AlpColors.bgSurface1,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  for (final f in const ['all', 'submitted', 'in-progress']) ...[
                    _FilterChip(
                      label: f == 'in-progress'
                          ? 'In progress'
                          : f[0].toUpperCase() + f.substring(1),
                      selected: _filter == f,
                      onTap: () => setState(() => _filter = f),
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
                        : (_filtered.isEmpty && _mocks.isEmpty)
                            ? const _EmptyState()
                            : ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                                children: [
                                  for (final r in _filtered) ...[
                                    _HistoryRow(
                                      row: r,
                                      title: _topicTitles[r.topicId],
                                      onTap: () => _open(r),
                                    ),
                                    const SizedBox(height: 10),
                                  ],
                                  if (_mocks.isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Padding(
                                      padding: const EdgeInsets.fromLTRB(4, 12, 4, 6),
                                      child: Text(
                                        'MOCK TESTS · ${_mocks.length}',
                                        style: const TextStyle(
                                          color: AlpColors.textMuted,
                                          fontSize: 11,
                                          letterSpacing: 0.8,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                    for (final m in _mocks) ...[
                                      _MockRow(mock: m, onTap: () => _openMock(m)),
                                      const SizedBox(height: 10),
                                    ],
                                  ],
                                ],
                              ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AlpColors.colorBlue : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? AlpColors.colorBlue : AlpColors.borderDefault,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : AlpColors.textPrimary,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.row, required this.title, required this.onTap});
  final SessionHistoryRow row;
  final String? title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final pct = row.servedCount > 0
        ? ((row.correctCount / row.servedCount) * 100).round()
        : 0;
    final inProgress = row.status == 'IN_PROGRESS';
    final tone = inProgress
        ? AlpColors.colorAmber
        : row.status == 'EXPIRED'
            ? AlpColors.textMuted
            : pct >= 80
                ? AlpColors.colorGreen
                : pct >= 50
                    ? AlpColors.colorBlue
                    : AlpColors.colorRed;
    final pillLabel = inProgress
        ? 'IN PROGRESS'
        : row.status == 'EXPIRED'
            ? 'EXPIRED'
            : '$pct%';
    final modePillLabel = row.mode == 'MOCK' ? 'Mock test' : 'Practice';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AlpCard(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                AlpPill(label: modePillLabel, color: AlpColors.colorPurple),
                const SizedBox(width: 6),
                AlpPill(label: pillLabel, color: tone),
                const Spacer(),
                Text(
                  _relative(row.startedAt),
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              title ?? 'Topic #${row.topicId.substring(0, 8)}',
              style: const TextStyle(
                color: AlpColors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${row.correctCount} correct of ${row.servedCount} answered'
              '${(row.targetCount > row.servedCount && inProgress) ? ' · ${row.targetCount - row.servedCount} remaining' : ''}',
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class _MockRow extends StatelessWidget {
  const _MockRow({required this.mock, required this.onTap});
  final MockAttemptRow mock;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final pct = mock.maxMarks > 0
        ? ((mock.rawScore / mock.maxMarks) * 100).round()
        : 0;
    final tone = pct >= 70
        ? AlpColors.colorGreen
        : pct >= 40
            ? AlpColors.colorBlue
            : AlpColors.colorRed;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AlpCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AlpPill(label: 'Mock test', color: AlpColors.colorPurple),
              const SizedBox(width: 6),
              AlpPill(
                label: '${mock.rawScore}/${mock.maxMarks} · $pct%',
                color: tone,
              ),
              const Spacer(),
              Text(
                _relative(mock.createdAt),
                style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            mock.examName ?? mock.examCode,
            style: const TextStyle(
              color: AlpColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${mock.nCorrect} correct · ${mock.nWrong} wrong · ${mock.nUnanswered} skipped'
            '${mock.percentile != null ? ' · ${mock.percentile!.toStringAsFixed(1)} percentile' : ''}'
            '${mock.projectedRank != null ? ' · projected AIR ~${mock.projectedRank}' : ''}',
            style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
          ),
        ],
      ),
      ),
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
        Icon(Icons.history, color: AlpColors.textMuted, size: 56),
        SizedBox(height: 12),
        Center(
          child: Text(
            'No practice sessions yet',
            style: TextStyle(color: AlpColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
        SizedBox(height: 6),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 32),
          child: Center(
            child: Text(
              'Start a quiz from the Practice tab — completed runs and any in-progress sessions appear here.',
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
