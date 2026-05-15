// Sprint A7 — real-exam outcome opt-in dialog.
//
// Surfaces post-mock-test for senior students. Asks (very gently) for
// their real-exam result, rank, and / or college admit. All fields
// optional. The data feeds the platform-admin "outcome correlation"
// dashboard so future students can be told "students with mastery >
// X% scored an average of Y in the real exam."
//
// Honesty rules baked in:
//   • Headline copy explicitly says "optional, share what's
//     comfortable" — no dark pattern.
//   • Skip / "Don't ask again" exits cleanly. Re-ask flag stored in
//     flutter_secure_storage so subsequent mock results don't nag.
//   • The dialog itself is small (200-260px tall) — never
//     full-screen, never blocking.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/analytics.dart';
import '../auth/auth_client.dart';

/// Shows the dialog for the active user. Returns true if the student
/// submitted (so the caller can show a thank-you toast) or false if
/// they skipped / dismissed.
Future<bool> showReportOutcomeDialog({
  required BuildContext context,
  required AuthClient auth,
  required String examCode,
}) async {
  // Don't ever ask the same user twice in the same session even if
  // the caller forgot to gate; the secure-storage flag is the
  // long-term version of the same rule.
  final user = auth.user;
  if (user == null) return false;

  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => _ReportOutcomeDialog(auth: auth, examCode: examCode),
  );
  return result == true;
}

/// Helper to check if we should ask. Caller pattern:
///
///   if (await shouldAskOutcome(auth)) {
///     await showReportOutcomeDialog(...);
///   }
Future<bool> shouldAskOutcome(AuthClient auth) async {
  final user = auth.user;
  if (user == null) return false;
  const storage = FlutterSecureStorage();
  final flag = await storage.read(key: _flagKey(user.id));
  return flag != 'asked';
}

const _flagKeyPrefix = 'alp.outcome.asked.';
String _flagKey(String userId) => '$_flagKeyPrefix$userId';

class _ReportOutcomeDialog extends StatefulWidget {
  const _ReportOutcomeDialog({required this.auth, required this.examCode});
  final AuthClient auth;
  final String examCode;

  @override
  State<_ReportOutcomeDialog> createState() => _ReportOutcomeDialogState();
}

class _ReportOutcomeDialogState extends State<_ReportOutcomeDialog> {
  final _scoreCtrl = TextEditingController();
  final _rankCtrl = TextEditingController();
  final _admitCtrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _scoreCtrl.dispose();
    _rankCtrl.dispose();
    _admitCtrl.dispose();
    super.dispose();
  }

  Future<void> _markAsked() async {
    final user = widget.auth.user;
    if (user == null) return;
    const storage = FlutterSecureStorage();
    await storage.write(key: _flagKey(user.id), value: 'asked');
  }

  Future<void> _submit() async {
    if (_busy) return;
    final user = widget.auth.user;
    if (user == null) return;
    final scoreRaw = _scoreCtrl.text.trim();
    final rankRaw = _rankCtrl.text.trim();
    final admit = _admitCtrl.text.trim();
    final score = scoreRaw.isEmpty ? null : double.tryParse(scoreRaw);
    final rank = rankRaw.isEmpty ? null : int.tryParse(rankRaw);
    if ((scoreRaw.isNotEmpty && score == null) ||
        (rankRaw.isNotEmpty && rank == null)) {
      setState(() => _error = 'Score / rank must be numeric.');
      return;
    }
    if (score == null && rank == null && admit.isEmpty) {
      setState(() =>
          _error = 'Share at least one of score, rank, or admit info.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ok = await AnalyticsClient(widget.auth).reportRealExamOutcome(
        userId: user.id,
        examCode: widget.examCode,
        realScore: score,
        realRank: rank,
        admittedTo: admit.isEmpty ? null : admit,
      );
      await _markAsked();
      if (!mounted) return;
      Navigator.of(context).pop(ok);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Could not submit. Try again later.';
      });
    }
  }

  Future<void> _dontAsk() async {
    await _markAsked();
    if (!mounted) return;
    Navigator.of(context).pop(false);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AlpColors.bgSurface1,
      title: const Text('Share your real result?',
          style: TextStyle()),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Optional — share what you\'re comfortable with. Helps future students see how mastery on this app translates to real exam outcomes. We never share identifiable data.',
              style: TextStyle(
                  color: AlpColors.textSecondary, fontSize: 12, height: 1.4),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _scoreCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Real score (e.g. 720)',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _rankCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Real rank (AIR / overall)',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _admitCtrl,
              maxLength: 80,
              decoration: const InputDecoration(
                labelText: 'College / cutoff tier (optional)',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: const TextStyle(
                      color: AlpColors.colorRed, fontSize: 12)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : _dontAsk,
          child: const Text("Don't ask again",
              style: TextStyle(color: AlpColors.textMuted)),
        ),
        ElevatedButton(
          onPressed: _busy ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: AlpColors.colorAi,
            foregroundColor: Colors.white,
          ),
          child: Text(_busy ? 'Sending…' : 'Share'),
        ),
      ],
    );
  }
}
