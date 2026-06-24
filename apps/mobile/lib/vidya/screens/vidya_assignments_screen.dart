// VidyaAssignmentsScreen — Phase D. Native assignments inbox (replaces the
// Aurora AssignmentsScreen). Lists educator-assigned work with due date and
// completion status; "Start" launches it as a quiz session via
// /quiz/sessions/from-assignment. Data: AssignmentsClient.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/assignments.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_practice_result_screen.dart';
import 'vidya_practice_session_screen.dart';

class VidyaAssignmentsScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaAssignmentsScreen({super.key, required this.auth});

  @override
  State<VidyaAssignmentsScreen> createState() => _VidyaAssignmentsScreenState();
}

enum _State { loading, loaded, empty, error }

class _VidyaAssignmentsScreenState extends State<VidyaAssignmentsScreen> {
  late final AssignmentsClient _client = AssignmentsClient(widget.auth);
  _State _state = _State.loading;
  List<Assignment> _items = const [];
  String? _starting;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    try {
      final items = await _client.mine();
      if (!mounted) return;
      setState(() {
        _items = items;
        _state = items.isEmpty ? _State.empty : _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  Future<void> _start(Assignment a) async {
    final userId = widget.auth.user?.id ?? '';
    if (userId.isEmpty) return;
    setState(() => _starting = a.id);
    try {
      final q = await _client.startAsQuiz(a.id, userId: userId);
      if (!mounted) return;
      setState(() => _starting = null);
      final client = QuizClient(auth: widget.auth);
      Navigator.of(context)
          .push(
        MaterialPageRoute<void>(
          builder: (_) => VidyaPracticeSessionScreen(
            client: client,
            topicId: '',
            userId: userId,
            questionCount: q.itemCount,
            resumeSessionId: q.sessionId,
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
      )
          .then((_) {
        if (mounted) _load();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _starting = null);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't start that assignment.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Assignments',
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
            itemBuilder: (_, i) => _AssignmentCard(
              assignment: _items[i],
              starting: _starting == _items[i].id,
              onStart: () => _start(_items[i]),
            ),
          ),
      },
    );
  }
}

class _AssignmentCard extends StatelessWidget {
  final Assignment assignment;
  final bool starting;
  final VoidCallback onStart;
  const _AssignmentCard({
    required this.assignment,
    required this.starting,
    required this.onStart,
  });

  String? _due() {
    final d = assignment.dueAt;
    if (d == null) return null;
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
    return 'Due ${months[d.month - 1]} ${d.day}';
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final done = assignment.myCompletedAt != null;
    final due = _due();
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              assignment.title,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 18,
                fontWeight: FontWeight.w500,
                color: v.ink,
              ),
            ),
            if (assignment.description != null &&
                assignment.description!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                assignment.description!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink2,
                ),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                if (due != null)
                  Text(
                    due,
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      color: v.ink3,
                    ),
                  ),
                const Spacer(),
                if (done)
                  Text(
                    'Done · ${assignment.myCorrectCount ?? 0}/'
                    '${assignment.myTotalCount ?? 0}',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: v.good,
                    ),
                  )
                else
                  VidyaButton(
                    label: starting ? 'Starting…' : 'Start',
                    onPressed: starting ? null : onStart,
                    size: VidyaButtonSize.sm,
                  ),
              ],
            ),
          ],
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
          'No assignments yet — work your educator assigns will appear here.',
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
              "We couldn't load your assignments.",
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
