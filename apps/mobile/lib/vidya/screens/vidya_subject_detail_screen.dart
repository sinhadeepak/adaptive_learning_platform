// VidyaSubjectDetailScreen — Phase 3b.full v1. Reached via Navigator.push
// from VidyaStudyScreen subject taps. Lists topics for a subject with
// per-topic mastery bucket dots. Topic detail (concept profile
// equivalent) is deferred to Phase 3b.full v2 — taps snackbar.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaSubjectDetailScreen extends StatefulWidget {
  final AuthClient auth;
  final Subject subject;
  const VidyaSubjectDetailScreen({
    super.key,
    required this.auth,
    required this.subject,
  });

  @override
  State<VidyaSubjectDetailScreen> createState() =>
      _VidyaSubjectDetailScreenState();
}

enum _DetailState { loading, loaded, empty, error }

class _DetailData {
  final List<Topic> topics;
  final Map<String, double> ewaByTopic;
  const _DetailData({required this.topics, required this.ewaByTopic});
}

class _VidyaSubjectDetailScreenState extends State<VidyaSubjectDetailScreen> {
  _DetailState _state = _DetailState.loading;
  _DetailData? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _state = _DetailState.loading);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _DetailState.empty);
      return;
    }
    try {
      final api = ApiClient(widget.auth);
      final results = await Future.wait<Object>([
        api.topicsForSubject(widget.subject.id),
        api.mastery(user.id),
      ]);
      final topics = results[0] as List<Topic>;
      final mastery = results[1] as List<TopicMastery>;
      if (!mounted) return;
      if (topics.isEmpty) {
        setState(() => _state = _DetailState.empty);
        return;
      }
      final ewaByTopic = {for (final m in mastery) m.topicId: m.ewa};
      setState(() {
        _data = _DetailData(topics: topics, ewaByTopic: ewaByTopic);
        _state = _DetailState.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _DetailState.error);
    }
  }

  Color _bucketColor(double ewa, VidyaThemeData v) {
    if (ewa >= 0.70) return v.good;
    if (ewa >= 0.40) return v.info;
    if (ewa > 0) return v.bad;
    return v.ink3;
  }

  void _onTopicTap(Topic t) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Topic detail for ${t.title} is coming in Phase 3b.full v2.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: widget.subject.name,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _DetailState.loading => const _DetailSkeleton(),
        _DetailState.empty => _EmptyState(v: v),
        _DetailState.error => _ErrorState(onRetry: _load, v: v),
        _DetailState.loaded => _LoadedView(
            data: _data!,
            bucketColor: (e) => _bucketColor(e, v),
            onTopicTap: _onTopicTap,
            v: v,
          ),
      },
    );
  }
}

class _LoadedView extends StatelessWidget {
  final _DetailData data;
  final Color Function(double ewa) bucketColor;
  final void Function(Topic) onTopicTap;
  final VidyaThemeData v;
  const _LoadedView({
    required this.data,
    required this.bucketColor,
    required this.onTopicTap,
    required this.v,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        Text(
          '${data.topics.length} topics',
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 16),
        for (final t in data.topics) ...[
          _TopicCard(
            topic: t,
            dotColor: bucketColor(data.ewaByTopic[t.id] ?? 0.0),
            onTap: () => onTopicTap(t),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _TopicCard extends StatelessWidget {
  final Topic topic;
  final Color dotColor;
  final VoidCallback onTap;
  const _TopicCard({
    required this.topic,
    required this.dotColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: dotColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${topic.questionCount} questions',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      color: v.ink3,
                      letterSpacing: 1.4,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                topic.title,
                style: TextStyle(
                  fontFamily: VidyaFonts.display,
                  fontSize: 20,
                  fontWeight: FontWeight.w500,
                  color: v.ink,
                ),
              ),
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
        child: VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'NO TOPICS',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 10,
                    color: v.ink3,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'No topics yet',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    color: v.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'This subject has no published topics in the catalog '
                  'yet — check back soon.',
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
              "We couldn't load the topics.",
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

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        const VidyaSkeletonBlock(width: 80, height: 12),
        const SizedBox(height: 16),
        for (var i = 0; i < 5; i++) ...[
          VidyaCard(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  VidyaSkeletonBlock(width: 120, height: 10),
                  SizedBox(height: 8),
                  VidyaSkeletonBlock(width: 200, height: 20),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}
