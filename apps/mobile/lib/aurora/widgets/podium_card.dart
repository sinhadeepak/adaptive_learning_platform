// PodiumCard — top 3 leaderboard hero.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Renders the 2-1-3 podium with avatars + scores on top of the
// leaderboard list. Tap any avatar to drill into that user's profile.
//
//          ┌──┐
//   ┌──┐   │1 │   ┌──┐
//   │2 │   │  │   │3 │
//   └──┘   └──┘   └──┘

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_avatar.dart';

class PodiumEntry {
  const PodiumEntry({
    required this.name,
    required this.score,
    this.avatarImage,
    this.onTap,
  });

  final String name;
  final int score;
  final ImageProvider? avatarImage;
  final VoidCallback? onTap;
}

class PodiumCard extends StatelessWidget {
  const PodiumCard({
    super.key,
    required this.first,
    required this.second,
    required this.third,
  });

  final PodiumEntry first;
  final PodiumEntry? second;
  final PodiumEntry? third;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    return Semantics(
      label:
          'Podium. First ${first.name} ${first.score}.${second != null ? ' Second ${second!.name} ${second!.score}.' : ''}${third != null ? ' Third ${third!.name} ${third!.score}.' : ''}',
      child: Container(
        padding: EdgeInsets.all(16 * density.spaceScale),
        decoration: BoxDecoration(
          gradient: colors.auroraCelebrationSoft,
          borderRadius:
              BorderRadius.circular(radius.lg * density.radiusScale),
          border: Border.all(color: colors.reward500.withValues(alpha: 0.30)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: _Step(
                rank: 2,
                entry: second,
                heightFraction: 0.70,
                avatarSize: AuroraAvatarSize.md,
                fgColor: colors.neutral800,
                bgColor: colors.neutral200,
                typography: typography,
              ),
            ),
            SizedBox(width: 8 * density.spaceScale),
            Expanded(
              child: _Step(
                rank: 1,
                entry: first,
                heightFraction: 1.0,
                avatarSize: AuroraAvatarSize.lg,
                fgColor: colors.neutral0,
                bgColor: colors.reward500,
                typography: typography,
              ),
            ),
            SizedBox(width: 8 * density.spaceScale),
            Expanded(
              child: _Step(
                rank: 3,
                entry: third,
                heightFraction: 0.55,
                avatarSize: AuroraAvatarSize.md,
                fgColor: colors.neutral0,
                bgColor: colors.reward600.withValues(alpha: 0.65),
                typography: typography,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.rank,
    required this.entry,
    required this.heightFraction,
    required this.avatarSize,
    required this.fgColor,
    required this.bgColor,
    required this.typography,
  });

  final int rank;
  final PodiumEntry? entry;
  final double heightFraction;
  final AuroraAvatarSize avatarSize;
  final Color fgColor;
  final Color bgColor;
  final AuroraTypography typography;

  static const _maxHeight = 120.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final h = _maxHeight * heightFraction;

    if (entry == null) {
      return SizedBox(height: h);
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GestureDetector(
          onTap: entry!.onTap,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AuroraAvatar(
                name: entry!.name,
                image: entry!.avatarImage,
                size: avatarSize,
              ),
              SizedBox(height: 6 * density.spaceScale),
              Text(
                entry!.name,
                style: typography.bodySm.copyWith(
                  color: colors.neutral800,
                  fontWeight: rank == 1 ? FontWeight.w700 : FontWeight.w600,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
        SizedBox(height: 4 * density.spaceScale),
        Container(
          height: h,
          alignment: Alignment.topCenter,
          padding: EdgeInsets.only(top: 8 * density.spaceScale),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(10),
            ),
          ),
          child: Column(
            children: [
              Text(
                '$rank',
                style: typography.h2.copyWith(color: fgColor),
              ),
              const Spacer(),
              Padding(
                padding: EdgeInsets.only(bottom: 6 * density.spaceScale),
                child: Text(
                  _formatScore(entry!.score),
                  style: typography.bodySm.copyWith(
                    color: fgColor,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _formatScore(int s) =>
      s < 1000 ? '$s' : '${(s / 1000).toStringAsFixed(1)}k';
}
