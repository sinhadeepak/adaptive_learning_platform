// VidyaSessionDeepDiveScreen — Phase B4. Post-test analysis for one
// session (mirrors web's SessionDeepDive): a time-vs-correctness
// per-question strip, summary stats (avg/fastest/slowest time, accuracy),
// and a per-section breakdown. Reached from the result screen's "Session
// deep-dive" CTA.
//
// Data: GET /quiz/sessions/{id}/per-question-time via
// QuizClient.perQuestionTime (real time + correctness + section).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../quiz/quiz_client.dart';

class VidyaSessionDeepDiveScreen extends StatefulWidget {
  final QuizClient client;
  final String sessionId;
  const VidyaSessionDeepDiveScreen({
    super.key,
    required this.client,
    required this.sessionId,
  });

  @override
  State<VidyaSessionDeepDiveScreen> createState() =>
      _VidyaSessionDeepDiveScreenState();
}

enum _State { loading, loaded, empty, error }

class _VidyaSessionDeepDiveScreenState
    extends State<VidyaSessionDeepDiveScreen> {
  _State _state = _State.loading;
  List<SessionItemTime> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _state = _State.loading);
    try {
      final items = await widget.client.perQuestionTime(widget.sessionId);
      if (!mounted) return;
      setState(() {
        _items = items;
        _state = items.isEmpty ? _State.empty : _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Session deep-dive',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _State.loading => const _Skeleton(),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.empty => _EmptyState(v: v),
        _State.loaded => _LoadedView(items: _items),
      },
    );
  }
}

class _LoadedView extends StatelessWidget {
  final List<SessionItemTime> items;
  const _LoadedView({required this.items});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final answered = items.where((i) => i.answered).toList();
    final times = items
        .map((i) => i.timeSeconds)
        .whereType<double>()
        .where((t) => t > 0)
        .toList();
    final totalSecs = times.fold<double>(0, (a, b) => a + b);
    final avg = times.isEmpty ? 0.0 : totalSecs / times.length;
    final maxT = times.isEmpty ? 0.0 : times.reduce((a, b) => a > b ? a : b);
    final correct = answered.where((i) => i.isCorrect == true).length;
    final acc = answered.isEmpty ? 0.0 : correct / answered.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        // Summary tiles.
        Row(
          children: [
            Expanded(
              child: _StatTile(
                  label: 'ACCURACY', value: '${(acc * 100).round()}%'),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _StatTile(label: 'AVG / Q', value: _fmt(avg)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _StatTile(label: 'SLOWEST', value: _fmt(maxT)),
            ),
          ],
        ),
        const SizedBox(height: 20),
        // Time-vs-correctness strip.
        Text(
          'TIME PER QUESTION',
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Bar height = time spent; colour = correct / wrong / skipped.',
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 12,
            color: v.ink3,
          ),
        ),
        const SizedBox(height: 12),
        VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              height: 96,
              child: _TimeStrip(items: items, maxT: maxT),
            ),
          ),
        ),
        const SizedBox(height: 20),
        // Section breakdown (if any sections).
        ..._sectionBreakdown(context, items, v),
      ],
    );
  }

  static String _fmt(double secs) {
    if (secs <= 0) return '—';
    if (secs < 60) return '${secs.round()}s';
    final m = secs ~/ 60;
    final s = (secs % 60).round();
    return '${m}m ${s}s';
  }

  List<Widget> _sectionBreakdown(
    BuildContext context,
    List<SessionItemTime> items,
    VidyaThemeData v,
  ) {
    // Group by sectionId; skip when the session is single-section/unsectioned.
    final bySection = <String, List<SessionItemTime>>{};
    for (final i in items) {
      final key = i.sectionId ?? '';
      (bySection[key] ??= []).add(i);
    }
    final sectioned = bySection.keys.where((k) => k.isNotEmpty).toList();
    if (sectioned.length < 2) return const [];
    return [
      Text(
        'BY SECTION',
        style: TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 11,
          color: v.ink3,
          letterSpacing: 1.4,
        ),
      ),
      const SizedBox(height: 12),
      for (final key in sectioned) ...[
        _SectionRow(name: key, items: bySection[key]!),
        const SizedBox(height: 10),
      ],
    ];
  }
}

/// Per-question bars: height proportional to time, colour by correctness.
class _TimeStrip extends StatelessWidget {
  final List<SessionItemTime> items;
  final double maxT;
  const _TimeStrip({required this.items, required this.maxT});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    Color barColor(SessionItemTime i) {
      if (!i.answered) return v.ink3.withValues(alpha: 0.35);
      return i.isCorrect == true ? v.good : v.bad;
    }

    return LayoutBuilder(
      builder: (context, c) {
        final n = items.length;
        if (n == 0) return const SizedBox.shrink();
        const gap = 3.0;
        final barW = ((c.maxWidth - gap * (n - 1)) / n).clamp(2.0, 24.0);
        return Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (var k = 0; k < n; k++) ...[
              if (k > 0) const SizedBox(width: gap),
              Builder(builder: (_) {
                final t = items[k].timeSeconds ?? 0;
                final h = maxT <= 0 ? 4.0 : (t / maxT) * 88.0;
                return Container(
                  width: barW,
                  height: h.clamp(4.0, 88.0),
                  decoration: BoxDecoration(
                    color: barColor(items[k]),
                    borderRadius: BorderRadius.circular(2),
                  ),
                );
              }),
            ],
          ],
        );
      },
    );
  }
}

class _SectionRow extends StatelessWidget {
  final String name;
  final List<SessionItemTime> items;
  const _SectionRow({required this.name, required this.items});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final answered = items.where((i) => i.answered).toList();
    final correct = answered.where((i) => i.isCorrect == true).length;
    final acc = answered.isEmpty ? 0.0 : correct / answered.length;
    final times =
        items.map((i) => i.timeSeconds).whereType<double>().where((t) => t > 0);
    final avg =
        times.isEmpty ? 0.0 : times.reduce((a, b) => a + b) / times.length;
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Text(
                name,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: v.ink,
                ),
              ),
            ),
            Text(
              '${(acc * 100).round()}% · ${_LoadedView._fmt(avg)}/q',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 12,
                color: v.ink3,
              ),
            ),
          ],
        ),
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
                letterSpacing: 1.3,
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

class _EmptyState extends StatelessWidget {
  final VidyaThemeData v;
  const _EmptyState({required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'No per-question timing for this session yet.',
          textAlign: TextAlign.center,
          style:
              TextStyle(fontFamily: VidyaFonts.ui, fontSize: 15, color: v.ink2),
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
              "We couldn't load the deep-dive.",
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

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        Row(
          children: const [
            Expanded(child: _SkelTile()),
            SizedBox(width: 8),
            Expanded(child: _SkelTile()),
            SizedBox(width: 8),
            Expanded(child: _SkelTile()),
          ],
        ),
        const SizedBox(height: 20),
        const VidyaSkeletonBlock(width: 160, height: 12),
        const SizedBox(height: 12),
        VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [VidyaSkeletonBlock(width: 240, height: 88)],
            ),
          ),
        ),
      ],
    );
  }
}

class _SkelTile extends StatelessWidget {
  const _SkelTile();

  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            VidyaSkeletonBlock(width: 50, height: 8),
            SizedBox(height: 8),
            VidyaSkeletonBlock(width: 60, height: 20),
          ],
        ),
      ),
    );
  }
}
