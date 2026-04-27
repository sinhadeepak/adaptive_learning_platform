import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';
import '../widgets/alp_card.dart';

/// Saved questions — what students bookmarked from quiz results to revisit.
/// Tap a card to start a fresh practice session on the same topic; long-press
/// (or use the trash icon) to remove the bookmark.
class BookmarksScreen extends StatefulWidget {
  const BookmarksScreen({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<BookmarksScreen> createState() => _BookmarksScreenState();
}

class _BookmarksScreenState extends State<BookmarksScreen> {
  bool _loading = true;
  String? _error;
  List<Bookmark> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await widget.api.listBookmarks();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  Future<void> _remove(Bookmark b) async {
    setState(() => _items = _items.where((x) => x.questionId != b.questionId).toList());
    final ok = await widget.api.removeBookmark(b.questionId);
    if (!ok && mounted) {
      // Restore on failure.
      setState(() => _items = [..._items, b]..sort((a, b) => b.createdAt.compareTo(a.createdAt)));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not remove bookmark — try again.')),
      );
    }
  }

  Future<void> _practiceTopic(Bookmark b) async {
    if (b.topicId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No topic linked to this bookmark.')),
      );
      return;
    }
    final user = widget.auth.user;
    if (user == null) return;
    final client = QuizClient(auth: widget.auth);
    try {
      final session = await client.start(topicId: b.topicId!, userId: user.id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => QuizScreen(client: client, sessionId: session.sessionId, api: widget.api),
      ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not start: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(
        title: const Text('Saved Questions'),
        backgroundColor: AlpColors.bgSurface1,
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          color: AlpColors.colorAi,
          backgroundColor: AlpColors.bgSurface2,
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: AlpColors.colorAi))
              : _error != null
                  ? _ErrorState(error: _error!, onRetry: _load)
                  : _items.isEmpty
                      ? const _EmptyState()
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                          physics: const AlwaysScrollableScrollPhysics(),
                          itemCount: _items.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 10),
                          itemBuilder: (_, i) => _BookmarkCard(
                            bookmark: _items[i],
                            onPractice: () => _practiceTopic(_items[i]),
                            onRemove: () => _remove(_items[i]),
                          ),
                        ),
        ),
      ),
    );
  }
}

class _BookmarkCard extends StatelessWidget {
  const _BookmarkCard({required this.bookmark, required this.onPractice, required this.onRemove});
  final Bookmark bookmark;
  final VoidCallback onPractice;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final stem = (bookmark.stem ?? '').trim();
    return AlpCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if ((bookmark.topicTitle ?? '').isNotEmpty)
                AlpPill(label: '◈ ${bookmark.topicTitle!}', color: AlpColors.colorPurple)
              else
                const AlpPill(label: 'Saved', color: AlpColors.colorAmber),
              const Spacer(),
              Text(
                _relative(bookmark.createdAt),
                style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
              ),
              IconButton(
                tooltip: 'Remove',
                icon: const Icon(Icons.close_rounded, size: 18, color: AlpColors.textMuted),
                onPressed: onRemove,
                visualDensity: VisualDensity.compact,
                splashRadius: 18,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            stem.isEmpty ? 'Question (open to practice)' : stem,
            style: TextStyle(
              color: stem.isEmpty ? AlpColors.textMuted : AlpColors.textPrimary,
              fontSize: 14,
              height: 1.4,
              fontStyle: stem.isEmpty ? FontStyle.italic : FontStyle.normal,
            ),
          ),
          if ((bookmark.note ?? '').isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AlpColors.bgSurface3,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AlpColors.borderDefault),
              ),
              child: Text(
                bookmark.note!,
                style: const TextStyle(color: AlpColors.textMuted, fontSize: 12, height: 1.4),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              if (bookmark.topicId != null)
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onPractice,
                    icon: const Icon(Icons.play_arrow_rounded, size: 18, color: AlpColors.colorAi),
                    label: const Text('Practice this topic',
                        style: TextStyle(color: AlpColors.textPrimary, fontWeight: FontWeight.w600)),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AlpColors.borderStrong),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        const Icon(Icons.bookmark_outline, color: AlpColors.textMuted, size: 56),
        const SizedBox(height: 12),
        const Center(
          child: Text('No saved questions yet',
              style: TextStyle(color: AlpColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: 6),
        const Center(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              'After a quiz, tap the bookmark icon next to any question to save it for review.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AlpColors.textMuted, fontSize: 13, height: 1.4),
            ),
          ),
        ),
      ],
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, required this.onRetry});
  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(error,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AlpColors.colorRed)),
          ),
        ),
        const SizedBox(height: 12),
        Center(
          child: TextButton(onPressed: onRetry, child: const Text('Retry')),
        ),
      ],
    );
  }
}

String _relative(String iso) {
  try {
    final t = DateTime.parse(iso).toLocal();
    final delta = DateTime.now().difference(t);
    if (delta.inSeconds < 60) return 'just now';
    if (delta.inMinutes < 60) return '${delta.inMinutes}m ago';
    if (delta.inHours < 24) return '${delta.inHours}h ago';
    if (delta.inDays < 7) return '${delta.inDays}d ago';
    return '${t.day}/${t.month}/${t.year}';
  } catch (_) {
    return iso;
  }
}
