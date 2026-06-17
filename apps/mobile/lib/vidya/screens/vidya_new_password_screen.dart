// VidyaNewPasswordScreen — set a new password using a reset token
// from the deep link (alp://reset?token=… or https://app.../reset?token=…).
// Mirrors Aurora's POST /auth/password/reset.
// Errors:
// - 410 → token expired/invalid
// - 422 → weak password
// - other → AuthException.message or generic.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaNewPasswordScreen extends StatefulWidget {
  final AuthClient auth;
  final String token;
  final VoidCallback onCompleted;

  const VidyaNewPasswordScreen({
    super.key,
    required this.auth,
    required this.token,
    required this.onCompleted,
  });

  @override
  State<VidyaNewPasswordScreen> createState() => _VidyaNewPasswordScreenState();
}

class _VidyaNewPasswordScreenState extends State<VidyaNewPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
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
      await widget.auth.resetPassword(
        token: widget.token,
        newPassword: _password.text,
      );
      widget.onCompleted();
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
                      'Set new password',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 30,
                        fontWeight: FontWeight.w500,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Use at least 12 characters. Mix letters, numbers, and symbols for a stronger password.',
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
                      key: const Key('vidya.newpw.password'),
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.newPassword],
                      decoration:
                          const InputDecoration(labelText: 'New password'),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Enter a password';
                        if (v.length < 12) return 'At least 12 characters';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('vidya.newpw.confirm'),
                      controller: _confirm,
                      obscureText: true,
                      decoration:
                          const InputDecoration(labelText: 'Confirm password'),
                      validator: (v) {
                        if (v != _password.text) {
                          return "Passwords don't match";
                        }
                        return null;
                      },
                    ),
                    const Spacer(),
                    VidyaButton(
                      key: const Key('vidya.newpw.submit'),
                      label: _submitting ? 'Updating…' : 'Update password',
                      onPressed: _submitting ? null : _submit,
                      disabled: _submitting,
                      size: VidyaButtonSize.lg,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },),
    );
  }
}
