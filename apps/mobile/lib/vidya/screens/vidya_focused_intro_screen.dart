// VidyaFocusedIntroScreen — Phase 3c.full v2 Task 1.
//
// Intermediate screen between the Practice landing card and the
// session loop. On mount it fetches `InsightsClient.fetchSnapshot(userId)`,
// picks `weakConcepts[0]` (lowest EWA — sorted defensively client-side
// because the backend builds the list in last_seen_at order, not EWA
// order), then resolves a human-readable label via
// `ApiClient.topic(topicId)`. Renders eyebrow + topic name + EWA hint
// + Start CTA; tapping Start hands the topicId back to the parent via
// `onStart(topicId, topicLabel)` so the caller can push the session
// screen with its own full callback wiring (matches Quick's pattern).
//
// States:
//   loading        — two VidyaSkeletonBlocks (eyebrow + topic name)
//   empty          — no weak concepts yet → cold-start copy + Back CTA
//   error          — VidyaBanner + Retry
//   loaded         — eyebrow / topic name / EWA hint / body / Start CTA
//
// Label resolution degrades gracefully: if /catalog/topics/{id} fails
// we fall back to the raw conceptId and never block the Start CTA.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../insights/insights_client.dart';
import '../../quiz/quiz_client.dart';

class VidyaFocusedIntroScreen extends StatefulWidget {
  final QuizClient client;
  final InsightsClient insights;
  final String userId;

  /// Called when the user taps "Start focused session"; receives the
  /// resolved topicId so the session screen can be pushed with the
  /// caller's full callback wiring.
  final void Function(String topicId, String topicLabel) onStart;
  final VoidCallback onBack;

  const VidyaFocusedIntroScreen({
    super.key,
    required this.client,
    required this.insights,
    required this.userId,
    required this.onStart,
    required this.onBack,
  });

  @override
  State<VidyaFocusedIntroScreen> createState() =>
      _VidyaFocusedIntroScreenState();
}

class _VidyaFocusedIntroScreenState extends State<VidyaFocusedIntroScreen> {
  InsightsSnapshot? _snapshot;
  String? _topicLabel;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _snapshot = null;
      _topicLabel = null;
    });
    try {
      final snap = await widget.insights.fetchSnapshot(widget.userId);
      if (!mounted) return;
      // Defensive: backend builds weak_concepts in last_seen_at order,
      // not EWA order — sort ascending so weakest is first.
      // TODO(engagement): drop this sort once
      // services/engagement/src/engagement/analytics/routes.py orders
      // weak_concepts by ewa ASC (currently ORDER BY last_seen_at DESC
      // at routes.py:749, then appended to weak_concepts in
      // last_seen_at order without re-sort).
      // Tiebreaker on conceptId because Dart's List.sort is not stable —
      // two concepts with identical EWA could otherwise swap order
      // between renders.
      final sorted = List<ConceptRow>.of(snap.weakConcepts)
        ..sort((a, b) {
          final c = a.ewa.compareTo(b.ewa);
          return c != 0 ? c : a.conceptId.compareTo(b.conceptId);
        });
      final patched = InsightsSnapshot(
        userId: snap.userId,
        conceptMastery: snap.conceptMastery,
        topicDecay: snap.topicDecay,
        readiness: snap.readiness,
        weakConcepts: sorted,
        decayAlerts: snap.decayAlerts,
        missionsTodayPending: snap.missionsTodayPending,
        revisionDueToday: snap.revisionDueToday,
      );

      setState(() {
        _snapshot = patched;
        _loading = false;
      });

      if (sorted.isNotEmpty) {
        // Best-effort label resolution. Never blocks the Start CTA —
        // if the catalog fetch fails we leave _topicLabel null and
        // the build method falls back to the raw conceptId.
        await _resolveLabel(sorted.first.conceptId);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = "We couldn't load your focus topic.";
          _loading = false;
        });
      }
    }
  }

  Future<void> _resolveLabel(String topicId) async {
    try {
      final api = ApiClient(widget.client.auth);
      final t = await api.topic(topicId);
      if (!mounted) return;
      if (t != null) {
        setState(() => _topicLabel = t.title);
      }
    } catch (_) {
      // Swallow — falls back to conceptId in build.
    }
  }

  Future<void> _retry() async {
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    if (_loading) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          actions: [
            IconButton(
              icon: Icon(Icons.close, color: ink),
              onPressed: widget.onBack,
            ),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              SizedBox(height: 8),
              VidyaSkeletonBlock(width: 140, height: 12),
              SizedBox(height: 24),
              VidyaSkeletonBlock(width: 260, height: 32),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          actions: [
            IconButton(
              icon: Icon(Icons.close, color: ink),
              onPressed: widget.onBack,
            ),
          ],
        ),
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
      );
    }

    final weak = _snapshot?.weakConcepts ?? const <ConceptRow>[];
    if (weak.isEmpty) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          actions: [
            IconButton(
              icon: Icon(Icons.close, color: ink),
              onPressed: widget.onBack,
            ),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'FOCUSED PRACTICE',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: muted,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                "You don't have a weak topic yet. Answer a few more "
                'Quick Practice questions so we can spot patterns — '
                'Focused mode unlocks once we see consistent struggles '
                'on a concept.',
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 15,
                  color: theme.ink2,
                  height: 1.5,
                ),
              ),
              const Spacer(),
              VidyaButton(
                label: 'Back',
                style: VidyaButtonStyle.ghost,
                onPressed: widget.onBack,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      );
    }

    final weakest = weak.first;
    final label = _topicLabel ?? weakest.conceptId;
    final ewaStr = weakest.ewa.toStringAsFixed(2);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        actions: [
          IconButton(
            icon: Icon(Icons.close, color: ink),
            onPressed: widget.onBack,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'FOCUSED PRACTICE',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: muted,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              label,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 32,
                fontWeight: FontWeight.w500,
                color: ink,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Your weakest topic right now (EWA $ewaStr).',
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: theme.ink2,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              "We'll serve 10 questions targeting this concept. "
              'Answer carefully — your mastery score will update.',
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: theme.ink2,
                height: 1.5,
              ),
            ),
            const Spacer(),
            VidyaButton(
              key: const Key('vidya.focused.intro.start'),
              label: 'Start focused session',
              onPressed: () => widget.onStart(weakest.conceptId, label),
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }
}
