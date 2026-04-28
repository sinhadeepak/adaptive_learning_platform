import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../auth/auth_client.dart';

/// Verify screen — mobile parity of web-student/src/pages/Verify.tsx (Pass 1 §3 wireframe).
/// Six independent digit cells with auto-advance, backspace-back, paste-to-fill, resend cooldown.
class VerifyScreen extends StatefulWidget {
  const VerifyScreen({
    super.key,
    required this.auth,
    required this.userId,
    required this.email,
    required this.onVerified,
    required this.onBack,
  });

  final AuthClient auth;
  final String userId;
  final String email;
  final void Function(Session session) onVerified;
  final VoidCallback onBack;

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  static const _resendCooldownSeconds = 60;

  final List<TextEditingController> _controllers =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focus = List.generate(6, (_) => FocusNode());

  bool _submitting = false;
  String? _error;
  int _resendIn = 0;
  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus[0].requestFocus();
    });
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focus) {
      f.dispose();
    }
    super.dispose();
  }

  String get _code => _controllers.map((c) => c.text).join();

  void _onChanged(int i, String v) {
    if (v.length > 1) {
      // Paste — split across remaining cells.
      final digits = v.replaceAll(RegExp(r'\D'), '');
      for (var j = 0; j < digits.length && i + j < 6; j++) {
        _controllers[i + j].text = digits[j];
      }
      final lastFilled = (i + digits.length - 1).clamp(0, 5);
      final next = (lastFilled + 1).clamp(0, 5);
      _focus[next].requestFocus();
    } else if (v.isNotEmpty && i < 5) {
      _focus[i + 1].requestFocus();
    }
    setState(() {});
  }

  KeyEventResult _onKey(int i, KeyEvent ev) {
    if (ev is KeyDownEvent &&
        ev.logicalKey == LogicalKeyboardKey.backspace &&
        _controllers[i].text.isEmpty &&
        i > 0) {
      _controllers[i - 1].text = '';
      _focus[i - 1].requestFocus();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  void _startResendCooldown() {
    setState(() => _resendIn = _resendCooldownSeconds);
    _resendTimer?.cancel();
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() {
        if (_resendIn > 0) _resendIn--;
        if (_resendIn == 0) t.cancel();
      });
    });
  }

  Future<void> _submit() async {
    if (_code.length != 6) {
      setState(() => _error = 'Enter all 6 digits.');
      return;
    }
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final session = await widget.auth.verifyOtp(
        userId: widget.userId,
        code: _code,
        channel: 'email',
      );
      widget.onVerified(session);
    } on AuthException catch (e) {
      setState(() {
        if (e.statusCode == 410) {
          _error = 'This code has expired. Send a new one.';
        } else if (e.statusCode == 400) {
          _error = 'Incorrect code — try again.';
        } else {
          _error = e.message;
        }
        for (final c in _controllers) {
          c.text = '';
        }
        _focus[0].requestFocus();
      });
    } catch (_) {
      setState(() => _error = "We couldn't verify the code. Try again.");
    } finally {
      if (mounted) setState(() => _submitting = false);
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextButton(
                      onPressed: _submitting ? null : widget.onBack,
                      style: TextButton.styleFrom(
                        alignment: Alignment.centerLeft,
                        padding: EdgeInsets.zero,
                      ),
                      child: const Text('‹ Back'),
                    ),
                    const SizedBox(height: AlpSpacing.s2),
                    Text('Verify your email', style: AlpTextStyles.pageTitle),
                    const SizedBox(height: AlpSpacing.s2),
                    Text(
                      'We sent a 6-digit code to ${widget.email}.',
                      style: AlpTextStyles.body,
                    ),
                    const SizedBox(height: AlpSpacing.s5),
                    if (_error != null) ...[
                      _ErrorBanner(message: _error!),
                      const SizedBox(height: AlpSpacing.s4),
                    ],
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        for (var i = 0; i < 6; i++)
                          SizedBox(
                            width: 44,
                            height: 56,
                            child: KeyboardListener(
                              focusNode: FocusNode(),
                              onKeyEvent: (ev) => _onKey(i, ev),
                              child: TextField(
                                key: Key('verify.cell.$i'),
                                controller: _controllers[i],
                                focusNode: _focus[i],
                                keyboardType: TextInputType.number,
                                maxLength: 1,
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 24),
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly,
                                ],
                                decoration: const InputDecoration(
                                  counterText: '',
                                ),
                                onChanged: (v) => _onChanged(i, v),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: AlpSpacing.s4),
                    Center(
                      child: _resendIn > 0
                          ? Text(
                              "Didn't get it? Resend in ${_resendIn}s",
                              style: AlpTextStyles.hint,
                            )
                          : TextButton(
                              key: const Key('verify.resend'),
                              onPressed: _submitting
                                  ? null
                                  : () async {
                                      try {
                                        // best-effort — uses raw HTTP via auth client surfaces
                                        // (not exposed yet; simplest: just start cooldown).
                                        // Sprint 1 day-15 follow-up: add resendOtp to AuthClient.
                                        _startResendCooldown();
                                      } catch (_) {/* ignore */}
                                    },
                              child: const Text("Didn't get it? Resend"),
                            ),
                    ),
                    const SizedBox(height: AlpSpacing.s4),
                    SizedBox(
                      height: 48,
                      child: FilledButton(
                        key: const Key('verify.submit'),
                        onPressed: _submitting ? null : _submit,
                        child: Text(_submitting ? 'Verifying…' : 'Verify'),
                      ),
                    ),
                  ],
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
