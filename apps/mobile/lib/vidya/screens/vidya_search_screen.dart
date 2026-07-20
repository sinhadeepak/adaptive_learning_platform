// VidyaSearchScreen — Phase B. Global search across topics / lessons /
// questions (mirrors web's Search). A debounced query hits GET /search;
// topic results open the native topic detail. Reached from the Study tab
// header search icon.

import 'dart:async';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import 'vidya_topic_detail_screen.dart';

class VidyaSearchScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaSearchScreen({super.key, required this.auth});

  @override
  State<VidyaSearchScreen> createState() => _VidyaSearchScreenState();
}

class _VidyaSearchScreenState extends State<VidyaSearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  bool _searching = false;
  String _query = '';
  List<SearchHit> _results = const [];
  // Monotonic token so a slow earlier request can't overwrite a newer one.
  int _reqId = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final q = value.trim();
    if (q.isEmpty) {
      setState(() {
        _query = '';
        _results = const [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(const Duration(milliseconds: 300), () => _run(q));
  }

  Future<void> _run(String q) async {
    final id = ++_reqId;
    try {
      final hits = await ApiClient(widget.auth).search(q);
      if (!mounted || id != _reqId) return;
      setState(() {
        _query = q;
        _results = hits;
        _searching = false;
      });
    } catch (_) {
      if (!mounted || id != _reqId) return;
      setState(() {
        _query = q;
        _results = const [];
        _searching = false;
      });
    }
  }

  Future<void> _openHit(SearchHit hit) async {
    if (!hit.isTopic) return; // only topics have a native destination for now
    final topic = await ApiClient(widget.auth).topic(hit.id);
    if (!mounted || topic == null) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            VidyaTopicDetailScreen(auth: widget.auth, topic: topic, ewa: 0),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Search',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: v.card,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: v.rule),
              ),
              child: Row(
                children: [
                  Icon(Icons.search, size: 20, color: v.ink3),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      autofocus: true,
                      onChanged: _onChanged,
                      style: TextStyle(color: v.ink),
                      decoration: InputDecoration(
                        border: InputBorder.none,
                        hintText: 'Topics, chapters, questions…',
                        hintStyle: TextStyle(color: v.ink3),
                      ),
                    ),
                  ),
                  if (_controller.text.isNotEmpty)
                    IconButton(
                      icon: Icon(Icons.close, size: 18, color: v.ink3),
                      onPressed: () {
                        _controller.clear();
                        _onChanged('');
                      },
                    ),
                ],
              ),
            ),
          ),
          Expanded(child: _body(v)),
        ],
      ),
    );
  }

  Widget _body(VidyaThemeData v) {
    if (_searching) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_query.isEmpty) {
      return _Hint(v: v, text: 'Search across your syllabus.');
    }
    if (_results.isEmpty) {
      return _Hint(v: v, text: 'No results for “$_query”.');
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      itemCount: _results.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _ResultCard(hit: _results[i], onTap: _openHit),
    );
  }
}

class _ResultCard extends StatelessWidget {
  final SearchHit hit;
  final Future<void> Function(SearchHit) onTap;
  const _ResultCard({required this.hit, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: InkWell(
        onTap: () => onTap(hit),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                hit.type.toUpperCase(),
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 10,
                  color: v.ink3,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                hit.title,
                style: TextStyle(
                  fontFamily: VidyaFonts.display,
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                  color: v.ink,
                ),
              ),
              if (hit.subtitle != null && hit.subtitle!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  hit.subtitle!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
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
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  final VidyaThemeData v;
  final String text;
  const _Hint({required this.v, required this.text});

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
            color: v.ink3,
          ),
        ),
      ),
    );
  }
}
