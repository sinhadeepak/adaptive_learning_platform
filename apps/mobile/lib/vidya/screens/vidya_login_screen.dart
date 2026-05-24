// VidyaLoginScreen — email + password sign-in.
// Mirrors Aurora's login_screen.dart endpoint contract (POST /auth/login)
// but renders in the Vidya idiom. Error surfaces:
// - 401 → "Wrong email or password" (use AuthException.message)
// - 423 → "Account locked — try again later"
// - 429 → "Too many attempts — wait a minute and retry"
// - other → AuthException.message or a generic fallback.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaLoginScreen extends StatefulWidget {
  final AuthClient auth;
  final void Function(Session session) onLoggedIn;
  final VoidCallback onSignUp;
  final VoidCallback onForgotPassword;

  const VidyaLoginScreen({
    super.key,
    required this.auth,
    required this.onLoggedIn,
    required this.onSignUp,
    required this.onForgotPassword,
  });

  @override
  State<VidyaLoginScreen> createState() => _VidyaLoginScreenState();
}

class _VidyaLoginScreenState extends State<VidyaLoginScreen> {
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
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;

    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    Text(
                      'Welcome back',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 32,
                        fontWeight: FontWeight.w500,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Sign in to continue.',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: muted,
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_error != null) ...[
                      VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                      const SizedBox(height: 12),
                    ],
                    TextFormField(
                      key: const Key('vidya.login.email'),
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
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('vidya.login.password'),
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Password'),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'Enter your password' : null,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Checkbox(
                          value: _remember,
                          onChanged: (v) => setState(() => _remember = v ?? false),
                        ),
                        Text(
                          'Keep me signed in',
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 13,
                            color: muted,
                          ),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: _submitting ? null : widget.onForgotPassword,
                          child: const Text('Forgot password?'),
                        ),
                      ],
                    ),
                    const Spacer(),
                    VidyaButton(
                      key: const Key('vidya.login.submit'),
                      label: _submitting ? 'Signing in…' : 'Sign in',
                      onPressed: _submitting ? null : _submit,
                      disabled: _submitting,
                      size: VidyaButtonSize.lg,
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: TextButton(
                        onPressed: _submitting ? null : widget.onSignUp,
                        child: const Text("Don't have an account? Sign up"),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}

