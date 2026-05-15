import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../aurora/widgets/widgets.dart';
import 'package:flutter/material.dart';

import '../auth/auth_client.dart';
import '../widgets/alp_card.dart';

/// "Change password" — uses the existing forgot-password flow under the hood.
/// Auth doesn't yet expose a direct "current+new" change endpoint, so we
/// trigger the OTP-based reset for the signed-in user's email; they then
/// follow the link/OTP flow they already know from forgot-password.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, required this.auth});
  final AuthClient auth;

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  bool _sending = false;
  String? _success;
  String? _error;

  Future<void> _send() async {
    final email = widget.auth.user?.email;
    if (email == null) {
      setState(() => _error = 'Not signed in.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
      _success = null;
    });
    try {
      await widget.auth.forgotPassword(email: email);
      if (!mounted) return;
      setState(() {
        _success =
            "We've emailed a reset link to $email. Open the link on this device — it'll bring you back to set a new password.";
        _sending = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not send reset: $e';
        _sending = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = widget.auth.user?.email ?? '';
    return AuroraScaffold(
      appBar: AuroraAppBar(title: 'Change Password', backgroundColor: AlpColors.bgSurface1),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          AlpCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.lock_outline, color: AlpColors.colorAi, size: 32),
                const SizedBox(height: 12),
                const Text(
                  'Reset your password',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  "We'll email a secure reset link to $email. The link opens in this app — set a new password and you're done.",
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 13, height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_success != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AlpColors.colorGreen.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(8),
                border: const Border(left: BorderSide(color: AlpColors.colorGreen, width: 2)),
              ),
              child: Text(
                _success!,
                style: const TextStyle(color: AlpColors.colorGreen, fontSize: 12, height: 1.5),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(_error!, style: const TextStyle(color: AlpColors.colorRed)),
            ),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _sending ? null : _send,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: Text(
                _sending ? 'Sending…' : 'Send Reset Email',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
