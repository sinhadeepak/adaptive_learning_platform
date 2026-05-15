// Login screen — Aurora v2 redesign.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §13.2
//
// Mobile auth pattern: single-screen scrollable form, hero band at top
// with brand mark + welcome copy on a soft Aurora-AI tint band, form
// below. CTA pinned with `AnimatedPadding` so it floats above the
// keyboard cleanly.
//
// API surface preserved verbatim — every AuthClient call, every error
// code mapping, every validation rule.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/widgets/widgets.dart';
import '../auth/auth_client.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.auth,
    required this.onLoggedIn,
    this.onSignUp,
    this.onForgotPassword,
  });

  final AuthClient auth;
  final void Function(Session session) onLoggedIn;
  final VoidCallback? onSignUp;
  final VoidCallback? onForgotPassword;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _remember = false;
  bool _submitting = false;
  String? _error;
  // AuroraTextField doesn't plug into Form.validate(), so empty-field
  // validation lives here as explicit per-field error state.
  String? _emailError;
  String? _passwordError;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final emailEmpty = _email.text.trim().isEmpty;
    final passwordEmpty = _password.text.isEmpty;
    if (emailEmpty || passwordEmpty) {
      setState(() {
        _emailError = emailEmpty ? 'Enter your email' : null;
        _passwordError = passwordEmpty ? 'Enter your password' : null;
      });
      return;
    }
    if (!(_formKey.currentState?.validate() ?? true)) return;
    setState(() {
      _error = null;
      _emailError = null;
      _passwordError = null;
      _submitting = true;
    });
    try {
      final session = await widget.auth.login(
        email: _email.text.trim(),
        password: _password.text,
        remember: _remember,
      );
      widget.onLoggedIn(session);
    } on AuthException catch (e) {
      setState(() => _error = _friendlyMessage(e));
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _friendlyMessage(AuthException e) {
    switch (e.code) {
      case AuthErrorCode.invalidCredentials:
        return 'Email or password is incorrect.';
      case AuthErrorCode.locked:
        return e.message;
      case AuthErrorCode.rateLimited:
        return 'Too many attempts. Please wait a moment.';
      case AuthErrorCode.notVerified:
        return 'Please verify your email to log in.';
      case AuthErrorCode.resetTokenInvalid:
      case AuthErrorCode.weakPassword:
      case AuthErrorCode.unknown:
        return 'Something went wrong. Please try again.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    return AuroraScaffold(
      body: SingleChildScrollView(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Aurora hero band ──────────────────────────────────────
            Container(
              padding: const EdgeInsets.fromLTRB(20, 36, 20, 32),
              decoration: BoxDecoration(gradient: colors.auroraAiSoft),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          gradient: colors.auroraAi,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'A',
                          style: typography.h3.copyWith(
                            color: colors.neutral0,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'AdaptiveLearn',
                        style: typography.h3.copyWith(
                          color: colors.neutral900,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Practice smarter.\nImprove faster.',
                    style: typography.h1.copyWith(color: colors.neutral900),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Your AI coach picks the next question at your level — and '
                    "remembers what you've already mastered.",
                    style: typography.body.copyWith(color: colors.neutral700),
                  ),
                ],
              ),
            ),

            // ── Form ─────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Log in',
                        style: typography.h2.copyWith(color: colors.neutral900),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Welcome back, learner.',
                        style: typography.body.copyWith(color: colors.neutral600),
                      ),
                      const SizedBox(height: 20),
                      if (_error != null) ...[
                        AuroraCard(
                          tone: AuroraCardTone.neutral,
                          padding: AuroraCardPadding.sm,
                          child: Row(
                            children: [
                              Icon(
                                Icons.error_outline,
                                size: 18,
                                color: colors.danger600,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _error!,
                                  style: typography.bodySm.copyWith(
                                    color: colors.danger600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      AuroraTextField(
                        key: const Key('login.email'),
                        controller: _email,
                        label: 'Email',
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.email],
                        errorText: _emailError,
                      ),
                      const SizedBox(height: 16),
                      AuroraTextField(
                        key: const Key('login.password'),
                        controller: _password,
                        label: 'Password',
                        obscureText: true,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => _submit(),
                        errorText: _passwordError,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          AuroraCheckbox(
                            value: _remember,
                            onChanged: (v) =>
                                setState(() => _remember = v ?? false),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Remember me',
                            style: typography.body.copyWith(
                              color: colors.neutral700,
                            ),
                          ),
                          const Spacer(),
                          TextButton(
                            key: const Key('login.forgot'),
                            onPressed:
                                _submitting ? null : widget.onForgotPassword,
                            child: const Text('Forgot?'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      AuroraButton(
                        key: const Key('login.submit'),
                        label: _submitting ? 'Logging in…' : 'Log in',
                        variant: AuroraButtonVariant.primary,
                        size: AuroraButtonSize.lg,
                        fullWidth: true,
                        loading: _submitting,
                        onPressed: _submitting ? null : _submit,
                      ),
                      const SizedBox(height: 16),
                      Center(
                        child: TextButton(
                          key: const Key('login.signUp'),
                          onPressed: _submitting ? null : widget.onSignUp,
                          child: const Text('New here? Sign up'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
