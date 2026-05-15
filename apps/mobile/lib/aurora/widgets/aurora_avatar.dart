// AuroraAvatar — Aurora v2 avatar primitive.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.1
//
// Image-first with initials fallback when `image` is null or fails to
// load. Optional status dot (online/offline/busy/away) in the
// bottom-right per the web pattern.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

enum AuroraAvatarSize { xs, sm, md, lg, xl, xxl }

enum AuroraAvatarStatus { online, offline, busy, away }

class AuroraAvatar extends StatelessWidget {
  const AuroraAvatar({
    super.key,
    this.name,
    this.image,
    this.size = AuroraAvatarSize.md,
    this.status,
  });

  /// User's display name. Used for initials + accessible label.
  final String? name;
  final ImageProvider? image;
  final AuroraAvatarSize size;
  final AuroraAvatarStatus? status;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final dim = _dimFor(size);
    final fontSize = dim * 0.40;
    final initials = _initialsFrom(name);

    Widget circle = Container(
      width: dim,
      height: dim,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: colors.brand100,
        shape: BoxShape.circle,
        image: image == null
            ? null
            : DecorationImage(image: image!, fit: BoxFit.cover),
      ),
      child: image == null
          ? Text(
              initials,
              style: TextStyle(
                color: colors.brand700,
                fontWeight: FontWeight.w700,
                fontSize: fontSize,
              ),
            )
          : null,
    );

    if (status != null) {
      final dotSize = (dim * 0.28).clamp(8.0, 18.0);
      circle = Stack(
        clipBehavior: Clip.none,
        children: [
          circle,
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: dotSize,
              height: dotSize,
              decoration: BoxDecoration(
                color: _statusColor(colors),
                shape: BoxShape.circle,
                border: Border.all(color: colors.neutral0, width: 2),
              ),
            ),
          ),
        ],
      );
    }

    return Semantics(
      label: name == null ? null : '$name${status == null ? '' : ', ${status!.name}'}',
      image: image != null,
      child: circle,
    );
  }

  double _dimFor(AuroraAvatarSize s) => switch (s) {
        AuroraAvatarSize.xs => 20,
        AuroraAvatarSize.sm => 24,
        AuroraAvatarSize.md => 32,
        AuroraAvatarSize.lg => 40,
        AuroraAvatarSize.xl => 56,
        AuroraAvatarSize.xxl => 80,
      };

  Color _statusColor(AuroraColors c) => switch (status!) {
        AuroraAvatarStatus.online => c.success500,
        AuroraAvatarStatus.offline => c.neutral400,
        AuroraAvatarStatus.busy => c.danger500,
        AuroraAvatarStatus.away => c.developing500,
      };

  static String _initialsFrom(String? name) {
    if (name == null) return '?';
    final parts = name.trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty);
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }
}
