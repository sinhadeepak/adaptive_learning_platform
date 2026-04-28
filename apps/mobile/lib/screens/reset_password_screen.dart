import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../auth/auth_client.dart';

/// Consumes a reset token (typically delivered via deep-link) and sets a new
/// password. Mobile-side parity of web-student ResetPassword.tsx. The token
/// arrives via the constructor — when we add a deep-link handler in
/// Sprint 4 the bootstrap parses the URL and pushes this screen with it
/// pre-filled. For Sprint 3 it's wired only through manual paste / tests.
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({
    super.key,
    required this.auth,
    required this.token,
    required this.onResetCompleted,
    required this.onBackToLogin,
  });

  final AuthClient auth;
  final String token;
  final VoidCallback onResetCompleted;
  final VoidCallback onBackToLogin;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.auth.resetPassword(token: widget.token, newPassword: _password.text);
      if (mounted) widget.onResetCompleted();
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't reach the server. Check your connection.");
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.surfaceSecondary,
      appBar: AppBar(title: const Text('Set new password')),
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
                      Text('Set a new password', style: AlpTextStyles.pageTitle),
                      const SizedBox(height: AlpSpacing.s2),
                      Text(
                        'Pick a strong one — at least 8 characters with a digit.',
                        style: AlpTextStyles.body,
                      ),
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
                        key: const Key('reset.password'),
                        controller: _password,
                        obscureText: true,
                        autofillHints: const [AutofillHints.newPassword],
                        decoration: const InputDecoration(labelText: 'New password'),
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Enter a password';
                          if (v.length < 8) return 'Use at least 8 characters';
                          return null;
                        },
                      ),
                      const SizedBox(height: AlpSpacing.s4),
                      TextFormField(
                        key: const Key('reset.confirm'),
                        controller: _confirm,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: 'Confirm password'),
                        onFieldSubmitted: (_) => _submit(),
                        validator: (v) {
                          if (v != _password.text) return 'Passwords do not match';
                          return null;
                        },
                      ),
                      const SizedBox(height: AlpSpacing.s5),
                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          key: const Key('reset.submit'),
                          onPressed: _submitting ? null : _submit,
                          child: Text(_submitting ? 'Updating…' : 'Update password'),
                        ),
                      ),
                      const SizedBox(height: AlpSpacing.s3),
                      Center(
                        child: TextButton(
                          onPressed: _submitting ? null : widget.onBackToLogin,
                          child: const Text('Back to log in'),
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
