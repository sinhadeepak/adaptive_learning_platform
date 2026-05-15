// BattleLobbyCard — Battle service lobby UI (per ADR-0027).
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Pre-battle waiting room card: countdown timer, opponent avatar(s),
// ready check, "share invite" CTA. Use inside the `/battle/lobby/:id`
// route.

import 'dart:async';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_avatar.dart';
import 'aurora_button.dart';
import 'aurora_card.dart';
import 'aurora_tag.dart';

class BattleOpponent {
  const BattleOpponent({
    required this.name,
    this.avatarImage,
    this.isReady = false,
  });

  final String name;
  final ImageProvider? avatarImage;
  final bool isReady;
}

class BattleLobbyCard extends StatefulWidget {
  const BattleLobbyCard({
    super.key,
    required this.title,
    required this.startsAt,
    required this.you,
    required this.opponents,
    required this.youReady,
    required this.onToggleReady,
    this.onShare,
    this.maxOpponents = 3,
  });

  final String title;

  /// Battle start timestamp. The card counts down to this; when reached
  /// it switches to a "Starting…" pulse.
  final DateTime startsAt;

  final BattleOpponent you;
  final List<BattleOpponent> opponents;
  final bool youReady;
  final VoidCallback onToggleReady;
  final VoidCallback? onShare;
  final int maxOpponents;

  @override
  State<BattleLobbyCard> createState() => _BattleLobbyCardState();
}

class _BattleLobbyCardState extends State<BattleLobbyCard> {
  Timer? _tick;
  Duration _remaining = Duration.zero;

  @override
  void initState() {
    super.initState();
    _recompute();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => _recompute());
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _recompute() {
    final r = widget.startsAt.difference(DateTime.now());
    if (!mounted) return;
    setState(() => _remaining = r.isNegative ? Duration.zero : r);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final starting = _remaining == Duration.zero;
    final allReady = widget.youReady &&
        widget.opponents.every((o) => o.isReady) &&
        widget.opponents.isNotEmpty;

    return AuroraCard(
      tone: AuroraCardTone.auroraCelebration,
      padding: AuroraCardPadding.lg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text('⚔',
                  style: typography.h3.copyWith(color: colors.reward600),),
              SizedBox(width: 6 * density.spaceScale),
              Text(
                'BATTLE',
                style: typography.overline.copyWith(
                  color: colors.reward600,
                  letterSpacing: 0.6,
                ),
              ),
              const Spacer(),
              AuroraTag(
                label: starting ? 'Starting…' : _format(_remaining),
                tone: starting ? AuroraTagTone.success : AuroraTagTone.reward,
                variant: AuroraTagVariant.solid,
                iconLeft: const Icon(Icons.timer, size: 12),
              ),
            ],
          ),
          SizedBox(height: 8 * density.spaceScale),
          Text(
            widget.title,
            style: typography.h3.copyWith(color: colors.neutral900),
          ),
          SizedBox(height: 12 * density.spaceScale),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _Slot(opponent: widget.you, isYou: true, ready: widget.youReady),
              Padding(
                padding:
                    EdgeInsets.symmetric(horizontal: 6 * density.spaceScale),
                child: Text('VS',
                    style: typography.label
                        .copyWith(color: colors.neutral500),),
              ),
              for (var i = 0; i < widget.maxOpponents; i++)
                Padding(
                  padding: EdgeInsets.only(right: 4 * density.spaceScale),
                  child: _Slot(
                    opponent: i < widget.opponents.length
                        ? widget.opponents[i]
                        : null,
                    isYou: false,
                    ready: i < widget.opponents.length
                        ? widget.opponents[i].isReady
                        : false,
                  ),
                ),
            ],
          ),
          SizedBox(height: 14 * density.spaceScale),
          Row(
            children: [
              if (widget.onShare != null)
                AuroraButton(
                  label: 'Share invite',
                  variant: AuroraButtonVariant.secondary,
                  size: AuroraButtonSize.sm,
                  iconLeft: const Icon(Icons.share, size: 14),
                  onPressed: widget.onShare,
                ),
              const Spacer(),
              AuroraButton(
                label: widget.youReady
                    ? (allReady ? 'Waiting…' : 'Ready ✓')
                    : 'Tap to ready',
                variant: widget.youReady
                    ? AuroraButtonVariant.tertiary
                    : AuroraButtonVariant.aurora,
                size: AuroraButtonSize.md,
                onPressed: widget.onToggleReady,
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _format(Duration d) {
    if (d.inHours > 0) {
      return '${d.inHours}h ${(d.inMinutes % 60).toString().padLeft(2, '0')}m';
    }
    final m = d.inMinutes.toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

class _Slot extends StatelessWidget {
  const _Slot({
    required this.opponent,
    required this.isYou,
    required this.ready,
  });

  final BattleOpponent? opponent;
  final bool isYou;
  final bool ready;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    if (opponent == null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: colors.neutral100,
              shape: BoxShape.circle,
              border: Border.all(color: colors.neutral200),
            ),
            child: Icon(Icons.person_outline, color: colors.neutral400),
          ),
          const SizedBox(height: 2),
          Text('Waiting',
              style: typography.overline.copyWith(color: colors.neutral500),),
        ],
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(
          alignment: Alignment.bottomRight,
          children: [
            AuroraAvatar(
              name: opponent!.name,
              image: opponent!.avatarImage,
              size: AuroraAvatarSize.md,
              status: ready ? AuroraAvatarStatus.online : null,
            ),
          ],
        ),
        const SizedBox(height: 2),
        SizedBox(
          width: 56,
          child: Text(
            isYou ? 'You' : opponent!.name,
            style: typography.overline.copyWith(
              color: colors.neutral700,
              fontWeight: isYou ? FontWeight.w700 : FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }
}
