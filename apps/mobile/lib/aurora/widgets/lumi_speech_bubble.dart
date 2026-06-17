// LumiSpeechBubble — Aurora v3 domain organism.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §20.5
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.1.
//
// The chat bubble Lumi renders into. Three message shapes:
//   - `lumi`     — Lumi's voice. Soft Aurora gradient fill, left-
//                  anchored, with a small companion in the leading
//                  slot when prominence permits.
//   - `user`     — User's voice. Brand-tinted fill, right-anchored.
//   - `refusal`  — Lumi refused under a safety category. Same shape
//                  as `lumi` but with the appropriate warning icon
//                  + tone, and a "Report" affordance.
//
// Citation footer
// ───────────────
// When the bubble's `metadata['citations']` is a non-empty list of
// `{url, indexed_at}` maps, a small footer renders with the source
// host + indexed-at date. Required for Mentor-mode current-affairs
// answers per §20.5.4 of the spec.
//
// Tap behaviour
// ──────────────
// Long-press surfaces a report sheet ([onReport] callback). Tap on a
// citation chip opens the source URL via an injected launcher
// (defaults to clipboard fallback — matches the helpline sheet
// pattern).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../lumi_coach.dart';

enum LumiBubbleVariant { lumi, user, refusal }

class LumiSpeechBubble extends StatelessWidget {
  const LumiSpeechBubble({
    super.key,
    required this.turn,
    this.coachMode,
    this.variantOverride,
    this.leadingCompanion,
    this.onReport,
    this.urlLauncher,
  });

  /// The conversation turn this bubble renders. `role` ('user' / 'lumi')
  /// and `metadata['refused']` together pick the variant.
  final LumiTurn turn;

  /// Active coach mode. Drives subtle styling differences — Encourager
  /// gets warmer accents, Mentor gets a denser citation footer, etc.
  /// When null the bubble assumes Mentor (the most reserved variant).
  final LumiCoachMode? coachMode;

  /// Force a specific variant — useful for the "Lumi locked due to
  /// safety" placeholder in chats that have been session-locked.
  final LumiBubbleVariant? variantOverride;

  /// Leading widget rendered next to a Lumi bubble (typically a
  /// [LumiCompanion] in chip size). Null hides it — appropriate for
  /// Aspirant + Learner personas where Lumi prominence is dialled
  /// down.
  final Widget? leadingCompanion;

  /// Invoked on long-press of a Lumi / refusal bubble. The host is
  /// responsible for opening the [AuroraSafetyReportSheet].
  final VoidCallback? onReport;

  /// Citation tap handler. Same fallback contract as the helpline
  /// sheet — if null, tap copies the URL to clipboard.
  final Future<bool> Function(String url)? urlLauncher;

