import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../auth/auth_client.dart';

/// Login screen — mobile parity of web-student/src/pages/Login.tsx (Pass 1 §1 wireframe).
/// Uses alp_design_tokens for brand parity and AuthClient for the live API call.
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

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _error = null;
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
    return Scaffold(
      backgroundColor: AlpColors.surfaceSecondary,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AlpSpacing.s4),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Container(
                padding: const EdgeInsets.all(AlpSpacing.s6),
                decoration: BoxDecoration(
                  color: AlpColors.surfacePrimary,
                  borderRadius: BorderRadius.circular(AlpRadius.card),
                  border: Border.all(color: AlpColors.borderDefault),
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('Log in', style: AlpTextStyles.pageTitle),
                      const SizedBox(height: AlpSpacing.s2),
                      Text('Welcome back, learner.', style: AlpTextStyles.body),
                      const SizedBox(height: AlpSpacing.s5),
                      if (_error != null) ...[
                        Container(
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
                                child: Text(
                                  _error!,
                                  style: AlpTextStyles.body.copyWith(color: AlpColors.dangerFg),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: AlpSpacing.s4),
                      ],
                      TextFormField(
                        key: const Key('login.email'),
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        decoration: const InputDecoration(labelText: 'Email'),
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Enter your email';
                          if (!v.contains('@')) return 'Enter a valid email';
                          return null;
                        },
                      ),
                      const SizedBox(height: AlpSpacing.s4),
                      TextFormField(
                        key: const Key('login.password'),
                        controller: _password,
                        obscureText: true,
                        autofillHints: const [AutofillHints.password],
                        decoration: const InputDecoration(labelText: 'Password'),
                        onFieldSubmitted: (_) => _submit(),
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Enter your password';
                          return null;
                        },
                      ),
                      const SizedBox(height: AlpSpacing.s3),
                      Row(
                        children: [
                          Checkbox(
                            value: _remember,
                            onChanged: (v) => setState(() => _remember = v ?? false),
                          ),
                          const Text('Remember me'),
                          const Spacer(),
                          TextButton(
                            key: const Key('login.forgot'),
                            onPressed:
                                _submitting ? null : widget.onForgotPassword,
                            child: const Text('Forgot?'),
                          ),
                        ],
                      ),
                      const SizedBox(height: AlpSpacing.s4),
                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          key: const Key('login.submit'),
                          onPressed: _submitting ? null : _submit,
                          child: Text(_submitting ? 'Logging in…' : 'Log in'),
                        ),
                      ),
                      const SizedBox(height: AlpSpacing.s5),
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
          ),
        ),
      ),
    );
  }
}
