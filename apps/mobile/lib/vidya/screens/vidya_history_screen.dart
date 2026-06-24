// VidyaHistoryScreen — Phase D. Native session history (replaces the Aurora
// HistoryScreen). Lists recent quiz/mock sessions with mode, score and
// status; tapping opens the per-session deep-dive. Data: /quiz/sessions
// (ApiClient.sessionHistory).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_session_deep_dive_screen.dart';

class VidyaHistoryScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaHistoryScreen({super.key, required this.auth});

  @override
  State<VidyaHistoryScreen> createState() => _VidyaHistoryScreenState();
}

enum _State { loading, loaded, empty, error }

class _VidyaHistoryScreenState extends State<VidyaHistoryScreen> {
  _State _state = _State.loading;
  List<SessionHistoryRow> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _State.empty);
      return;
    }
    try {
      final items = await ApiClient(widget.auth).sessionHistory(user.id);
      if (!mounted) return;
      setState(() {
        _items = items;
        _state = items.isEmpty ? _State.empty : _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  void _openDeepDive(SessionHistoryRow row) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VidyaSessionDeepDiveScreen(
          client: QuizClient(auth: widget.auth),
          sessionId: row.sessionId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'History',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.empty => _EmptyState(v: v),
        _State.loaded => ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            itemCount: _items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _HistoryCard(
              row: _items[i],
              onTap: () => _openDeepDive(_items[i]),
            ),
          ),
      },
    );
  }
}

String _modeLabel(String mode) {
  switch (mode.toUpperCase()) {
    case 'PRACTICE':
      return 'Practice';
    case 'MOCK':
    case 'MOCK_BLUEPRINT':
      return 'Mock test';
    default:
      final l = mode.toLowerCase().replaceAll('_', ' ');
      return l.isEmpty ? 'Session' : '${l[0].toUpperCase()}${l.substring(1)}';
  }
}

String _dateOf(String iso) {
  final t = DateTime.tryParse(iso);
  if (t == null) return iso;
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
  return '${months[t.month - 1]} ${t.day}';
}

class _HistoryCard extends StatelessWidget {
  final SessionHistoryRow row;
  final VoidCallback onTap;
  const _HistoryCard({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final denom = row.servedCount > 0 ? row.servedCount : row.targetCount;
    final completed = row.status.toUpperCase() == 'COMPLETED';
    return VidyaCard(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _modeLabel(row.mode),
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: v.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_dateOf(row.startedAt)} · '
                      '${completed ? "completed" : row.status.toLowerCase()}',
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 11,
                        color: v.ink3,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                denom > 0 ? '${row.correctCount}/$denom' : '—',
                style: TextStyle(
                  fontFamily: VidyaFonts.display,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: v.ink,
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, size: 20, color: v.ink3),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VidyaThemeData v;
  const _EmptyState({required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'No sessions yet — your practice and mock history will appear here.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 15,
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
              "We couldn't load your history.",
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