  LumiBubbleVariant get _variant {
    if (variantOverride != null) return variantOverride!;
    if (turn.role == 'user') return LumiBubbleVariant.user;
    if (turn.metadata['refused'] == true) return LumiBubbleVariant.refusal;
    return LumiBubbleVariant.lumi;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final v = _variant;
    final alignment =
        v == LumiBubbleVariant.user ? Alignment.centerRight : Alignment.centerLeft;
    final pad = 12.0 * density.spaceScale;
    final cornerR = radius.lg * density.radiusScale;

    final palette = _paletteFor(v, colors, coachMode);
    final corners = _cornerRadiusFor(v, cornerR);
    final citations = _citations(turn);

    final bubble = ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * 0.78,
      ),
      child: Container(
        padding: EdgeInsets.all(pad),
        decoration: BoxDecoration(
          color: palette.bg,
          gradient: palette.gradient,
          borderRadius: corners,
          border: Border.all(color: palette.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (v == LumiBubbleVariant.refusal) ...[
              Row(
                children: [
                  Icon(Icons.shield_outlined,
                      size: 16, color: palette.fg.withValues(alpha: 0.8),),
                  SizedBox(width: 6 * density.spaceScale),
                  Text(
                    'Lumi can\'t help with that',
                    style: typography.label.copyWith(
                      color: palette.fg.withValues(alpha: 0.8),
                    ),
                  ),
                ],
              ),
              SizedBox(height: 6 * density.spaceScale),
            ],
            Text(
              turn.content,
              style: typography.body.copyWith(
                color: palette.fg,
                height: 1.4,
              ),
            ),
            if (citations.isNotEmpty) ...[
              SizedBox(height: 8 * density.spaceScale),
              _CitationFooter(
                citations: citations,
                launcher: urlLauncher,
                fg: palette.fg.withValues(alpha: 0.75),
              ),
            ],
          ],
        ),
      ),
    );

    final tappable = onReport == null
        ? bubble
        : GestureDetector(
            onLongPress: () {
              HapticFeedback.mediumImpact();
              onReport!();
            },
            child: bubble,
          );

    return Align(
      alignment: alignment,
      child: Padding(
        padding: EdgeInsets.symmetric(
          vertical: 4 * density.spaceScale,
        ),
        child: v == LumiBubbleVariant.user
            ? tappable
            : Row(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (leadingCompanion != null) ...[
                    leadingCompanion!,
                    SizedBox(width: 6 * density.spaceScale),
                  ],
                  Flexible(child: tappable),
                ],
              ),
      ),
    );
  }

  List<Map<String, String>> _citations(LumiTurn t) {
    final raw = t.metadata['citations'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((m) => m.map((k, v) => MapEntry(k.toString(), v.toString())))
        .where((m) => m.containsKey('url'))
        .toList();
  }

  static _BubblePalette _paletteFor(
    LumiBubbleVariant v,
    AuroraColors colors,
    LumiCoachMode? mode,
  ) {
    switch (v) {
      case LumiBubbleVariant.lumi:
        // Use auroraAiSoft gradient for Lumi voice — matches AI surface
        // signature. Encourager mode warms it up slightly with the
        // celebration gradient via tone-shifted alpha. The actual
        // gradient choice is server-driven for hero moments; here we
        // pick a calm default.
        return _BubblePalette(
          bg: null,
          gradient: colors.auroraAiSoft,
          border: colors.neutral200,
          fg: colors.neutral900,
        );
      case LumiBubbleVariant.user:
        return _BubblePalette(
          bg: colors.brand100,
          border: colors.brand100,
          fg: colors.neutral900,
        );
      case LumiBubbleVariant.refusal:
        return _BubblePalette(
          bg: colors.developing50,
          border: colors.developing500.withValues(alpha: 0.35),
          fg: colors.neutral900,
        );
    }
  }

  static BorderRadius _cornerRadiusFor(LumiBubbleVariant v, double r) {
    // Asymmetric corners give bubbles their "speaker" anchor.
    if (v == LumiBubbleVariant.user) {
      return BorderRadius.only(
        topLeft: Radius.circular(r),
        topRight: Radius.circular(r),
        bottomLeft: Radius.circular(r),
        bottomRight: Radius.circular(r * 0.3),
      );
    }
    return BorderRadius.only(
      topLeft: Radius.circular(r),
      topRight: Radius.circular(r),
      bottomLeft: Radius.circular(r * 0.3),
      bottomRight: Radius.circular(r),
    );
  }
}

class _BubblePalette {
  const _BubblePalette({
    required this.fg,
    required this.border,
    this.bg,
    this.gradient,
  });
  final Color fg;
  final Color border;
  final Color? bg;
  final Gradient? gradient;
}

class _CitationFooter extends StatelessWidget {
  const _CitationFooter({
    required this.citations,
    required this.launcher,
    required this.fg,
  });

  final List<Map<String, String>> citations;
  final Future<bool> Function(String url)? launcher;
  final Color fg;

  Future<void> _onTap(BuildContext context, String url) async {
    if (launcher != null) {
      final ok = await launcher!(url);
      if (ok) return;
    }
    await Clipboard.setData(ClipboardData(text: url));
  }

  @override
  Widget build(BuildContext context) {
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final c in citations)
          InkWell(
            onTap: () => _onTap(context, c['url']!),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 8,
                vertical: 3,
              ),
              decoration: BoxDecoration(
                color: fg.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                _label(c),
                style: typography.overline.copyWith(color: fg),
              ),
            ),
          ),
      ],
    );
  }

  static String _label(Map<String, String> c) {
    final url = c['url'] ?? '';
    final host = Uri.tryParse(url)?.host ?? url;
    final indexed = c['indexed_at'];
    return indexed == null ? host : '$host · $indexed';
  }
}
