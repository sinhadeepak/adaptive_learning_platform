// VidyaVerifyScreen — 6-digit OTP entry following registration.
// Mirrors Aurora's POST /auth/otp/verify contract; channel is "email"
// or "sms" — surfaces the destination in the subtitle so users know
// where to look for the code.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../auth/auth_client.dart';

class VidyaVerifyScreen extends StatefulWidget {
  final AuthClient auth;
  final String userId;
  final String email;
  final String channel; // 'email' | 'sms'
  final void Function(Session session) onVerified;
  final VoidCallback onBack;

  const VidyaVerifyScreen({
    super.key,
    required this.auth,
    required this.userId,
    required this.email,
    required this.channel,
    required this.onVerified,
    required this.onBack,
  });

  @override
  State<VidyaVerifyScreen> createState() => _VidyaVerifyScreenState();
}

class _VidyaVerifyScreenState extends State<VidyaVerifyScreen> {
  final List<TextEditingController> _cells =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes = List.generate(6, (_) => FocusNode());
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    for (final c in _cells) { c.dispose(); }
    for (final f in _focusNodes) { f.dispose(); }
    super.dispose();
  }

  String get _code => _cells.map((c) => c.text).join();

  Future<void> _maybeSubmit() async {
    if (_code.length != 6 || _submitting) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final session = await widget.auth.verifyOtp(
        userId: widget.userId,
        code: _code,
        channel: widget.channel,
      );
      widget.onVerified(session);
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
    final accent = theme.accent;
    final dest = widget.channel == 'sms' ? 'your phone' : widget.email;

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: ink),
          onPressed: widget.onBack,
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 24),
            Text(
              'Verify it’s you',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 30,
                fontWeight: FontWeight.w500,
                color: ink,
              ),
            ),
            const SizedBox(height: 8),
            Text.rich(
              TextSpan(
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 14,
                  color: muted,
                  height: 1.5,
                ),
                children: [
                  const TextSpan(text: 'We sent a 6-digit code to '),
                  TextSpan(
                    text: dest,
                    style: TextStyle(color: ink, fontWeight: FontWeight.w600),
                  ),
                  const TextSpan(text: '.'),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (_error != null) ...[
              VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
              const SizedBox(height: 12),
            ],
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(6, (i) {
                return SizedBox(
                  width: 44,
                  height: 56,
                  child: TextField(
                    key: Key('vidya.verify.cell$i'),
                    controller: _cells[i],
                    focusNode: _focusNodes[i],
                    autofocus: i == 0,
                    keyboardType: TextInputType.number,
                    maxLength: 1,
                    textAlign: TextAlign.center,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      color: ink,
                    ),
                    decoration: InputDecoration(
                      counterText: '',
                      enabledBorder: OutlineInputBorder(
                        borderSide: BorderSide(
                          color: muted.withValues(alpha: 0.4),
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: accent, width: 2),
                      ),
                    ),
                    onChanged: (v) {
                      if (v.isNotEmpty && i < 5) _focusNodes[i + 1].requestFocus();
                      if (v.isEmpty && i > 0) _focusNodes[i - 1].requestFocus();
                      setState(() {});
                      _maybeSubmit();
                    },
                  ),
                );
              }),
            ),
            const Spacer(),
            VidyaButton(
              label: _submitting ? 'Verifying…' : 'Verify',
              onPressed: _code.length == 6 && !_submitting ? _maybeSubmit : null,
              disabled: _code.length != 6 || _submitting,
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }
}
