// VidyaTopicDetailScreen — Phase B (learning loop). Native topic surface
// reached from Study (subject detail) and Insights (FOCUS ON). Shows a
// mastery ring + stat tiles and launches a real topic-targeted practice
// session (previously a "coming soon" snackbar — the Study → topic →
// practice loop now actually runs).
//
// Prerequisite map / video shelf / related-questions (web's richer
// TopicDetail) need the catalog `concept` endpoint and are layered on in a
// later Phase-B slice.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_practice_result_screen.dart';
import 'vidya_practice_session_screen.dart';

class VidyaTopicDetailScreen extends StatelessWidget {
  final AuthClient auth;
  final Topic topic;
  final double ewa;
  const VidyaTopicDetailScreen({
    super.key,
    required this.auth,
    required this.topic,
    required this.ewa,
  });

  String _bucketLabel() {
    if (ewa >= 0.70) return 'STRONG';
    if (ewa >= 0.40) return 'DEVELOPING';
    if (ewa > 0) return 'WEAK';
    return 'NOT STARTED';
  }

  Color _bucketColor(VidyaThemeData v) {
    if (ewa >= 0.70) return v.good;
    if (ewa >= 0.40) return v.info;
    if (ewa > 0) return v.bad;
    return v.ink3;
  }

  /// Launch a topic-targeted practice session, then route to the result
  /// review on completion. Mirrors the Home next-best-action flow.
  void _startPractice(BuildContext context) {
    final userId = auth.user?.id ?? '';
    if (userId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to start practising.')),
      );
      return;
    }
    final client = QuizClient(auth: auth);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VidyaPracticeSessionScreen(
          client: client,
          topicId: topic.id,
          userId: userId,
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
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final tone = _bucketColor(v);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: topic.title,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          // Mastery hero — ring + bucket + title.
          VidyaCard(
            tone: VidyaCardTone.accent,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  _MasteryRing(ewa: ewa, tone: tone),
                  const SizedBox(width: 18),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: tone.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            _bucketLabel(),
                            style: TextStyle(
                              fontFamily: VidyaFonts.mono,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: tone,
                              letterSpacing: 1.2,
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          topic.title,
                          style: TextStyle(
                            fontFamily: VidyaFonts.display,
                            fontSize: 24,
                            fontWeight: FontWeight.w500,
                            color: v.ink,
                            height: 1.1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Stat tiles.
          Row(
            children: [
              Expanded(
                child: _StatTile(
                  label: 'MASTERY',
                  value: '${(ewa * 100).round()}%',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatTile(
                  label: 'QUESTIONS',
                  value: '${topic.questionCount}',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatTile(
                  label: 'TIER',
                  value: topic.tier.isEmpty ? '—' : topic.tier,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          VidyaButton(
            label: 'Practice this topic',
            onPressed: () => _startPractice(context),
            size: VidyaButtonSize.lg,
          ),
        ],
      ),
    );
  }
}

/// Circular mastery indicator: a ring filled to `ewa` with the percentage
/// in the centre.
class _MasteryRing extends StatelessWidget {
  final double ewa;
  final Color tone;
  const _MasteryRing({required this.ewa, required this.tone});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 72,
            height: 72,
            child: CircularProgressIndicator(
              value: ewa.clamp(0.0, 1.0),
              strokeWidth: 7,
              backgroundColor: v.ink3.withValues(alpha: 0.16),
              valueColor: AlwaysStoppedAnimation<Color>(tone),
            ),
          ),
          Text(
            '${(ewa * 100).round()}',
            style: TextStyle(
              fontFamily: VidyaFonts.display,
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: v.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  const _StatTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                color: v.ink3,
                letterSpacing: 1.4,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: v.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
