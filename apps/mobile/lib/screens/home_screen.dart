import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';

/// Sprint 3 mobile home — shows the user's name + a quick-launch CTA for the
/// seeded Mechanics topic. Catalog browse + readiness dashboard land in
/// Sprint 4 (currently web-student-only).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.auth, required this.onSignOut});

  final AuthClient auth;
  final VoidCallback onSignOut;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _mechanicsTopicId = '33333333-0000-0000-0000-000000000001';

  bool _starting = false;
  String? _error;

  Future<void> _startQuiz() async {
    final user = widget.auth.user;
    if (user == null || _starting) return;
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final client = QuizClient(auth: widget.auth);
      final session = await client.start(topicId: _mechanicsTopicId, userId: user.id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: session.sessionId),
      ),);
    } on QuizError catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user;
    return Scaffold(
      appBar: AppBar(
        title: Text('Hi, ${user?.firstName ?? 'there'}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: widget.onSignOut,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AlpColors.surfacePrimary,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AlpColors.borderDefault),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Mechanics',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: AlpColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Practice motion, forces, and energy.',
                    style: TextStyle(color: AlpColors.textSecondary, fontSize: 14),
                  ),
                  const SizedBox(height: 16),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AlpColors.dangerBg,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _error!,
                          style: TextStyle(color: AlpColors.dangerFg),
                        ),
                      ),
                    ),
                  FilledButton(
                    onPressed: _starting ? null : _startQuiz,
                    style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
                    child: Text(_starting ? 'Starting…' : 'Start practice quiz'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Catalog browse + readiness dashboard land in the next mobile pass.',
              style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
