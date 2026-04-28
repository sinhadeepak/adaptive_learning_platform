import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../auth/auth_client.dart';

/// Register screen — mobile parity of web-student/src/pages/Register.tsx (Pass 1 §2 wireframe).
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({
    super.key,
    required this.auth,
    required this.onRegistered,
    required this.onBackToLogin,
  });

  final AuthClient auth;
  final void Function(RegisterResult result, String email) onRegistered;
  final VoidCallback onBackToLogin;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _tos = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _password.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  int _strengthScore(String pw) {
    int s = 0;
    if (pw.length >= 12) s++;
    if (pw.length >= 16) s++;
    if (RegExp(r'[a-z]').hasMatch(pw) && RegExp(r'[A-Z]').hasMatch(pw)) s++;
    if (RegExp(r'\d').hasMatch(pw) && RegExp(r'[^A-Za-z0-9]').hasMatch(pw)) s++;
    return s.clamp(0, 4);
  }

  String _strengthLabel(int score) =>
      score <= 1 ? 'Weak' : score == 2 ? 'OK' : score == 3 ? 'Strong' : 'Excellent';

  Color _strengthColor(int idx, int score) {
    if (idx >= score) return AlpColors.surfaceTertiary;
    if (score <= 1) return AlpColors.dangerFg;
    if (score == 2) return AlpColors.warningFg;
    return AlpColors.successFg;
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_tos) {
      setState(() => _error = 'Please accept the Terms to continue.');
      return;
    }
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final result = await widget.auth.register(
        firstName: _firstName.text.trim(),
        lastName: _lastName.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
        phone: _phone.text.trim(),
      );
      widget.onRegistered(result, _email.text.trim());
    } on AuthException catch (e) {
      setState(() {
        if (e.statusCode == 409) {
          _error = 'Email is already registered. Try logging in instead.';
        } else if (e.statusCode == 429) {
          _error = 'Too many sign-up attempts. Please wait a moment.';
        } else {
          _error = e.message;
        }
      });
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final score = _strengthScore(_password.text);
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
                      Text('Create account', style: AlpTextStyles.pageTitle),
                      const SizedBox(height: AlpSpacing.s5),
                      if (_error != null) ...[
                        _ErrorBanner(message: _error!),
                        const SizedBox(height: AlpSpacing.s4),
                      ],
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              key: const Key('register.firstName'),
                              controller: _firstName,
                              decoration: const InputDecoration(labelText: 'First name'),
                              validator: (v) =>
                                  (v == null || v.isEmpty) ? 'Required' : null,
                            ),
                          ),
                          const SizedBox(width: AlpSpacing.s3),
                          Expanded(
                            child: TextFormField(
                              key: const Key('register.lastName'),
                              controller: _lastName,
                              decoration: const InputDecoration(labelText: 'Last name'),
                              validator: (v) =>
                                  (v == null || v.isEmpty) ? 'Required' : null,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AlpSpacing.s4),
                      TextFormField(
                        key: const Key('register.email'),
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
                        key: const Key('register.phone'),
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Phone (optional — for SMS OTP)',
                          hintText: '+91 ...',
                        ),
                      ),
                      const SizedBox(height: AlpSpacing.s4),
                      TextFormField(
                        key: const Key('register.password'),
                        controller: _password,
                        obscureText: true,
                        autofillHints: const [AutofillHints.newPassword],
                        decoration: const InputDecoration(
                          labelText: 'Password (min 12 characters)',
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Enter a password';
                          if (v.length < 12) return 'At least 12 characters';
                          return null;
                        },
                      ),
                      if (_password.text.isNotEmpty) ...[
                        const SizedBox(height: AlpSpacing.s2),
                        Row(
                          children: [
                            for (var i = 0; i < 4; i++) ...[
                              Expanded(
                                child: Container(
                                  height: 4,
                                  decoration: BoxDecoration(
                                    color: _strengthColor(i, score),
                                    borderRadius: BorderRadius.circular(AlpRadius.pill),
                                  ),
                                ),
                              ),
                              if (i < 3) const SizedBox(width: AlpSpacing.s1),
                            ],
                            const SizedBox(width: AlpSpacing.s2),
                            Text(_strengthLabel(score), style: AlpTextStyles.hint),
                          ],
                        ),
                      ],
                      const SizedBox(height: AlpSpacing.s3),
                      Row(
                        children: [
                          Checkbox(
                            value: _tos,
                            onChanged: (v) => setState(() => _tos = v ?? false),
                          ),
                          const Expanded(
                            child: Text(
                              'I agree to the Terms and Privacy.',
                              style: AlpTextStyles.body,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AlpSpacing.s4),
                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          key: const Key('register.submit'),
                          onPressed: _submitting ? null : _submit,
                          child: Text(_submitting ? 'Creating account…' : 'Create account'),
                        ),
                      ),
                      const SizedBox(height: AlpSpacing.s5),
                      Center(
                        child: TextButton(
                          onPressed: _submitting ? null : widget.onBackToLogin,
                          child: const Text('Have an account? Log in'),
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

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
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
            child: Text(
              message,
              style: AlpTextStyles.body.copyWith(color: AlpColors.dangerFg),
            ),
          ),
        ],
      ),
    );
  }
}
