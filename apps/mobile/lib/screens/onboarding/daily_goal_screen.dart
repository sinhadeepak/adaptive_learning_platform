import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../../auth/auth_client.dart';
import '../onboarding_shell.dart';

/// Final onboarding step. Server-side, PATCH /profile/preferences with `dailyGoalMinutes`
/// advances the FSM EXAM_SELECTED → ONBOARDED. After this completes, app routes to home.
class DailyGoalScreen extends StatefulWidget {
  const DailyGoalScreen({
    super.key,
    required this.auth,
    required this.onCompleted,
    required this.onBack,
  });

  final AuthClient auth;
  final VoidCallback onCompleted;
  final VoidCallback onBack;

  @override
  State<DailyGoalScreen> createState() => _DailyGoalScreenState();
}

class _DailyGoalScreenState extends State<DailyGoalScreen> {
  static const _options = [
    (15, 'Chill — 15 min/day'),
    (30, 'Regular — 30 min/day'),
    (60, 'Serious — 60 min/day'),
    (120, 'Intense — 120 min/day'),
  ];

  int _selected = 30;
  bool _submitting = false;
  String? _error;

  Future<void> _start() async {
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final res = await widget.auth.apiPatch('/profile/preferences', {'dailyGoalMinutes': _selected});
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't save your goal.");
        return;
      }
      // Mark the in-memory user as ONBOARDED so the app routes to home immediately.
      final u = widget.auth.user;
      if (u != null) {
        widget.auth.setUser(User(
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          onboardingState: 'ONBOARDED',
          tenantId: u.tenantId,
        ),);
      }
      widget.onCompleted();
    } catch (_) {
      setState(() => _error = "We couldn't save your goal.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return OnboardingShell(
      step: 4,
      title: 'Set your daily goal',
      description: 'Consistency beats intensity. Pick a goal you can stick to.',
      onBack: widget.onBack,
      children: [
        if (_error != null) ...[
          _OnboardingError(message: _error!),
          const SizedBox(height: AlpSpacing.s3),
        ],
        for (final opt in _options) ...[
          _GoalCard(
            minutes: opt.$1,
            label: opt.$2,
            selected: _selected == opt.$1,
            onTap: () => setState(() => _selected = opt.$1),
          ),
          const SizedBox(height: AlpSpacing.s3),
        ],
        const SizedBox(height: AlpSpacing.s2),
        const Center(
          child: Text(
            "You'll get a streak for hitting this 4 days/week.",
            style: AlpTextStyles.hint,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: AlpSpacing.s4),
        SizedBox(
          height: 48,
          child: FilledButton(
            key: const Key('onboarding.goal.start'),
            onPressed: _submitting ? null : _start,
            child: Text(_submitting ? 'Setting up…' : 'Start learning'),
          ),
        ),
      ],
    );
  }
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({
    required this.minutes,
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final int minutes;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: Key('onboarding.goal.$minutes'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(AlpRadius.card),
      child: Container(
        padding: const EdgeInsets.all(AlpSpacing.s4),
        decoration: BoxDecoration(
          color: selected ? AlpColors.brandTint : AlpColors.surfacePrimary,
          border: Border.all(
            color: selected ? AlpColors.brandPrimary : AlpColors.borderDefault,
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(AlpRadius.card),
        ),
        child: Row(
          children: [
            Expanded(child: Text(label, style: AlpTextStyles.subheading)),
            if (selected)
              const Icon(Icons.check, color: AlpColors.brandPrimary, size: 20),
          ],
        ),
      ),
    );
  }
}

class _OnboardingError extends StatelessWidget {
  const _OnboardingError({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AlpSpacing.s3),
      decoration: BoxDecoration(
        color: AlpColors.dangerBg,
        borderRadius: BorderRadius.circular(AlpRadius.panel),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 16, color: AlpColors.dangerFg),
          const SizedBox(width: AlpSpacing.s2),
          Expanded(
            child: Text(message, style: AlpTextStyles.body.copyWith(color: AlpColors.dangerFg)),
          ),
        ],
      ),
    );
  }
}
