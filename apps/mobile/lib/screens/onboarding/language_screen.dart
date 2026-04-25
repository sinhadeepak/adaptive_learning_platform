import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../../auth/auth_client.dart';
import '../onboarding_shell.dart';

class LanguageScreen extends StatefulWidget {
  const LanguageScreen({
    super.key,
    required this.auth,
    required this.onContinue,
    required this.onBack,
  });

  final AuthClient auth;
  final VoidCallback onContinue;
  final VoidCallback onBack;

  @override
  State<LanguageScreen> createState() => _LanguageScreenState();
}

class _LanguageScreenState extends State<LanguageScreen> {
  static const _options = [
    ('en', 'English', 'Default. All content available.'),
    ('hi', 'हिन्दी', 'Hindi content rolls out from Sprint 2.'),
    ('hinglish', 'Hinglish', 'Type either; we understand both.'),
  ];

  String _selected = 'en';
  bool _submitting = false;
  String? _error;

  Future<void> _submit({bool skip = false}) async {
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final res = await widget.auth.apiPatch('/profile/preferences', {
        'language': skip ? 'en' : _selected,
      });
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't save your preference. Try again.");
        return;
      }
      widget.onContinue();
    } catch (_) {
      setState(() => _error = "We couldn't save your preference. Try again.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return OnboardingShell(
      step: 2,
      title: 'What language do you want to learn in?',
      description: 'You can switch any time from settings.',
      onBack: widget.onBack,
      children: [
        if (_error != null) ...[
          _OnboardingError(message: _error!),
          const SizedBox(height: AlpSpacing.s3),
        ],
        for (final opt in _options) ...[
          _LanguageCard(
            id: opt.$1,
            label: opt.$2,
            sub: opt.$3,
            selected: _selected == opt.$1,
            onTap: () => setState(() => _selected = opt.$1),
          ),
          const SizedBox(height: AlpSpacing.s3),
        ],
        const SizedBox(height: AlpSpacing.s2),
        SizedBox(
          height: 48,
          child: FilledButton(
            key: const Key('onboarding.language.continue'),
            onPressed: _submitting ? null : () => _submit(),
            child: const Text('Continue'),
          ),
        ),
        const SizedBox(height: AlpSpacing.s2),
        SizedBox(
          height: 48,
          child: OutlinedButton(
            onPressed: _submitting ? null : () => _submit(skip: true),
            child: const Text('Skip (defaults to English)'),
          ),
        ),
      ],
    );
  }
}

class _LanguageCard extends StatelessWidget {
  const _LanguageCard({
    required this.id,
    required this.label,
    required this.sub,
    required this.selected,
    required this.onTap,
  });
  final String id;
  final String label;
  final String sub;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: Key('onboarding.language.$id'),
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
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: AlpTextStyles.subheading),
                  const SizedBox(height: AlpSpacing.s1),
                  Text(sub, style: AlpTextStyles.hint),
                ],
              ),
            ),
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
