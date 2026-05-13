import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api/phase5_api.dart';
import '../auth/auth_client.dart';
import '../l10n/strings.dart';

/// Multi-parameter ConceptProfile screen (P5-S67 / S46).
///
/// Mirrors `apps/web-student/src/pages/ConceptProfile.tsx`. Renders the
/// 9-dim assessment substrate per ADR-0017 — concept mastery, Bloom-
/// level depth, fluency, confidence calibration, transfer ability —
/// for the most-uncertain concepts the student has touched.
///
/// v1 surfaces 5 dimensions on the radar (Mastery, Bloom depth,
/// Fluency, Calibration, Transfer); the remaining 4 (accuracy patterns
/// / retention / procedural / strategic) link out to existing mobile
/// screens (Analysis / History / Mocks).
class ConceptProfileScreen extends StatefulWidget {
  const ConceptProfileScreen({
    super.key,
    required this.userId,
    required this.auth,
  });
  final String userId;
  final AuthClient auth;

  @override
  State<ConceptProfileScreen> createState() => _ConceptProfileScreenState();
}

class _ConceptProfileScreenState extends State<ConceptProfileScreen> {
  late final Phase5Api _api;
  MultiProfileResponse? _profile;
  List<TransferRow> _transfer = const [];
  String? _error;
  String? _selectedConceptId;

  @override
  void initState() {
    super.initState();
    _api = Phase5Api(widget.auth);
    _load();
  }

  Future<void> _load() async {
    try {
      final profile = await _api.multiProfile(widget.userId);
      final transfer = await _api.transfer(widget.userId);
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _transfer = transfer;
        if (profile.concepts.isNotEmpty) {
          _selectedConceptId = profile.concepts.first.conceptId;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  /// Pure: turn the multi-profile + transfer rows into 5 radar values
  /// in [0, 1] for the selected concept. Same normalisation as the
  /// web ConceptProfile.
  List<_RadarPoint> _radarPoints() {
    final p = _profile;
    final id = _selectedConceptId;
    if (p == null || id == null) return const [];

    final concept = p.concepts.firstWhere(
      (c) => c.conceptId == id,
      orElse: () => ConceptMasteryRow(conceptId: id, ewa: 0, n: 0),
    );

    final bloomCells = (p.bloomMatrix[id] ?? const {}).values.toList();
    double bloomAvg = 0;
    if (bloomCells.isNotEmpty) {
      double sum = 0;
      int n = 0;
      for (final cell in bloomCells) {
        final ewa = (cell['ewa'] as num?)?.toDouble();
        if (ewa != null) {
          sum += ewa;
          n += 1;
        }
      }
      if (n > 0) bloomAvg = sum / n;
    }

    final fluency = p.fluency.firstWhere(
      (f) => f.conceptId == id,
      orElse: () => FluencyRow(conceptId: id, fluencyScore: 0, n: 0),
    );
    final fluencyNorm = (fluency.fluencyScore / 1.5).clamp(0.0, 1.0);

    final calibration = p.confidenceBrier != null
        ? (1 - p.confidenceBrier!).clamp(0.0, 1.0).toDouble()
        : 0.0;

    final transferRow = _transfer.firstWhere(
      (r) => r.conceptId == id,
      orElse: () =>
          TransferRow(conceptId: id, transferScore: null, nSingleTag: 0, nMultiTag: 0),
    );
    final transferNorm = transferRow.transferScore != null
        ? ((transferRow.transferScore! + 1) / 2).clamp(0.0, 1.0).toDouble()
        : 0.0;

    return [
      _RadarPoint(t('concept_profile.dim.mastery'), concept.ewa),
      _RadarPoint(t('concept_profile.dim.bloom'), bloomAvg),
      _RadarPoint(t('concept_profile.dim.fluency'), fluencyNorm.toDouble()),
      _RadarPoint(t('concept_profile.dim.calibration'), calibration),
      _RadarPoint(t('concept_profile.dim.transfer'), transferNorm),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(t('concept_profile.title'))),
      body: _error != null
          ? _ErrorView(message: _error!, onRetry: _load)
          : _profile == null
              ? const Center(child: CircularProgressIndicator())
              : _profile!.concepts.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          t('concept_profile.no_data'),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : _buildBody(),
    );
  }

  Widget _buildBody() {
    final concepts = _profile!.concepts.take(20).toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          t('concept_profile.your_concepts'),
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 64,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: concepts.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final c = concepts[i];
              final selected = c.conceptId == _selectedConceptId;
              return InkWell(
                onTap: () => setState(() => _selectedConceptId = c.conceptId),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: selected ? Colors.blue.shade50 : Colors.white,
                    border: Border.all(
                      color: selected ? Colors.blue : Colors.grey.shade300,
                      width: selected ? 2 : 1,
                    ),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c.conceptId.length > 10
                            ? '${c.conceptId.substring(0, 10)}…'
                            : c.conceptId,
                        style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                      ),
                      Text(
                        '${(c.ewa * 100).toStringAsFixed(0)}% · n=${c.n}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 24),
        if (_selectedConceptId != null) _RadarChart(points: _radarPoints()),
        const SizedBox(height: 16),
        if (_selectedConceptId != null)
          _BloomMatrixTable(
            concept: _selectedConceptId!,
            matrix: _profile!.bloomMatrix,
          ),
      ],
    );
  }
}

class _RadarPoint {
  const _RadarPoint(this.label, this.value);
  final String label;
  final double value;
}

class _RadarChart extends StatelessWidget {
  const _RadarChart({required this.points});
  final List<_RadarPoint> points;

