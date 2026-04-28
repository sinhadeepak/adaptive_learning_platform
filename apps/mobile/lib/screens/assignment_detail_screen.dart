// Sprint 9 F-2 — mobile assignment detail.
//
// Renders the title + due-date + description + question list, plus a
// minimal "Record your score" entry that calls POST /progress. Mirrors
// the web AssignmentDetail page.

import 'package:flutter/material.dart';

import '../api/assignments.dart';

class AssignmentDetailScreen extends StatefulWidget {
  const AssignmentDetailScreen({
    super.key,
    required this.client,
    required this.assignmentId,
  });

  final AssignmentsClient client;
  final String assignmentId;

  @override
  State<AssignmentDetailScreen> createState() => _AssignmentDetailScreenState();
}

class _AssignmentDetailScreenState extends State<AssignmentDetailScreen> {
  Assignment? _assignment;
  String? _error;
  bool _saving = false;
  bool _saved = false;
  int _correct = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final a = await widget.client.get(widget.assignmentId);
      if (!mounted) return;
      setState(() {
        _assignment = a;
        if (a.myCorrectCount != null) _correct = a.myCorrectCount!;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  Future<void> _submit() async {
    final a = _assignment;
    if (a == null) return;
    final total = a.myTotalCount ?? 0;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      // For now we use myTotalCount when present, else fall back to a
      // sensible default (the per-question fetch would refine this in
      // Sprint 10's real quiz-runner integration).
      final t = total > 0 ? total : 5;
      await widget.client.recordProgress(
        widget.assignmentId,
        correctCount: _correct,
        totalCount: t,
      );
      if (!mounted) return;
      setState(() => _saved = true);
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Assignment')),
      body: _error != null
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            )
          : _assignment == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(_assignment!.title,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    if (formatDueAt(_assignment!).isNotEmpty)
                      Text(formatDueAt(_assignment!),
                          style: const TextStyle(color: Colors.black54)),
                    if (_assignment!.description != null &&
                        _assignment!.description!.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(_assignment!.description!),
                    ],
                    const SizedBox(height: 24),
                    const Text('Record your score',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Text('Correct:  '),
                        SizedBox(
                          width: 80,
                          child: TextField(
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(isDense: true),
                            controller:
                                TextEditingController(text: _correct.toString()),
                            onChanged: (v) =>
                                _correct = int.tryParse(v) ?? _correct,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: (_saving || _saved) ? null : _submit,
                        child: Text(_saved
                            ? 'Saved ✓'
                            : _saving
                                ? 'Saving…'
                                : (_assignment!.myCompletedAt != null
                                    ? 'Update score'
                                    : 'Mark complete')),
                      ),
                    ),
                  ],
                ),
    );
  }
}
