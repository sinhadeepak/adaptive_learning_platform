// PersonaSelectScreen — onboarding step that asks "Who is this app for?"
// and captures one of four [Persona] values via a 2×2 grid of tappable
// tiles.
//
// Spec: docs/02-design/redesign/onboarding-persona-select.md
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.
//
// This is the highest-leverage screen in the entire onboarding flow — the
// chosen persona drives the IA, voice, gamification, and parental layer
// for every subsequent surface. Without an explicit choice the app
// silently defaults to Aspirant, which is wrong for ~70% of installs.
//
// Selection is required — there is no "Skip". The user can reverse the
// choice from Settings later; the no-skip rule is captured in the brief.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../aurora/persona.dart';
import '../../aurora/widgets/widgets.dart';

class PersonaSelectScreen extends StatefulWidget {
  const PersonaSelectScreen({
    super.key,
    required this.notifier,
    required this.onContinue,
  });

  /// The notifier the screen writes the chosen persona to.
  final PersonaNotifier notifier;

  /// Invoked after [PersonaNotifier.setPersona] completes successfully.
  /// The host (main.dart or the debug-only preview flow in Preferences)
  /// is responsible for routing to the next onboarding step (Kid →
  /// Parent Unlock; everyone else → Welcome).
  final VoidCallback onContinue;

  @override
  State<PersonaSelectScreen> createState() => _PersonaSelectScreenState();
}

class _PersonaSelectScreenState extends State<PersonaSelectScreen> {
  Persona? _selected;
  int _changes = 0;
  bool _saving = false;

  void _select(Persona p) {
    if (_selected == p) return;
    if (_selected != null) _changes++;
    HapticFeedback.selectionClick();
    setState(() => _selected = p);
  }

  Future<void> _continue() async {
    final p = _selected;
    if (p == null || _saving) return;
    setState(() => _saving = true);
    await widget.notifier.setPersona(p);
    if (!mounted) return;
    HapticFeedback.lightImpact();
    // TODO(W2.0 analytics): emit `onboarding_persona_selected` with props
    // {persona: p.id, time_to_select_ms: ..., changes_before_commit: _changes}
    // once the analytics taxonomy (master spec §31) is wired.
    debugPrint(
      '[onboarding] persona=${p.id} changes_before_commit=$_changes',
    );
    widget.onContinue();
  }

  Future<bool> _onBackPressed() async {
    // Selection is required; Android back press shows an alert rather
    // than popping. Matches §5 of the brief.
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Pick one to continue'),
        content: const Text(
          "We need this to set up your experience. Pick one of the four — "
          'you can change it any time in Settings → Persona.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        await _onBackPressed();
      },
      child: AuroraScaffold(
        body: SafeArea(
          child: LayoutBuilder(
            builder: (ctx, constraints) {
              final narrow = constraints.maxWidth < 360;
              return Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Heading ────────────────────────────────────
                    const SizedBox(height: 12),
                    Text(
                      'Who is this app for?',
                      style: typography.h1.copyWith(color: colors.neutral900),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "We'll tailor the app — change any time in Settings.",
                      style: typography.bodyLg
                          .copyWith(color: colors.neutral500),
                    ),
                    const SizedBox(height: 24),
                    // ── 2×2 tile grid ─────────────────────────────
                    Expanded(
                      child: GridView.count(
                        crossAxisCount: narrow ? 1 : 2,
                        childAspectRatio: narrow ? 2.6 : 1.05,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        children: [
                          _PersonaCard(
                            persona: Persona.kid,
                            icon: '🎈',
                            label: 'Kid',
                            sub: 'Class V–VIII (10–14)',
                            body:
                                'Adventure-map learning, big illustrations, audio narration. Parent gate for safety.',
                            selected: _selected == Persona.kid,
                            dimOthers:
                                _selected != null && _selected != Persona.kid,
                            onTap: () => _select(Persona.kid),
                          ),
                          _PersonaCard(
                            persona: Persona.teen,
                            icon: '🎯',
                            label: 'Teen',
                            sub: 'IX–XII · NEET / JEE',
                            body:
                                'Streaks, leagues, mock tests, doubt-solving with friends.',
                            selected: _selected == Persona.teen,
                            dimOthers:
                                _selected != null && _selected != Persona.teen,
                            onTap: () => _select(Persona.teen),
                          ),
                          _PersonaCard(
                            persona: Persona.aspirant,
                            icon: '⚖️',
                            label: 'Aspirant',
                            sub: 'UPSC · CAT · GATE',
                            body:
                                'Test series, sectional analysis, current affairs, mains evaluation.',
                            selected: _selected == Persona.aspirant,
                            dimOthers: _selected != null &&
                                _selected != Persona.aspirant,
                            onTap: () => _select(Persona.aspirant),
                          ),
                          _PersonaCard(
                            persona: Persona.learner,
                            icon: '💼',
                            label: 'Learner',
                            sub: 'Working professional',
                            body:
                                'Bite-size lessons, certificates, learn at your pace.',
                            selected: _selected == Persona.learner,
                            dimOthers: _selected != null &&
                                _selected != Persona.learner,
                            onTap: () => _select(Persona.learner),
                          ),
                        ],
                      ),
                    ),
                    // ── CTA + helper ──────────────────────────────
                    const SizedBox(height: 16),
                    AuroraButton(
                      label: 'Continue',
                      variant: AuroraButtonVariant.primary,
                      size: AuroraButtonSize.lg,
                      fullWidth: true,
                      loading: _saving,
                      onPressed: _selected == null ? null : _continue,
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: TextButton(
                        onPressed: _showExplainer,
                        child: Text(
                          'Why are you asking?',
                          style: typography.bodySm
                              .copyWith(color: colors.neutral500),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  void _showExplainer() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final colors = Theme.of(ctx).extension<AuroraColors>()!;
        final typography = Theme.of(ctx).extension<AuroraTypography>()!;
        return Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            20,
            24,
            24 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Why are you asking?',
                style: typography.h3.copyWith(color: colors.neutral900),
              ),
              const SizedBox(height: 12),
              Text(
                'We use this to choose the right experience. Different '
                'audiences want different homes, different gamification, '
                'and different parental controls. Pick the closest match — '
                'switch any time in Settings → Persona.',
                style: typography.body.copyWith(color: colors.neutral700),
              ),
              const SizedBox(height: 16),
              AuroraButton(
                label: 'Got it',
                fullWidth: true,
                onPressed: () => Navigator.of(ctx).pop(),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _PersonaCard extends StatelessWidget {
  const _PersonaCard({
    required this.persona,
    required this.icon,
    required this.label,
    required this.sub,
    required this.body,
    required this.selected,
    required this.dimOthers,
    required this.onTap,
  });

  final Persona persona;
  final String icon;
  final String label;
  final String sub;
  final String body;
  final bool selected;
  final bool dimOthers;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Semantics(
      label: '$label. $sub. $body',
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: dimOthers ? 0.55 : 1.0,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(16),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: selected ? colors.brand100 : colors.neutral0,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: selected ? colors.brand600 : colors.neutral200,
                  width: selected ? 2 : 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(icon, style: const TextStyle(fontSize: 36)),
                  const SizedBox(height: 8),
                  Text(
                    label,
                    style: typography.h4
                        .copyWith(color: colors.neutral900),
                  ),
                  Text(
                    sub,
                    style: typography.bodySm
                        .copyWith(color: colors.neutral500),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: Text(
                      body,
                      style: typography.bodySm
                          .copyWith(color: colors.neutral700, height: 1.35),
                      maxLines: 4,
                      overflow: TextOverflow.fade,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
