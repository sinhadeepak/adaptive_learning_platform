// VidyaForgotPasswordScreen — request password reset email.
// Mirrors Aurora's POST /auth/password/forgot; the server is
// enumeration-safe (204 regardless of email existence) so the UI
// always shows the same "check your inbox" confirmation. 429 is the
// only differentiated case (rate limit).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaForgotPasswordScreen extends StatefulWidget {
  final AuthClient auth;
  final VoidCallback onBackToLogin;

  const VidyaForgotPasswordScreen({
    super.key,
    required this.auth,
    required this.onBackToLogin,
  });

  @override
  State<VidyaForgotPasswordScreen> createState() =>
      _VidyaForgotPasswordScreenState();
}

class _VidyaForgotPasswordScreenState
    extends State<VidyaForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _submitting = false;
  bool _submitted = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.auth.forgotPassword(email: _email.text.trim());
      setState(() => _submitted = true);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(
        () => _error = "We couldn't reach the server. Check your connection.",
      );
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
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: ink),
          onPressed: widget.onBackToLogin,
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: _submitted
            ? _ConfirmationBody(
                email: _email.text.trim(),
                onBack: widget.onBackToLogin,
              )
            : Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    Text(
                      'Reset your password',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 30,
                        fontWeight: FontWeight.w500,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Enter the email you signed up with — we'll send a reset link.",
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: muted,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_error != null) ...[
                      VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                      const SizedBox(height: 12),
                    ],
                    TextFormField(
                      key: const Key('vidya.forgot.email'),
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
                    const Spacer(),
                    VidyaButton(
                      key: const Key('vidya.forgot.submit'),
                      label: _submitting ? 'Sending…' : 'Send reset link',
                      onPressed: _submitting ? null : _submit,
                      disabled: _submitting,
                      size: VidyaButtonSize.lg,
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: TextButton(
                        onPressed: widget.onBackToLogin,
                        child: const Text('Back to login'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _ConfirmationBody extends StatelessWidget {
  final String email;
  final VoidCallback onBack;

  const _ConfirmationBody({required this.email, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Text(
          'Almost there',
          style: TextStyle(
            fontFamily: VidyaFonts.display,
            fontSize: 30,
            fontWeight: FontWeight.w500,
            color: ink,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'If $email is registered, check your inbox for a reset link. Links expire in 1 hour.',
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 14,
            color: muted,
            height: 1.5,
          ),
        ),
        const Spacer(),
        VidyaButton(
          label: 'Back to login',
          onPressed: onBack,
          size: VidyaButtonSize.lg,
        ),
      ],
    );
  }
}
