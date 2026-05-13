// Sprint 9 F-2 — mobile assignments inbox.
//
// Mirrors the web /assignments page. Tap a row → opens the detail screen.

import 'package:flutter/material.dart';

import '../api/assignments.dart';
import 'assignment_detail_screen.dart';

class AssignmentsScreen extends StatefulWidget {
  const AssignmentsScreen({super.key, required this.client});
  final AssignmentsClient client;

  @override
  State<AssignmentsScreen> createState() => _AssignmentsScreenState();
}

class _AssignmentsScreenState extends State<AssignmentsScreen> {
  List<Assignment>? _items;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await widget.client.mine();
      if (!mounted) return;
      setState(() => _items = items);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Assignments')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _error != null
            ? ListView(children: [_banner(_error!, error: true)])
            : _items == null
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: CircularProgressIndicator(),
                    ),
                  )
                : _items!.isEmpty
                    ? ListView(children: const [
                        Padding(
                          padding: EdgeInsets.all(24),
                          child: Text(
                            'No assignments yet — your educator will post here when they\'re ready.',
                          ),
                        ),
                      ],)
                    : ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _items!.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => _row(_items![i]),
                      ),
      ),
    );
  }

  Widget _row(Assignment a) {
    final bucket = progressBucket(a);
    final due = formatDueAt(a);
    return Card(
      child: InkWell(
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => AssignmentDetailScreen(
                client: widget.client,
                assignmentId: a.id,
              ),
            ),
          );
          _load(); // refresh after detail (progress may have changed)
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      a.title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 15,),
                    ),
                  ),
                  _bucketPill(bucket),
                ],
              ),
              if (a.description != null && a.description!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  a.description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.black54),
                ),
              ],
              if (due.isNotEmpty || a.myCompletedAt != null) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  children: [
                    if (due.isNotEmpty)
                      Text(due, style: const TextStyle(fontSize: 12)),
                    if (a.myCompletedAt != null &&
                        a.myCorrectCount != null &&
                        a.myTotalCount != null)
                      Text(
                        'Score: ${a.myCorrectCount}/${a.myTotalCount}',
                        style: const TextStyle(fontSize: 12),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _bucketPill(ProgressBucket b) {
    final (label, bg, fg) = switch (b) {
      ProgressBucket.completed => (
          'Completed',
          Colors.green.shade100,
          Colors.green.shade900
        ),
      ProgressBucket.overdue => (
          'Overdue',
          Colors.red.shade100,
          Colors.red.shade900
        ),
      ProgressBucket.dueSoon => (
          'Due soon',
          Colors.amber.shade100,
          Colors.amber.shade900
        ),
      ProgressBucket.open => (
          'Open',
          Colors.grey.shade200,
          Colors.grey.shade800
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style:
            TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 11),
      ),
    );
  }

  Widget _banner(String text, {bool error = false}) {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: error ? Colors.red.shade50 : Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text,
          style: TextStyle(
              color: error ? Colors.red.shade900 : Colors.blue.shade900,),),
    );
  }
}
