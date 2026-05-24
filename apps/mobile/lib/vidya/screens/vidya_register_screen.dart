// VidyaRegisterScreen — create account.
// Mirrors Aurora's POST /auth/register; on success hands the
// (RegisterResult, email) tuple to the caller, which routes to
// VidyaVerifyScreen for OTP entry.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaRegisterScreen extends StatefulWidget {
  final AuthClient auth;
  final void Function(RegisterResult result, String email) onRegistered;
  final VoidCallback onBackToLogin;

  const VidyaRegisterScreen({
    super.key,
    required this.auth,
    required this.onRegistered,
    required this.onBackToLogin,
  });

  @override
  State<VidyaRegisterScreen> createState() => _VidyaRegisterScreenState();
}

class _VidyaRegisterScreenState extends State<VidyaRegisterScreen> {
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
    _password.addListener(() {
      if (mounted) setState(() {});
    });
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

  String _strengthLabel(int s) =>
      s <= 1 ? 'Weak' : s == 2 ? 'OK' : s == 3 ? 'Strong' : 'Excellent';

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
    final accent = theme.accent;
    final score = _strengthScore(_password.text);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: ink),
          onPressed: widget.onBackToLogin,
        ),
      ),
      body: LayoutBuilder(
        builder: (ctx, constraints) {
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
                      Text(
                        'Create account',
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 30,
                          fontWeight: FontWeight.w500,
                          color: ink,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Just a few details and we’re off.',
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 14,
                          color: muted,
                        ),
                      ),
                      const SizedBox(height: 20),
                      if (_error != null) ...[
                        VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                        const SizedBox(height: 12),
                      ],
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              key: const Key('vidya.register.firstName'),
                              controller: _firstName,
                              decoration: const InputDecoration(labelText: 'First name'),
                              validator: (v) =>
                                  (v == null || v.isEmpty) ? 'Required' : null,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              key: const Key('vidya.register.lastName'),
                              controller: _lastName,
                              decoration: const InputDecoration(labelText: 'Last name'),
                              validator: (v) =>
                                  (v == null || v.isEmpty) ? 'Required' : null,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        key: const Key('vidya.register.email'),
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
                        key: const Key('vidya.register.phone'),
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Phone (optional — for SMS OTP)',
                          hintText: '+91 …',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        key: const Key('vidya.register.password'),
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
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            for (var i = 0; i < 4; i++) ...[
                              Expanded(
                                child: Container(
                                  height: 4,
                                  decoration: BoxDecoration(
                                    color: i < score
                                        ? accent
                                        : muted.withValues(alpha: 0.3),
                                    borderRadius: BorderRadius.circular(2),
                                  ),
                                ),
                              ),
                              if (i < 3) const SizedBox(width: 4),
                            ],
                            const SizedBox(width: 8),
                            Text(
                              _strengthLabel(score),
                              style: TextStyle(
                                fontFamily: VidyaFonts.ui,
                                fontSize: 12,
                                color: muted,
                              ),
                            ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Checkbox(
                            value: _tos,
                            onChanged: (v) => setState(() => _tos = v ?? false),
                          ),
                          Expanded(
                            child: Text(
                              'I agree to the Terms and Privacy.',
                              style: TextStyle(
                                fontFamily: VidyaFonts.ui,
                                fontSize: 13,
                                color: ink,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const Spacer(),
                      VidyaButton(
                        key: const Key('vidya.register.submit'),
                        label: _submitting ? 'Creating account…' : 'Create account',
                        onPressed: _submitting ? null : _submit,
                        disabled: _submitting,
                        size: VidyaButtonSize.lg,
                      ),
                      const SizedBox(height: 8),
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
          );
        },
      ),
    );
  }
}
