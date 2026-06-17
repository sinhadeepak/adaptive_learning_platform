// LeaderboardRow — virtualised list row for leaderboard screens.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Slim 56-dp row tailored for `ListView.builder` performance. Renders:
//   [rank] [avatar] Name (You)         score    Δ
//                  Cohort / clan tag
//
// Rank ≤ 3 gets a tinted medal background; rank 4+ uses neutral text.
// The "(You)" suffix is automatic when `isSelf=true`.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_avatar.dart';

class LeaderboardRow extends StatelessWidget {
  const LeaderboardRow({
    super.key,
    required this.rank,
    required this.name,
    required this.score,
    this.avatarImage,
    this.subline,
    this.delta,
    this.isSelf = false,
    this.onTap,
  });

  final int rank;
  final String name;
  final ImageProvider? avatarImage;

  /// e.g. "Cohort B" or "Aurora clan".
  final String? subline;

  /// Number to display in the rank column; the row formats it.
  final int score;

  /// Rank delta vs previous period: +3, -2, 0 (= "—").
  final int? delta;

  final bool isSelf;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final medal = _medalFor(rank, colors);

    return Semantics(
      label: 'Rank $rank. $name. $score points.${delta == null ? '' : ' Delta ${delta!.abs()} ${delta! >= 0 ? 'up' : 'down'}.'}',
      button: onTap != null,
      child: Material(
        color: isSelf ? colors.brand50 : Colors.transparent,
        borderRadius:
            BorderRadius.circular(radius.md * density.radiusScale),
        child: InkWell(
          onTap: onTap,
          borderRadius:
              BorderRadius.circular(radius.md * density.radiusScale),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: 12 * density.spaceScale,
              vertical: 8 * density.spaceScale,
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 32,
                  height: 32,
                  child: Center(
                    child: Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: medal.bg,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '$rank',
                        style: typography.label.copyWith(
                          color: medal.fg,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
                SizedBox(width: 10 * density.spaceScale),
                AuroraAvatar(
                  name: name,
                  image: avatarImage,
                  size: AuroraAvatarSize.sm,
                ),
                SizedBox(width: 10 * density.spaceScale),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              name,
                              style: typography.body.copyWith(
                                color: colors.neutral900,
                                fontWeight: isSelf
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (isSelf) ...[
                            SizedBox(width: 6 * density.spaceScale),
                            Text(
                              '(You)',
                              style: typography.bodySm.copyWith(
                                color: colors.brand700,
                              ),
                            ),
                          ],
                        ],
                      ),
                      if (subline != null)
                        Text(
                          subline!,
                          style: typography.bodySm.copyWith(
                            color: colors.neutral500,
                          ),
                        ),
                    ],
                  ),
                ),
                SizedBox(width: 8 * density.spaceScale),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _formatScore(score),
                      style: typography.body.copyWith(
                        color: colors.neutral900,
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    if (delta != null) _DeltaPill(delta: delta!, colors: colors),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _formatScore(int s) {
    if (s < 1000) return '$s';
    if (s < 100000) return '${(s / 1000).toStringAsFixed(1)}k';
    return '${(s / 1000).round()}k';
  }

  static _Medal _medalFor(int rank, AuroraColors c) {
    if (rank == 1) {
      return _Medal(bg: c.reward500, fg: c.neutral0);
    } else if (rank == 2) {
      return _Medal(bg: c.neutral300, fg: c.neutral800);
    } else if (rank == 3) {
      return _Medal(bg: c.reward600.withValues(alpha: 0.65), fg: c.neutral0);
    }
    return _Medal(bg: c.neutral100, fg: c.neutral700);
  }
}

class _Medal {
  const _Medal({required this.bg, required this.fg});
  final Color bg;
  final Color fg;
}

class _DeltaPill extends StatelessWidget {
  const _DeltaPill({required this.delta, required this.colors});
  final int delta;
  final AuroraColors colors;

  @override
  Widget build(BuildContext context) {
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final flat = delta == 0;
    final up = delta > 0;
    final fg = flat
        ? colors.neutral500
        : (up ? colors.success600 : colors.danger600);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          flat
              ? Icons.horizontal_rule
              : (up ? Icons.arrow_drop_up : Icons.arrow_drop_down),
          size: 14,
          color: fg,
        ),
        Text(
          flat ? '—' : '${delta.abs()}',
          style: typography.overline.copyWith(color: fg),
        ),
      ],
    );
  }
}
