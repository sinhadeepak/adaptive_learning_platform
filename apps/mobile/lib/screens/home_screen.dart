// HomeScreen — Aurora v2 redesign (Sprint 3 minimal entry).
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §13.4
//
// This is the Sprint-3-era simple home screen wired to a single
// seeded Mechanics topic. The richer dashboard lives in home_tab.dart.
// Aurora pass replaces hand-rolled Container/Card with AuroraCard +
// AuroraButton and adopts AuroraScaffold/AuroraAppBar chrome.
//
// All AuthClient + QuizClient API surface preserved verbatim.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../aurora/widgets/widgets.dart';
import '../auth/auth_client.dart';
import '../quiz/content_language_helper.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';

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
      final api = ApiClient(widget.auth);
      final langField = await contentLanguageField(api);
      final client = QuizClient(auth: widget.auth);
      final session = await client.start(
        topicId: _mechanicsTopicId,
        userId: user.id,
        extraFields: langField,
      );
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) =>
              QuizScreen(client: client, sessionId: session.sessionId),
        ),
      );
    } on QuizError catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final user = widget.auth.user;

    return AuroraScaffold(
      appBar: AuroraAppBar(
        title: 'Hi, ${user?.firstName ?? 'there'}',
        actions: [
          AuroraIconButton(
            icon: const Icon(Icons.logout),
            semanticLabel: 'Sign out',
            onPressed: widget.onSignOut,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          AuroraCard(
            padding: AuroraCardPadding.lg,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    AuroraTag(
                      label: 'Physics',
                      tone: AuroraTagTone.brand,
                      variant: AuroraTagVariant.soft,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'Mechanics',
                  style: typography.h2.copyWith(color: colors.neutral900),
                ),
                const SizedBox(height: 4),
                Text(
                  'Practice motion, forces, and energy.',
                  style: typography.body.copyWith(color: colors.neutral600),
                ),
                const SizedBox(height: 16),
                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: colors.danger50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.error_outline,
                          size: 18,
                          color: colors.danger600,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _error!,
                            style: typography.bodySm.copyWith(
                              color: colors.danger600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                AuroraButton(
                  label: _starting ? 'Starting…' : 'Start practice quiz',
                  variant: AuroraButtonVariant.aurora,
                  size: AuroraButtonSize.lg,
                  fullWidth: true,
                  loading: _starting,
                  iconLeft: const Text('✦'),
                  onPressed: _starting ? null : _startQuiz,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              'Catalog browse + readiness dashboard land in the next mobile pass.',
              style: typography.bodySm.copyWith(color: colors.neutral500),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}
