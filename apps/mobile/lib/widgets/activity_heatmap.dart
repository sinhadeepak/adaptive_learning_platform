import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';

/// 30-day GitHub-style activity heatmap. 6 columns × 5 rows = 30 cells,
/// rightmost-bottom = today. Intensity calibrated against the visible
/// window so a student who runs 1 session/day still gets visible mid-tone.
class ActivityHeatmap extends StatefulWidget {
  const ActivityHeatmap({super.key, required this.api, required this.userId});
  final ApiClient api;
  final String userId;

  @override
  State<ActivityHeatmap> createState() => _ActivityHeatmapState();
}

class _ActivityHeatmapState extends State<ActivityHeatmap> {
  static const _cols = 6;
  static const _rows = 5;
  static const _total = _cols * _rows;

  List<_DayCell>? _cells;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(ActivityHeatmap old) {
    super.didUpdateWidget(old);
    if (old.userId != widget.userId) _load();
  }

  Future<void> _load() async {
    try {
      final activity = await widget.api.dailyActivity(widget.userId, days: 30);
      final byDate = <String, DailyActivity>{
        for (final a in activity) _key(a.date): a,
      };
      final today = DateTime.now();
      final start = DateTime(today.year, today.month, today.day);
      final out = <_DayCell>[];
      for (int i = _total - 1; i >= 0; i--) {
        final d = start.subtract(Duration(days: i));
        final row = byDate[_key(d)];
        out.add(_DayCell(
          date: d,
          sessions: row?.sessions ?? 0,
          minutes: row?.minutes ?? 0,
        ),);
      }
      final maxSessions = out.fold<int>(0, (m, c) => c.sessions > m ? c.sessions : m);
      for (final c in out) {
        if (c.sessions == 0) {
          c.intensity = 0;
        } else if (maxSessions <= 1) {
          c.intensity = 2;
        } else {
          final ratio = c.sessions / maxSessions;
          if (ratio >= 0.75) {
            c.intensity = 4;
          } else if (ratio >= 0.5) {
            c.intensity = 3;
          } else if (ratio >= 0.25) {
            c.intensity = 2;
          } else {
            c.intensity = 1;
          }
        }
      }
      if (!mounted) return;
      setState(() => _cells = out);
    } catch (_) {
      if (mounted) setState(() => _cells = []);
    }
  }

  String _key(DateTime d) =>
      '${d.year.toString().padLeft(4, "0")}-${d.month.toString().padLeft(2, "0")}-${d.day.toString().padLeft(2, "0")}';

  @override
  Widget build(BuildContext context) {
    final cells = _cells;
    if (cells == null) {
      return const SizedBox(
        height: 120,
        child: Center(
          child: Text(
            'Loading activity…',
            style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
          ),
        ),
      );
    }
    if (cells.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Text(
          'No activity yet — your first quiz will start filling this map.',
          style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
        ),
      );
    }

    final cols = <List<_DayCell>>[];
    for (int c = 0; c < _cols; c++) {
      cols.add(cells.sublist(c * _rows, (c + 1) * _rows));
    }
    final activeDays = cells.where((c) => c.sessions > 0).length;
    final totalSessions = cells.fold<int>(0, (s, c) => s + c.sessions);
    final totalMinutes = cells.fold<int>(0, (s, c) => s + c.minutes);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.start,
          children: [
            for (final col in cols) ...[
              Column(
                children: [
                  for (final c in col) ...[
                    Tooltip(
                      message:
                          '${_key(c.date)} · ${c.sessions} session${c.sessions == 1 ? '' : 's'} · ${c.minutes}m',
                      child: Container(
                        width: 16,
                        height: 16,
                        margin: const EdgeInsets.only(bottom: 4),
                        decoration: BoxDecoration(
                          color: _heatColor(c.intensity),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(width: 4),
            ],
          ],
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                '$activeDays/${cells.length} active days · $totalSessions sessions · ${totalMinutes}m',
                style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
              ),
            ),
            Row(
              children: [
                const Text('Less ', style: TextStyle(color: AlpColors.textMuted, fontSize: 11)),
                for (final i in const [0, 1, 2, 3, 4]) ...[
                  Container(
                    width: 11,
                    height: 11,
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      color: _heatColor(i),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ],
                const Text(' More', style: TextStyle(color: AlpColors.textMuted, fontSize: 11)),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _DayCell {
  _DayCell({required this.date, required this.sessions, required this.minutes});
  final DateTime date;
  final int sessions;
  final int minutes;
  int intensity = 0;
}

Color _heatColor(int intensity) {
  switch (intensity) {
    case 1:
      return const Color(0x4D6366F1); // 30%
    case 2:
      return const Color(0x8C6366F1); // 55%
    case 3:
      return const Color(0xC76366F1); // 78%
    case 4:
      return const Color(0xFF6366F1);
    default:
      return AlpColors.bgSurface3;
  }
}
