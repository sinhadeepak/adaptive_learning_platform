import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../api/api_client.dart';
import 'explanation_models.dart';

// ──────────────────────────────────────────────────────────────────────
// VideoShelf — curated "Watch & Learn" clips for a reviewed question.
//
// Mirrors the web ResourceShelf: fetches PUBLISHED resources for the
// question (falling back to its topic) and shows a horizontal strip of
// cards. Tapping opens an embedded YouTube player (youtube-nocookie via the
// already-present webview_flutter — no new dependency). Hidden entirely when
// nothing is curated, so it never adds empty chrome to the drawer.
// ──────────────────────────────────────────────────────────────────────

class VideoShelf extends StatefulWidget {
  const VideoShelf({
    super.key,
    required this.api,
    this.questionId,
    this.topicId,
    this.sessionId,
  });

  final ApiClient api;
  final String? questionId;
  final String? topicId;
  final String? sessionId;

  @override
  State<VideoShelf> createState() => _VideoShelfState();
}

class _VideoShelfState extends State<VideoShelf> {
  List<StudentResource> _items = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    final items = await widget.api.listResources(
      questionId: widget.questionId,
      topicId: widget.topicId,
    );
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    // Stay invisible while loading and when empty — no curated clips means
    // no shelf, matching the web behavior.
    if (_loading || _items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        const Text(
          'WATCH & LEARN',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: AlpColors.colorAi,
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          // Tall enough for a 16:9 thumbnail (220w → ~124h) + 2-line title +
          // a meta line + padding, so the card never overflows the strip.
          height: 200,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _card(_items[i]),
          ),
        ),
      ],
    );
  }

  Widget _card(StudentResource r) => GestureDetector(
        onTap: () => _openPlayer(r),
        child: Container(
          width: 220,
          decoration: BoxDecoration(
            color: AlpColors.bgSurface2,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AlpColors.borderDefault),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 16 / 9,
                child: r.thumbnailUrl != null
                    ? Image.network(
                        r.thumbnailUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => _thumbFallback(),
                      )
                    : _thumbFallback(),
              ),
              Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      r.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (r.channelName != null) r.channelName,
                        if (r.durationSeconds != null)
                          _fmtDuration(r.durationSeconds!),
                      ].whereType<String>().join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AlpColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );

  Widget _thumbFallback() => Container(
        color: AlpColors.bgSurface3,
        child: const Center(
          child: Icon(
            Icons.play_circle_outline,
            color: AlpColors.colorAi,
            size: 36,
          ),
        ),
      );

  Future<void> _openPlayer(StudentResource r) async {
    final embedUrl = r.externalId != null
        ? 'https://www.youtube-nocookie.com/embed/${r.externalId}?autoplay=1&playsinline=1'
        : r.url;
    widget.api.recordResourceView(
      resourceId: r.id,
      eventType: 'started',
      sessionId: widget.sessionId,
    );
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.black,
      builder: (_) => _PlayerSheet(url: embedUrl, title: r.title),
    );
    widget.api.recordResourceView(
      resourceId: r.id,
      eventType: 'closed',
      sessionId: widget.sessionId,
    );
  }

  String _fmtDuration(int seconds) {
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }
}

class _PlayerSheet extends StatefulWidget {
  const _PlayerSheet({required this.url, required this.title});
  final String url;
  final String title;

  @override
  State<_PlayerSheet> createState() => _PlayerSheetState();
}

class _PlayerSheetState extends State<_PlayerSheet> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                  child: Text(
                    widget.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          AspectRatio(
            aspectRatio: 16 / 9,
            child: WebViewWidget(controller: _controller),
          ),
        ],
      ),
    );
  }
}
