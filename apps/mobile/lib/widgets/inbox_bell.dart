import 'dart:async';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../screens/inbox_screen.dart';

/// Bell button + unread badge for the home dashboard. Polls
/// `/notifications/inbox/{userId}/unread-count` every 60s while mounted, then
/// refreshes once when the user returns from the inbox screen.
class InboxBellButton extends StatefulWidget {
  const InboxBellButton({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<InboxBellButton> createState() => _InboxBellButtonState();
}

class _InboxBellButtonState extends State<InboxBellButton> {
  static const _pollInterval = Duration(seconds: 60);

  int _unread = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(_pollInterval, (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    final user = widget.auth.user;
    if (user == null) return;
    final n = await widget.api.inboxUnreadCount(user.id);
    if (!mounted) return;
    setState(() => _unread = n);
  }

  Future<void> _open() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => InboxScreen(api: widget.api, auth: widget.auth),
    ));
    if (mounted) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AlpColors.bgSurface2,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AlpColors.borderDefault),
          ),
          child: IconButton(
            icon: const Icon(Icons.notifications_outlined, color: AlpColors.textPrimary, size: 20),
            onPressed: _open,
            tooltip: _unread > 0 ? '$_unread unread' : 'Inbox',
            splashRadius: 22,
          ),
        ),
        if (_unread > 0)
          Positioned(
            right: -2,
            top: -2,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              decoration: BoxDecoration(
                color: AlpColors.colorRed,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AlpColors.bgBase, width: 2),
              ),
              child: Center(
                child: Text(
                  _unread > 99 ? '99+' : '$_unread',
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
