// VidyaInboxScreen — Phase D. Native notification inbox (replaces the Aurora
// InboxScreen). Lists in-app notifications with unread state, supports
// tap-to-read and mark-all-read. Data: /notifications/inbox/{userId}.
// Reached from the More hub and the Home bell.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaInboxScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaInboxScreen({super.key, required this.auth});

  @override
  State<VidyaInboxScreen> createState() => _VidyaInboxScreenState();
}

enum _State { loading, loaded, empty, error }

class _VidyaInboxScreenState extends State<VidyaInboxScreen> {
  _State _state = _State.loading;
  List<InboxItem> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = _State.loading);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _State.empty);
      return;
    }
    try {
      final page = await ApiClient(widget.auth).inbox(user.id);
      if (!mounted) return;
      setState(() {
        _items = page.items;
        _state = page.items.isEmpty ? _State.empty : _State.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _State.error);
    }
  }

  Future<void> _markRead(InboxItem item) async {
    if (!item.unread) return;
    final user = widget.auth.user;
    if (user == null) return;
    final ok =
        await ApiClient(widget.auth).markNotificationRead(user.id, item.id);
    if (!mounted || !ok) return;
    setState(() {
      _items = [
        for (final i in _items)
          if (i.id == item.id)
            InboxItem(
              id: i.id,
              type: i.type,
              channel: i.channel,
              payload: i.payload,
              createdAt: i.createdAt,
              readAt: DateTime.now().toIso8601String(),
            )
          else
            i,
      ];
    });
  }

  Future<void> _markAll() async {
    final user = widget.auth.user;
    if (user == null) return;
    await ApiClient(widget.auth).markAllNotificationsRead(user.id);
    if (!mounted) return;
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final hasUnread = _items.any((i) => i.unread);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Notifications',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          if (_state == _State.loaded && hasUnread)
            TextButton(
              onPressed: _markAll,
              child: Text('Mark all read', style: TextStyle(color: v.accent)),
            ),
        ],
      ),
      body: switch (_state) {
        _State.loading => const Center(child: CircularProgressIndicator()),
        _State.error => _ErrorState(onRetry: _load, v: v),
        _State.empty => _EmptyState(v: v),
        _State.loaded => ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            itemCount: _items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _InboxCard(
              item: _items[i],
              onTap: () => _markRead(_items[i]),
            ),
          ),
      },
    );
  }
}

String _titleFor(InboxItem item) {
  final p = item.payload;
  for (final k in const ['title', 'headline', 'message', 'body']) {
    final v = p[k];
    if (v is String && v.trim().isNotEmpty) return v.trim();
  }
  final t = item.type.replaceAll('_', ' ').replaceAll('.', ' ').trim();
  if (t.isEmpty) return 'Notification';
  return t[0].toUpperCase() + t.substring(1);
}

class _InboxCard extends StatelessWidget {
  final InboxItem item;
  final VoidCallback onTap;
  const _InboxCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.only(top: 6),
                decoration: BoxDecoration(
                  color: item.unread ? v.accent : Colors.transparent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _titleFor(item),
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 15,
                        fontWeight:
                            item.unread ? FontWeight.w600 : FontWeight.w400,
                        color: v.ink,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.createdAt,
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 11,
                        color: v.ink3,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VidyaThemeData v;
  const _EmptyState({required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.notifications_none, size: 48, color: v.ink3),
            const SizedBox(height: 16),
            Text(
              "You're all caught up",
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 20,
                fontWeight: FontWeight.w500,
                color: v.ink,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'New notifications will appear here.',
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink2,
              ),
            ),
          ],
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
              "We couldn't load your notifications.",
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