  @override
  Widget build(BuildContext context) {
    if (points.length < 3) {
      return Text('Need ≥ 3 dimensions; got ${points.length}.');
    }
    return AspectRatio(
      aspectRatio: 1,
      child: CustomPaint(painter: _RadarPainter(points)),
    );
  }
}

class _RadarPainter extends CustomPainter {
  _RadarPainter(this.points);
  final List<_RadarPoint> points;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final radius = size.width * 0.35;
    final n = points.length;

    Offset pointAt(int i, double v) {
      final angle = (math.pi * 2 * i / n) - math.pi / 2;
      return centre +
          Offset(math.cos(angle) * v * radius, math.sin(angle) * v * radius);
    }

    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..color = const Color(0xFFE1E5EE)
      ..strokeWidth = 1;
    for (final r in [0.25, 0.5, 0.75, 1.0]) {
      final ring = Path();
      for (int i = 0; i < n; i++) {
        final p = pointAt(i, r);
        if (i == 0) {
          ring.moveTo(p.dx, p.dy);
        } else {
          ring.lineTo(p.dx, p.dy);
        }
      }
      ring.close();
      canvas.drawPath(ring, ringPaint);
    }

    for (int i = 0; i < n; i++) {
      canvas.drawLine(centre, pointAt(i, 1.0), ringPaint);
    }

    final valueFill = Paint()
      ..color = const Color(0x334F87F6)
      ..style = PaintingStyle.fill;
    final valueStroke = Paint()
      ..color = const Color(0xFF4F87F6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final value = Path();
    for (int i = 0; i < n; i++) {
      final p = pointAt(i, points[i].value.clamp(0, 1).toDouble());
      if (i == 0) {
        value.moveTo(p.dx, p.dy);
      } else {
        value.lineTo(p.dx, p.dy);
      }
    }
    value.close();
    canvas.drawPath(value, valueFill);
    canvas.drawPath(value, valueStroke);

    final dot = Paint()..color = const Color(0xFF4F87F6);
    for (int i = 0; i < n; i++) {
      canvas.drawCircle(
        pointAt(i, points[i].value.clamp(0, 1).toDouble()),
        3,
        dot,
      );
    }

    for (int i = 0; i < n; i++) {
      final labelPos = pointAt(i, 1.18);
      final tp = TextPainter(
        text: TextSpan(
          text:
              '${points[i].label}\n${(points[i].value * 100).toStringAsFixed(0)}%',
          style: const TextStyle(
            fontSize: 11,
            color: Color(0xFF0F172A),
            fontWeight: FontWeight.w500,
          ),
        ),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      );
      tp.layout();
      tp.paint(
        canvas,
        Offset(labelPos.dx - tp.width / 2, labelPos.dy - tp.height / 2),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RadarPainter old) => old.points != points;
}

class _BloomMatrixTable extends StatelessWidget {
  const _BloomMatrixTable({required this.concept, required this.matrix});
  final String concept;
  final Map<String, Map<String, Map<String, dynamic>>> matrix;

  static const _levels = [
    'REMEMBER',
    'UNDERSTAND',
    'APPLY',
    'ANALYSE',
    'EVALUATE',
    'CREATE',
  ];

  @override
  Widget build(BuildContext context) {
    final cell = matrix[concept] ?? const {};
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t('concept_profile.bloom_matrix'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            ..._levels.map((level) {
              final m = cell[level];
              final ewa = (m?['ewa'] as num?)?.toDouble();
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(level, style: const TextStyle(fontSize: 12)),
                    Text(
                      ewa == null ? '—' : '${(ewa * 100).toStringAsFixed(0)}%',
                      style: const TextStyle(
                        fontSize: 13,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline,
                size: 48, color: Theme.of(context).colorScheme.error,),
            const SizedBox(height: 12),
            Text(t('common.error'),
                style: Theme.of(context).textTheme.titleMedium,),
            const SizedBox(height: 4),
            Text(message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: onRetry,
              child: Text(t('common.retry')),
            ),
          ],
        ),
      ),
    );
  }
}
