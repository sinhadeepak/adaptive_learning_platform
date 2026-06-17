// LumiCompanion — Aurora v3 domain organism.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §20.5
//       (Lumi character anatomy + motion vocabulary).
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.1.
//
// The orb-of-light character widget. Lumi has four canonical states
// (idle / thinking / celebrate / nudge), each with a different
// animation profile. The widget defaults to idle.
//
// Sizes
// ─────
// Four canonical sizes match the spec §20:
//   - chip:       16 dp (Lumi-as-icon in dense surfaces)
//   - card:       24 dp (next to a section heading, in a card header)
//   - hero:       64 dp (greeting strip on Home; Lumi attribution)
//   - fullScreen: 200 dp (splash, celebration takeovers)
//
// Persona-aware
// ─────────────
// The companion is hidden entirely for personas where
// `PersonaTheme.lumiProminence == LumiProminence.coachOnly` UNLESS the
// caller passes `forceVisible: true` (the Lumi chat surface itself).
// This is how we keep Lumi invisible on Aspirant's Home but visible
// on Aspirant's Doubts page.
//
// Visuals
// ───────
// - Translucent orb 0.6×size, inner core 0.45×size animated, halo
//   glow 1.4×size with `auroraAiSoft` gradient.
// - Final illustration design is pending the W2 design pass (plan
//   open question #1). The current implementation is a faithful
//   placeholder built from gradients + box shadows, sized + tinted
//   to read as Lumi.
//
// Motion vocabulary (§7.6 + §20.5)
// ────────────────────────────────
//   - lumiPulse:    idle. 2 s loop. Opacity 0.85 → 1.0. easeInOutSine.
//   - lumiThink:    1.2 s orbit. 3 satellite dots rotate around the core.
//   - lumiCelebrate: 800 ms one-shot. Scale 1.0 → 1.25 → 1.0. elasticOut.
//   - lumiNudge:    400 ms one-shot. Scale 1.0 → 1.1 → 1.0. elasticOut.
//
// Reduce Motion
// ─────────────
// Honours `MediaQuery.disableAnimationsOf(context)`. When animations
// are disabled, the orb renders static at full opacity / scale 1.0.

import 'dart:math' as math;

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

/// Discrete state Lumi can be in. The widget animates accordingly.
enum LumiState { idle, thinking, celebrating, nudging }

/// Canonical Lumi sizes (matches §20 of the spec).
enum LumiSize { chip, card, hero, fullScreen }

extension LumiSizeX on LumiSize {
  double get dp => switch (this) {
        LumiSize.chip => 16,
        LumiSize.card => 24,
        LumiSize.hero => 64,
        LumiSize.fullScreen => 200,
      };
}

class LumiCompanion extends StatefulWidget {
  const LumiCompanion({
    super.key,
    this.state = LumiState.idle,
    this.size = LumiSize.card,
    this.forceVisible = false,
    this.semanticLabel = 'Lumi',
  });

  final LumiState state;
  final LumiSize size;

  /// When true, render even when the active persona's
  /// [PersonaTheme.lumiProminence] is `coachOnly`. Set this on the
  /// dedicated Lumi chat surface and on AI-tutor doubts.
  final bool forceVisible;

  final String semanticLabel;

  @override
  State<LumiCompanion> createState() => _LumiCompanionState();
}

