import 'package:flutter/material.dart';

import '../api/phase5_api.dart';
import '../aurora/widgets/widgets.dart';
import '../auth/auth_client.dart';
import '../l10n/strings.dart';

/// Diagnostic root-cause walker (P5-S67 / S46).
///
/// Mirrors `apps/web-student/src/pages/DiagnosticDeepDive.tsx`. Pulls
/// the student's mastery map at load via /multi-profile, takes a
/// primary concept id + free-form prereq edge list, and walks the
/// chain via /adaptive/diagnostic/root-cause.
class DiagnosticDeepDiveScreen extends StatefulWidget {
  const DiagnosticDeepDiveScreen({
    super.key,
    required this.userId,
    required this.auth,
  });
  final String userId;
  final AuthClient auth;

  @override
  State<DiagnosticDeepDiveScreen> createState() =>
      _DiagnosticDeepDiveScreenState();
}

class _DiagnosticDeepDiveScreenState extends State<DiagnosticDeepDiveScreen> {
  late final Phase5Api _api;
  final _conceptCtrl = TextEditingController();
  final _edgesCtrl = TextEditingController();
  Map<String, double> _masteryMap = {};
  RootCauseResponse? _result;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _api = Phase5Api(widget.auth);
    _loadMastery();
  }

  @override
  void dispose() {
    _conceptCtrl.dispose();
    _edgesCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMastery() async {
    try {
      final p = await _api.multiProfile(widget.userId);
      final map = <String, double>{};
      for (final c in p.concepts) {
        map[c.conceptId] = c.ewa;
      }
      if (!mounted) return;
      setState(() => _masteryMap = map);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  /// Parse "from -> to" lines into RootCauseEdge list.
  List<RootCauseEdge> _parseEdges() {
    final raw = _edgesCtrl.text;
    if (raw.trim().isEmpty) return const [];
    return raw
        .split('\n')
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .map((line) {
      final parts = line.split('->').map((s) => s.trim()).toList();
      if (parts.length != 2 || parts[0].isEmpty || parts[1].isEmpty) {
        return null;
      }
      return RootCauseEdge(
        fromConceptId: parts[0],
        toConceptId: parts[1],
      );
    }).whereType<RootCauseEdge>().toList();
  }

  Future<void> _run() async {
    if (_conceptCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Primary concept id required.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final out = await _api.rootCause(
        primaryConceptId: _conceptCtrl.text.trim(),
        userConceptMastery: _masteryMap,
        edges: _parseEdges(),
      );
      if (!mounted) return;
      setState(() => _result = out);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuroraScaffold(
      appBar: AuroraAppBar(title: t('diagnostic.title')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ...[
            AuroraCard(
              padding: AuroraCardPadding.sm,
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 18,
                    color: Theme.of(context).colorScheme.error,
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_error!)),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
          Text(
            t('diagnostic.subtitle'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          AuroraTextField(
            controller: _conceptCtrl,
            label: 'Primary concept id',
            placeholder: 'newton2',
          ),
          const SizedBox(height: 12),
          AuroraTextField(
            controller: _edgesCtrl,
            label: 'Prereq edges (one per line, "from -> to")',
            placeholder: 'newton2 -> newton1\nnewton1 -> vectors',
            maxLines: 4,
            minLines: 4,
          ),
          const SizedBox(height: 12),
          AuroraButton(
            label: _busy ? t('common.loading') : t('diagnostic.run_button'),
            variant: AuroraButtonVariant.aurora,
            loading: _busy,
            iconLeft: const Text('✦'),
            onPressed: _busy ? null : _run,
          ),
          const SizedBox(height: 24),
          if (_result != null) _ResultCard(result: _result!, mastery: _masteryMap),
        ],
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result, required this.mastery});
  final RootCauseResponse result;
  final Map<String, double> mastery;

  @override
  Widget build(BuildContext context) {
    final isDrill = result.rootCauseConceptId != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Card(
          color: isDrill ? Colors.amber.shade100 : Colors.green.shade100,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isDrill
                      ? t('diagnostic.headline_drill')
                      : t('diagnostic.headline_no_gap'),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                if (isDrill)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      result.rootCauseConceptId!,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 16),
                    ),
                  ),
                if (!isDrill)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      t('diagnostic.no_gap_explainer'),
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (result.path.isNotEmpty) ...[
          Text(
            t('diagnostic.path'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (int i = 0; i < result.path.length; i++) ...[
                _PathChip(
                  conceptId: result.path[i],
                  mastery: mastery[result.path[i]] ?? 0,
                  highlight: i == result.path.length - 1,
                ),
                if (i < result.path.length - 1)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text('→'),
                  ),
              ],
            ],
          ),
        ],
        if (result.notes.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            'Walker notes: ${result.notes.join(" · ")}',
            style: const TextStyle(fontSize: 12, color: Colors.grey),
          ),
        ],
      ],
    );
  }
}

class _PathChip extends StatelessWidget {
  const _PathChip({
    required this.conceptId,
    required this.mastery,
    required this.highlight,
  });
  final String conceptId;
  final double mastery;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(
          color: highlight ? Colors.amber : Colors.grey.shade300,
          width: highlight ? 2 : 1,
        ),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            conceptId,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
          ),
          Text(
            '${(mastery * 100).toStringAsFixed(0)}%',
            style: const TextStyle(fontSize: 11, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}
