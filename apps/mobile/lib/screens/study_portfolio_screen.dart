// Study Portfolio — Flutter mirror of the web /portfolio page.
//
// Renders the buckets list returned by /pce/{user_id}/portfolio as two
// stacked allocation bars (current vs optimal) + a rebalance CTA.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../auth/auth_client.dart';
import '../widgets/alp_card.dart';

class StudyPortfolioScreen extends StatefulWidget {
  const StudyPortfolioScreen({
    super.key,
    required this.auth,
    required this.examId,
  });
  final AuthClient auth;
  final String examId;

  @override
  State<StudyPortfolioScreen> createState() => _StudyPortfolioScreenState();
}

class _PortfolioBucket {
  _PortfolioBucket(this.bucket, this.current, this.optimal, this.delta);
  final String bucket;
  final double current;
  final double optimal;
  final double delta;
}

class _StudyPortfolioScreenState extends State<StudyPortfolioScreen> {
  bool _loading = true;
  bool _recomputing = false;
  String? _error;
  List<_PortfolioBucket> _buckets = const [];
  String _hint = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final uid = widget.auth.user?.id;
    if (uid == null) {
      setState(() {
        _loading = false;
        _error = 'Not signed in';
      });
      return;
    }
    try {
      final r = await widget.auth
          .apiGet('/pce/$uid/portfolio?exam_id=${widget.examId}');
      if (r.statusCode != 200) {
        throw Exception('HTTP ${r.statusCode}');
      }
      final j = jsonDecode(r.body) as Map<String, dynamic>;
      final raw = (j['buckets'] as List? ?? []).cast<Map<String, dynamic>>();
      setState(() {
        _buckets = raw
            .map((b) => _PortfolioBucket(
                  b['bucket'] as String,
                  ((b['currentMasteryShare'] ?? 0) as num).toDouble(),
                  ((b['optimalShare'] ?? 0) as num).toDouble(),
                  ((b['delta'] ?? 0) as num).toDouble(),
                ))
            .toList();
        _hint = (j['reallocationHint'] ?? '') as String;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _rebalance() async {
    final uid = widget.auth.user?.id;
    if (uid == null) return;
    setState(() => _recomputing = true);
    try {
      await widget.auth
          .apiPost('/pce/$uid/recompute?exam_id=${widget.examId}', {});
      await _load();
    } finally {
      if (mounted) setState(() => _recomputing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Study Portfolio')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text("Couldn't load portfolio: $_error"),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    AlpCard(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '◈ STUDY PORTFOLIO',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.6,
                                color: AlpColors.colorAi,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Where is your effort going?',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 12),
                            for (final b in _buckets) ...[
                              _bucketRow(b),
                              const SizedBox(height: 12),
                            ],
                          ],
                        ),
                      ),
                    ),
                    if (_hint.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: AlpCard(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  '◈ REBALANCE HINT',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.6,
                                    color: AlpColors.colorAi,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(_hint,
                                    style: const TextStyle(fontSize: 14)),
                                const SizedBox(height: 12),
                                ElevatedButton(
                                  onPressed: _recomputing ? null : _rebalance,
                                  child: Text(_recomputing
                                      ? 'Rebalancing…'
                                      : 'Rebalance my plan →'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }

  Widget _bucketRow(_PortfolioBucket b) {
    final color = b.bucket == 'High'
        ? AlpColors.colorAi
        : b.bucket == 'Medium'
            ? AlpColors.colorAmber
            : AlpColors.textFaint;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('${b.bucket}-yield',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            Text(
              'cur ${(b.current * 100).toStringAsFixed(1)}% · opt ${(b.optimal * 100).toStringAsFixed(1)}%',
              style: const TextStyle(fontSize: 11, color: AlpColors.textFaint),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Stack(
            children: [
              Container(height: 8, color: AlpColors.bgSurface3),
              FractionallySizedBox(
                widthFactor: b.current.clamp(0, 1).toDouble(),
                child: Container(height: 8, color: color.withOpacity(0.6)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 2),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Stack(
            children: [
              Container(height: 8, color: AlpColors.bgSurface3),
              FractionallySizedBox(
                widthFactor: b.optimal.clamp(0, 1).toDouble(),
                child: Container(height: 8, color: color),
              ),
            ],
          ),
        ),
        if (b.delta.abs() > 0.01)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              'Δ ${b.delta > 0 ? '+' : ''}${(b.delta * 100).toStringAsFixed(1)}% vs current',
              style: TextStyle(
                fontSize: 11,
                color: b.delta > 0
                    ? AlpColors.colorGreen
                    : AlpColors.colorRed,
              ),
            ),
          ),
      ],
    );
  }
}
