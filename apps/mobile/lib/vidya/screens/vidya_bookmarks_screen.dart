// VidyaBookmarksScreen — Phase D. Native saved-questions list (replaces the
// Aurora BookmarksScreen). Lists bookmarked questions with topic + stem +
// note, and lets the student remove them. Data: /profile/bookmarks.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaBookmarksScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaBookmarksScreen({super.key, required this.auth});

  @override
  State<VidyaBookmarksScreen> createState() => _VidyaBookmarksScreenState();
}

enum _State { loading, loaded, empty, error }

class _VidyaBookmarksScreenState extends State<VidyaBookmarksScreen> {
  _State _state = _State.loading;
  List<Bookmark> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    try {
      final items = await ApiClient(widget.auth).listBookmarks();
      if (!mounted) return;
      setState(() {
        _items = items;
        _state = items.isEmpty ? _State.empty : _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  Future<void> _remove(Bookmark b) async {
    final ok = await ApiClient(widget.auth).removeBookmark(b.questionId);
    if (!mounted) return;
    if (ok) {
      setState(() {
        _items = _items.where((x) => x.questionId != b.questionId).toList();
        if (_items.isEmpty) _state = _State.empty;
      });
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't remove that bookmark.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Bookmarks',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.empty => _EmptyState(
            v: v,
            text: 'No bookmarks yet — tap the bookmark icon on a question to '
                'save it here.',
          ),
        _State.loaded => ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            itemCount: _items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _BookmarkCard(
              bookmark: _items[i],
              onRemove: () => _remove(_items[i]),
            ),
          ),
      },
    );
  }
}

class _BookmarkCard extends StatelessWidget {
  final Bookmark bookmark;
  final VoidCallback onRemove;
  const _BookmarkCard({required this.bookmark, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    (bookmark.topicTitle?.isNotEmpty ?? false)
                        ? bookmark.topicTitle!
                        : 'Saved question',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      color: v.ink3,
                      letterSpacing: 1.2,
                    ),
                  ),
                ),
                InkWell(
                  onTap: onRemove,
                  child: Icon(Icons.bookmark_remove_outlined,
                      size: 20, color: v.ink3),
                ),
              ],
            ),
            if (bookmark.stem != null && bookmark.stem!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                bookmark.stem!,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 15,
                  color: v.ink,
                  height: 1.35,
                ),
              ),
            ],
            if (bookmark.note != null && bookmark.note!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Note: ${bookmark.note!}',
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  color: v.ink2,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VidyaThemeData v;
  final String text;
  const _EmptyState({required this.v, required this.text});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 15,
            color: v.ink2,
            height: 1.4,
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
              "We couldn't load your bookmarks.",
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
