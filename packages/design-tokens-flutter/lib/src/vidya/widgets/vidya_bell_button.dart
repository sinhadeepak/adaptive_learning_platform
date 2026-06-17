// VidyaBellButton — stateless notification bell with optional unread badge.
// Caller owns the count fetch (no internal Timer.periodic) so tests can
// pumpAndSettle without the deadlock Aurora's InboxBell exhibits.

import 'package:flutter/material.dart';

import '../tokens.dart';

class VidyaBellButton extends StatelessWidget {
  final int unreadCount;
  final VoidCallback onTap;

  const VidyaBellButton({
    super.key,
    required this.unreadCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final hasUnread = unreadCount > 0;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: v.paper2,
            shape: BoxShape.circle,
            border: Border.all(color: v.ink3.withValues(alpha: 0.2)),
          ),
          child: IconButton(
            icon: Icon(Icons.notifications_outlined, size: 20, color: v.ink2),
            onPressed: onTap,
            splashRadius: 22,
            tooltip: hasUnread ? '$unreadCount unread' : 'Notifications',
          ),
        ),
        if (hasUnread)
          Positioned(
            right: -2,
            top: -2,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              decoration: BoxDecoration(
                color: v.bad,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: v.paper, width: 2),
              ),
              child: Center(
                child: Text(
                  unreadCount > 99 ? '99+' : '$unreadCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
