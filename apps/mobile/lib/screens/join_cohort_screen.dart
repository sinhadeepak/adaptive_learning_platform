// Sprint 12 S12-C — mobile cohort-invite landing.
//
// Reachable from the deep-link parser (parseDeepLink → joinCohort). The
// student lands here with the URL token, confirms, and we POST the claim.
// On success we pop back to the main scaffold so they see the
// Assignments entry already populated.

import 'dart:convert';

import 'package:flutter/material.dart';
import '../aurora/widgets/widgets.dart';

import '../auth/auth_client.dart';

class JoinCohortScreen extends StatefulWidget {
  const JoinCohortScreen({
    super.key,
    required this.auth,
    required this.token,
    required this.userId,
  });

  final AuthClient auth;
  final String token;
  final String userId;

  @override
  State<JoinCohortScreen> createState() => _JoinCohortScreenState();
}

class _JoinCohortScreenState extends State<JoinCohortScreen> {
  bool _claiming = false;
  bool _joined = false;
  String? _error;
  String? _cohortId;

  Future<void> _claim() async {
    setState(() {
      _claiming = true;
      _error = null;
    });
    try {
      final r = await widget.auth.apiPost(
        '/institution/cohorts/invites/${Uri.encodeComponent(widget.token)}/claim',
        {'userId': widget.userId},
      );
      if (r.statusCode != 200) {
        // 410 → expired/invalid/exhausted — the claim endpoint already
        // distinguishes via the detail.code; we surface the message.
        try {
          final body = jsonDecode(r.body) as Map<String, dynamic>;
          final detail = body['detail'] as Map<String, dynamic>?;
          throw Exception(detail?['message'] ?? 'Could not redeem invite');
        } catch (_) {
          throw Exception('Could not redeem invite (${r.statusCode})');
        }
      }
      final body = jsonDecode(r.body) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _joined = true;
        _cohortId = body['cohortId'] as String?;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuroraScaffold(
      appBar: AuroraAppBar(title: 'Join Cohort'),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _joined
            ? _success()
            : _error != null
                ? _retry()
                : _confirm(),
      ),
    );
  }

  Widget _confirm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Join your class',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),),
        const SizedBox(height: 12),
        const Text(
            'Your educator has invited you to join their class on the platform. '
            'Tap to confirm — your assignments will appear right after.'),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _claiming ? null : _claim,
            child: Text(_claiming ? 'Joining…' : 'Join cohort'),
          ),
        ),
      ],
    );
  }

  Widget _success() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text("You're in!",
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),),
        const SizedBox(height: 8),
        const Text('Head to Profile → Assignments to see what your educator has posted.'),
        if (_cohortId != null) ...[
          const SizedBox(height: 8),
          Text('Cohort ${_cohortId!.substring(0, 8)}…',
              style: const TextStyle(color: Colors.black54, fontSize: 12),),
        ],
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Continue'),
          ),
        ),
      ],
    );
  }

  Widget _retry() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.red.shade50,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(_error ?? 'Could not redeem invite',
              style: TextStyle(color: Colors.red.shade900),),
        ),
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: () => setState(() => _error = null),
          child: const Text('Try again'),
        ),
      ],
    );
  }
}
