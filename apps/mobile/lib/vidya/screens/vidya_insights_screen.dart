// VidyaInsightsScreen — Phase 3d v1. Mastery bucket summary derived
// client-side from /analytics/mastery. Named per-topic breakdowns,
// Weekly Story carousel, and time-spent trends are deferred to
// Phase 3d.full.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaInsightsScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaInsightsScreen({super.key, required this.auth});

  @override
  State<VidyaInsightsScreen> createState() => _VidyaInsightsScreenState();
}

enum _InsightsState { loading, loaded, empty, error }

class _InsightsData {
  final int strong;
  final int developing;
  final int weak;
  final int notStarted;
  final int totalAttempted;
  const _InsightsData({
    required this.strong,
    required this.developing,
    required this.weak,
    required this.notStarted,
    required this.totalAttempted,
  });

  factory _InsightsData.fromMastery(List<TopicMastery> rows) {
    var strong = 0, developing = 0, weak = 0, notStarted = 0;
    for (final r in rows) {
      if (r.ewa >= 0.70) {
        strong++;
      } else if (r.ewa >= 0.40) {
        developing++;
      } else if (r.ewa > 0) {
        weak++;
      } else {
        notStarted++;
      }
    }
    return _InsightsData(
      strong: strong,
      developing: developing,
      weak: weak,
      notStarted: notStarted,
      totalAttempted: strong + developing + weak,
    );
  }
}

class _VidyaInsightsScreenState extends State<VidyaInsightsScreen> {
  _InsightsState _state = _InsightsState.loading;
  _InsightsData? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _state = _InsightsState.loading);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _InsightsState.empty);
      return;
    }
    try {
      final api = ApiClient(widget.auth);
      final rows = await api.mastery(user.id);
      if (!mounted) return;
      if (rows.isEmpty) {
        setState(() => _state = _InsightsState.empty);
        return;
      }
      setState(() {
        _data = _InsightsData.fromMastery(rows);
        _state = _InsightsState.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _InsightsState.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    switch (_state) {
      case _InsightsState.loading:
        return const _InsightsSkeleton();
      case _InsightsState.empty:
        return _EmptyState(v: v);
      case _InsightsState.error:
        return _ErrorState(onRetry: _load, v: v);
      case _InsightsState.loaded:
        final d = _data!;
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          children: [
            Text(
              'INSIGHTS',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Where you stand.',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 32,
                fontWeight: FontWeight.w500,
                color: v.ink,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '${d.totalAttempted} topics attempted',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.4,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _BucketTile(
                    label: 'STRONG',
                    count: d.strong,
                    accent: v.good,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _BucketTile(
                    label: 'DEVELOPING',
                    count: d.developing,
                    accent: v.info,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _BucketTile(
                    label: 'WEAK',
                    count: d.weak,
                    accent: v.bad,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _BucketTile(
                    label: 'NOT STARTED',
                    count: d.notStarted,
                    accent: v.ink3,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            VidyaCard(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'COMING IN PHASE 3d.full',
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 10,
                        color: v.ink3,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Named per-topic breakdowns, weekly story, and '
                      'time-spent trends.',
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
          ],
        );
    }
  }
}

class _BucketTile extends StatelessWidget {
  final String label;
  final int count;
  final Color accent;
  const _BucketTile({
    required this.label,
    required this.count,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: accent,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      color: v.ink3,
                      letterSpacing: 1.2,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '$count',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 24,
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
                  'NO DATA YET',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 10,
                    color: v.ink3,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'No mastery data yet',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    color: v.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Try some practice questions and come back to see '
                  'your insights here.',
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
              "We couldn't load your insights.",
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

class _InsightsSkeleton extends StatelessWidget {
  const _InsightsSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: const [
        VidyaSkeletonBlock(width: 80, height: 12),
        SizedBox(height: 10),
        VidyaSkeletonBlock(width: 200, height: 30),
        SizedBox(height: 20),
        Row(
          children: [
            Expanded(child: VidyaSkeletonBlock(height: 64)),
            SizedBox(width: 8),
            Expanded(child: VidyaSkeletonBlock(height: 64)),
          ],
        ),
        SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: VidyaSkeletonBlock(height: 64)),
            SizedBox(width: 8),
            Expanded(child: VidyaSkeletonBlock(height: 64)),
          ],
        ),
      ],
    );
  }
}
