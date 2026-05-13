import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../auth/auth_client.dart';

/// Mobile parity of web-student/src/pages/ForgotPassword.tsx — collects an
/// email and asks Auth to send a reset link. Auth is enumeration-safe (always
/// 204), so we always show the same confirmation regardless of whether the
/// email is on file.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({
    super.key,
    required this.auth,
    required this.onBackToLogin,
  });

  final AuthClient auth;
  final VoidCallback onBackToLogin;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
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
      if (mounted) setState(() => _submitted = true);
    } on AuthException catch (e) {
      if (mounted) {
        setState(() => _error = e.code == AuthErrorCode.rateLimited
            ? 'Too many attempts. Please wait a minute and retry.'
            : 'We couldn\'t send the reset link right now. Try again shortly.',);
      }
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
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBackToLogin,
        ),
        title: const Text('Reset password'),
      ),
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
                child: _submitted ? _confirmation() : _form(),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _confirmation() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Check your email', style: AlpTextStyles.pageTitle),
        const SizedBox(height: AlpSpacing.s3),
        Text(
          'If an account exists for ${_email.text.trim()}, '
          "we've sent a link to reset your password. The link expires in 30 minutes.",
          style: AlpTextStyles.body,
        ),
        const SizedBox(height: AlpSpacing.s5),
        SizedBox(
          height: 48,
          child: FilledButton(
            onPressed: widget.onBackToLogin,
            child: const Text('Back to log in'),
          ),
        ),
      ],
    );
  }

  Widget _form() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Forgot your password?', style: AlpTextStyles.pageTitle),
          const SizedBox(height: AlpSpacing.s2),
          Text(
            "Enter your email and we'll send you a link to reset it.",
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
            key: const Key('forgot.email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Email'),
            validator: (v) {
              if (v == null || v.isEmpty) return 'Enter your email';
              if (!v.contains('@')) return 'Enter a valid email';
              return null;
            },
            onFieldSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: AlpSpacing.s4),
          SizedBox(
            height: 48,
            child: FilledButton(
              key: const Key('forgot.submit'),
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Sending…' : 'Send reset link'),
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
    );
  }
}