class _LumiCompanionState extends State<LumiCompanion>
    with TickerProviderStateMixin {
  late AnimationController _pulse;
  late AnimationController _orbit;
  late AnimationController _oneShot;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _orbit = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
    _oneShot = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _restartFor(widget.state);
  }

  @override
  void didUpdateWidget(covariant LumiCompanion oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.state != oldWidget.state) _restartFor(widget.state);
  }

  void _restartFor(LumiState state) {
    if (state == LumiState.celebrating) {
      _oneShot.duration = const Duration(milliseconds: 800);
      _oneShot.forward(from: 0);
    } else if (state == LumiState.nudging) {
      _oneShot.duration = const Duration(milliseconds: 400);
      _oneShot.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    _orbit.dispose();
    _oneShot.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final personaTheme = Theme.of(context).extension<PersonaTheme>();
    final visible = widget.forceVisible ||
        personaTheme == null ||
        personaTheme.lumiProminence != LumiProminence.coachOnly;
    if (!visible) return const SizedBox.shrink();

    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      label: widget.semanticLabel,
      child: SizedBox(
        width: widget.size.dp * 1.4,
        height: widget.size.dp * 1.4,
        child: reduceMotion
            ? _StaticOrb(size: widget.size.dp)
            : _AnimatedOrb(
                size: widget.size.dp,
                state: widget.state,
                pulse: _pulse,
                orbit: _orbit,
                oneShot: _oneShot,
              ),
      ),
    );
  }
}

class _StaticOrb extends StatelessWidget {
  const _StaticOrb({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Center(child: _OrbCore(size: size));
  }
}

class _AnimatedOrb extends StatelessWidget {
  const _AnimatedOrb({
    required this.size,
    required this.state,
    required this.pulse,
    required this.orbit,
    required this.oneShot,
  });

  final double size;
  final LumiState state;
  final Animation<double> pulse;
  final Animation<double> orbit;
  final Animation<double> oneShot;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([pulse, orbit, oneShot]),
      builder: (ctx, _) {
        final pulseEase = Curves.easeInOutSine.transform(pulse.value);
        final pulseOpacity = 0.85 + 0.15 * pulseEase;
        final oneShotEase = Curves.elasticOut.transform(oneShot.value);

        var scale = 1.0;
        if (state == LumiState.celebrating && oneShot.isAnimating) {
          // 1.0 → 1.25 → 1.0 across the one-shot
          scale = 1.0 + 0.25 * math.sin(math.pi * oneShot.value);
        } else if (state == LumiState.nudging && oneShot.isAnimating) {
          // 1.0 → 1.1 → 1.0 — bouncier elasticOut interpolation
          scale = 1.0 + 0.1 * math.sin(math.pi * oneShotEase);
        }

        return Stack(
          alignment: Alignment.center,
          children: [
            // Thinking-state satellite dots orbiting the core.
            if (state == LumiState.thinking)
              ..._satelliteDots(size: size, t: orbit.value),
            Transform.scale(
              scale: scale,
              child: Opacity(
                opacity: pulseOpacity,
                child: _OrbCore(size: size),
              ),
            ),
          ],
        );
      },
    );
  }

  List<Widget> _satelliteDots({required double size, required double t}) {
    const count = 3;
    final radius = size * 0.55;
    final dotSize = math.max(2.0, size * 0.12);
    return List.generate(count, (i) {
      final theta = 2 * math.pi * (t + i / count);
      final dx = math.cos(theta) * radius;
      final dy = math.sin(theta) * radius;
      return Transform.translate(
        offset: Offset(dx, dy),
        child: _ThinkingDot(size: dotSize),
      );
    });
  }
}

class _ThinkingDot extends StatelessWidget {
  const _ThinkingDot({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: colors.aurora500.withValues(alpha: 0.85),
        boxShadow: [
          BoxShadow(
            color: colors.aurora500.withValues(alpha: 0.5),
            blurRadius: size * 0.6,
          ),
        ],
      ),
    );
  }
}

class _OrbCore extends StatelessWidget {
  const _OrbCore({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(
          // Soft violet core → cyan halo → fade. Mirrors the AI gradient.
          colors: [
            Color(0xFFA78BFA),
            Color(0xFF22D4EE),
            Color(0x0022D4EE),
          ],
          stops: [0.0, 0.6, 1.0],
        ),
        boxShadow: [
          BoxShadow(
            color: colors.aurora500.withValues(alpha: 0.45),
            blurRadius: size * 0.6,
            spreadRadius: size * 0.05,
          ),
        ],
      ),
    );
  }
}
