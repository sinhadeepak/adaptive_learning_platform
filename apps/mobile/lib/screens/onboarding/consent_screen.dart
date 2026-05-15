// ConsentScreen — DPDP-compliant onboarding consent capture.
//
// Spec: docs/02-design/redesign/onboarding-consent.md
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.5.
//
// Sits between Persona Select and Welcome in the onboarding flow.
// Captures:
//   1. DOB (month + year only — DD intentionally not collected; DPDP §6
//      data minimisation)
//   2. 3 required consent toggles (personal data processing, AI
//      assistance via Lumi, T&C + privacy policy)
//   3. 1 optional toggle (behavioural analytics — default OFF for Kid
//      persona, ON for everyone else, per content safety policy §7)
//   4. Parent OTP + parent declaration when DOB < 18 (DPDP §9 VPC)
//   5. Parent PAN-last-4 challenge (Kid persona only — additional
//      verifiable cross-reference)
//
// Server endpoints (per brief §7) are injected as callbacks so the
// widget remains testable + the screen ships before the backend lands.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../aurora/widgets/widgets.dart';

/// Snapshot of all consent state submitted by the user.
class ConsentSubmission {
  ConsentSubmission({
    required this.dobMonth,
    required this.dobYear,
    required this.consentPersonalData,
    required this.consentAi,
    required this.consentTerms,
    required this.consentAnalytics,
    this.parentEmail,
    this.parentOtpVerified = false,
    this.parentPanVerified = false,
  });

  final int dobMonth; // 1–12
  final int dobYear;  // 4-digit
  final bool consentPersonalData;
  final bool consentAi;
  final bool consentTerms;
  final bool consentAnalytics;

  /// Present only when the declared age is < 18.
  final String? parentEmail;
  final bool parentOtpVerified;

  /// Present only when the persona is Kid (additional cross-check).
  final bool parentPanVerified;

  /// Age in years on the day the form is submitted, based on the
  /// declared month + year. Day-of-month is assumed to be the 1st
  /// (the worst-case for a minor cutoff, biasing toward parent gate
  /// when in doubt).
  int ageYearsAt(DateTime now) {
    final dob = DateTime(dobYear, dobMonth);
    var years = now.year - dob.year;
    if (now.month < dob.month) years -= 1;
    return years;
  }

  Map<String, dynamic> toJson() => {
        'dob_month': dobMonth,
        'dob_year': dobYear,
        'toggles': {
          'personal_data': consentPersonalData,
          'ai': consentAi,
          'terms': consentTerms,
          'analytics': consentAnalytics,
        },
        if (parentEmail != null) 'parent_email': parentEmail,
        'parent_otp_verified': parentOtpVerified,
        'parent_pan_verified': parentPanVerified,
      };
}

/// Server-side calls the screen makes. Injected so tests + the
/// debug-only "Preview onboarding" flow can wire stubs that resolve
/// without hitting the network.
class ConsentApi {
  ConsentApi({
    required this.sendParentOtp,
    required this.verifyParentOtp,
    required this.verifyParentPan,
    required this.submit,
  });

  final Future<void> Function(String parentEmail) sendParentOtp;
  final Future<bool> Function(String parentEmail, String otp) verifyParentOtp;
  final Future<bool> Function(String parentEmail, String panLast4)
      verifyParentPan;
  final Future<void> Function(ConsentSubmission submission) submit;

  /// Debug-only stub that succeeds after a small delay. Useful for the
  /// "Preview onboarding flow" affordance in Preferences and tests.
  /// Not for production use.
  factory ConsentApi.debugStub() => ConsentApi(
        sendParentOtp: (email) async {
          await Future<void>.delayed(const Duration(milliseconds: 600));
          debugPrint('[ConsentApi stub] sendParentOtp -> $email');
        },
        verifyParentOtp: (email, otp) async {
          await Future<void>.delayed(const Duration(milliseconds: 400));
          debugPrint(
              '[ConsentApi stub] verifyParentOtp -> email=$email otp=$otp');
          // Stub passes any 6-digit code.
          return otp.length == 6 && int.tryParse(otp) != null;
        },
        verifyParentPan: (email, pan4) async {
          await Future<void>.delayed(const Duration(milliseconds: 400));
          debugPrint('[ConsentApi stub] verifyParentPan -> $email pan4=$pan4');
          return pan4.length == 4 && int.tryParse(pan4) != null;
        },
        submit: (submission) async {
          await Future<void>.delayed(const Duration(milliseconds: 500));
          debugPrint(
              '[ConsentApi stub] submit -> ${submission.toJson()}');
        },
      );
}

class ConsentScreen extends StatefulWidget {
  const ConsentScreen({
    super.key,
    required this.persona,
    required this.api,
    required this.onContinue,
  });

  /// Active persona drives whether the PAN challenge is required.
  /// Kid: required. Everyone else under 18: parent OTP only.
  final Persona persona;
  final ConsentApi api;

  /// Invoked after a successful [ConsentApi.submit].
  final VoidCallback onContinue;

  @override
  State<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends State<ConsentScreen> {
  // DOB capture (month + year only — DPDP §6 minimisation).
  int? _dobMonth;
  int? _dobYear;

  // Required toggles.
  bool _personalData = false;
  bool _ai = false;
  bool _terms = false;

  // Optional toggle — default depends on persona.
  late bool _analytics = widget.persona != Persona.kid;

  // Parent gate fields (only relevant when age < 18).
  final _parentEmailController = TextEditingController();
  final _otpController = TextEditingController();
  final _panController = TextEditingController();
  bool _otpSent = false;
  bool _otpVerified = false;
  bool _panVerified = false;
  bool _sendingOtp = false;
  bool _verifyingOtp = false;
  bool _verifyingPan = false;
  bool _parentDeclaration = false;

  bool _submitting = false;
  String? _serverError;

  bool get _dobOk => _dobMonth != null && _dobYear != null;

  int? get _age => _dobOk
      ? ConsentSubmission(
              dobMonth: _dobMonth!,
              dobYear: _dobYear!,
              consentPersonalData: false,
              consentAi: false,
              consentTerms: false,
              consentAnalytics: false,)
          .ageYearsAt(DateTime.now())
      : null;

  bool get _minor => (_age ?? 99) < 18;
  bool get _requirePan => widget.persona == Persona.kid && _minor;

  bool get _canSubmit {
    if (!_dobOk) return false;
    if (!(_personalData && _ai && _terms)) return false;
    if (_minor) {
      if (!_otpVerified) return false;
      if (!_parentDeclaration) return false;
      if (_requirePan && !_panVerified) return false;
    }
    return !_submitting;
  }

  Future<void> _sendOtp() async {
    final email = _parentEmailController.text.trim();
    if (email.isEmpty || !email.contains('@')) return;
    setState(() {
      _sendingOtp = true;
      _serverError = null;
    });
    try {
      await widget.api.sendParentOtp(email);
      if (!mounted) return;
      setState(() {
        _sendingOtp = false;
        _otpSent = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sendingOtp = false;
        _serverError = "Couldn't send OTP. Check the email and try again.";
      });
    }
  }

  Future<void> _verifyOtp() async {
    final email = _parentEmailController.text.trim();
    final otp = _otpController.text.trim();
    if (otp.length != 6) return;
    setState(() => _verifyingOtp = true);
    try {
      final ok = await widget.api.verifyParentOtp(email, otp);
      if (!mounted) return;
      setState(() {
        _verifyingOtp = false;
        _otpVerified = ok;
        if (!ok) {
          _serverError = "Couldn't verify that code — try again or resend.";
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _verifyingOtp = false;
        _serverError = 'Verification failed. Please try again.';
      });
    }
  }

  Future<void> _verifyPan() async {
    final email = _parentEmailController.text.trim();
    final pan = _panController.text.trim();
    if (pan.length != 4) return;
    setState(() => _verifyingPan = true);
    try {
      final ok = await widget.api.verifyParentPan(email, pan);
      if (!mounted) return;
      setState(() {
        _verifyingPan = false;
        _panVerified = ok;
        if (!ok) {
          _serverError =
              'Parent PAN verification failed. Contact help@alp.example if this seems wrong.';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _verifyingPan = false;
        _serverError = 'PAN verification failed. Please try again.';
      });
    }
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() {
      _submitting = true;
      _serverError = null;
    });
    final submission = ConsentSubmission(
      dobMonth: _dobMonth!,
      dobYear: _dobYear!,
      consentPersonalData: _personalData,
      consentAi: _ai,
      consentTerms: _terms,
      consentAnalytics: _analytics,
      parentEmail:
          _minor ? _parentEmailController.text.trim() : null,
      parentOtpVerified: _otpVerified,
      parentPanVerified: _panVerified,
    );
    try {
      await widget.api.submit(submission);
      if (!mounted) return;
      HapticFeedback.lightImpact();
      widget.onContinue();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _serverError = 'Submission failed. Please try again.';
      });
    }
  }

  @override
  void dispose() {
    _parentEmailController.dispose();
    _otpController.dispose();
    _panController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    return AuroraScaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Heading ─────────────────────────────────────────
              Text(
                'Before we start',
                style: typography.h2.copyWith(color: colors.neutral900),
              ),
              const SizedBox(height: 6),
              Text(
                "We need a few permissions to set up your experience.",
                style: typography.bodyLg.copyWith(color: colors.neutral500),
              ),
              const SizedBox(height: 24),
              // ── DOB ─────────────────────────────────────────────
              Text(
                'Date of birth',
                style: typography.h4.copyWith(color: colors.neutral900),
              ),
              Text(
                "We only ask for month and year so we know whether you're under 18.",
                style: typography.bodySm.copyWith(color: colors.neutral500),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      value: _dobMonth,
                      decoration: const InputDecoration(
                        labelText: 'Month',
                        border: OutlineInputBorder(),
                      ),
                      items: List.generate(12, (i) => i + 1)
                          .map((m) => DropdownMenuItem(
                                value: m,
                                child: Text(_monthName(m)),
                              ),)
                          .toList(),
                      onChanged: (v) => setState(() => _dobMonth = v),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      value: _dobYear,
                      decoration: const InputDecoration(
                        labelText: 'Year',
                        border: OutlineInputBorder(),
                      ),
                      items: List.generate(
                              80, (i) => DateTime.now().year - i,)
                          .map((y) => DropdownMenuItem(
                                value: y,
                                child: Text('$y'),
                              ),)
                          .toList(),
                      onChanged: (v) => setState(() => _dobYear = v),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              // ── Consent toggles ─────────────────────────────────
              _Toggle(
                label: 'I agree to ALP processing my name, email, exam '
                    'preferences, and learning activity to run the app.',
                required_: true,
                value: _personalData,
                onChanged: (v) => setState(() => _personalData = v),
              ),
              _Toggle(
                label: 'I agree to Lumi, our AI companion, generating '
                    'responses based on my questions.',
                helper: 'Read content safety policy ›',
                required_: true,
                value: _ai,
                onChanged: (v) => setState(() => _ai = v),
              ),
              _Toggle(
                label: 'I have read the Terms of Use and Privacy Policy.',
                required_: true,
                value: _terms,
                onChanged: (v) => setState(() => _terms = v),
              ),
              _Toggle(
                label: 'Help us improve ALP by sharing anonymous usage '
                    'analytics.',
                required_: false,
                value: _analytics,
                onChanged: (v) => setState(() => _analytics = v),
              ),
              // ── Parent gate (DOB < 18) ──────────────────────────
              if (_minor) ...[
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: colors.developing50,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: colors.developing500),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "You're under 18",
                        style: typography.h4
                            .copyWith(color: colors.neutral900),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'We need your parent or guardian to approve. Enter their email:',
                        style: typography.body
                            .copyWith(color: colors.neutral700),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _parentEmailController,
                        decoration: const InputDecoration(
                          labelText: 'Parent / guardian email',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.emailAddress,
                        enabled: !_otpVerified,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: AuroraButton(
                              label: _otpSent ? 'Resend OTP' : 'Send OTP',
                              loading: _sendingOtp,
                              variant: AuroraButtonVariant.secondary,
                              onPressed:
                                  _otpVerified ? null : _sendOtp,
                            ),
                          ),
                        ],
                      ),
                      if (_otpSent) ...[
                        const SizedBox(height: 12),
                        TextField(
                          controller: _otpController,
                          decoration: const InputDecoration(
                            labelText: '6-digit OTP',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          maxLength: 6,
                          enabled: !_otpVerified,
                          onChanged: (v) {
                            if (v.length == 6 && !_otpVerified) {
                              _verifyOtp();
                            }
                          },
                        ),
                        if (_verifyingOtp)
                          const Padding(
                            padding: EdgeInsets.only(top: 4),
                            child: LinearProgressIndicator(),
                          ),
                        if (_otpVerified)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              '✓ Parent OTP verified',
                              style: typography.bodySm
                                  .copyWith(color: colors.success600),
                            ),
                          ),
                      ],
                      if (_requirePan && _otpVerified) ...[
                        const SizedBox(height: 16),
                        Text(
                          'Last 4 digits of parent PAN',
                          style: typography.h4
                              .copyWith(color: colors.neutral900),
                        ),
                        Text(
                          "Cross-checks against the PAN we'll keep on file. Kid-mode only.",
                          style: typography.bodySm
                              .copyWith(color: colors.neutral500),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _panController,
                          decoration: const InputDecoration(
                            labelText: 'PAN last 4',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          maxLength: 4,
                          enabled: !_panVerified,
                          onChanged: (v) {
                            if (v.length == 4 && !_panVerified) {
                              _verifyPan();
                            }
                          },
                        ),
                        if (_verifyingPan)
                          const Padding(
                            padding: EdgeInsets.only(top: 4),
                            child: LinearProgressIndicator(),
                          ),
                        if (_panVerified)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              '✓ Parent PAN verified',
                              style: typography.bodySm
                                  .copyWith(color: colors.success600),
                            ),
                          ),
                      ],
                      if (_otpVerified) ...[
                        const SizedBox(height: 12),
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          value: _parentDeclaration,
                          onChanged: (v) => setState(
                              () => _parentDeclaration = v ?? false,),
                          title: Text(
                            'I am the parent or legal guardian of this child '
                            'and I consent to their use of ALP under the '
                            'linked Privacy Policy.',
                            style: typography.bodySm
                                .copyWith(color: colors.neutral700),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
              // ── Errors ──────────────────────────────────────────
              if (_serverError != null) ...[
                const SizedBox(height: 12),
                Text(
                  _serverError!,
                  style:
                      typography.bodySm.copyWith(color: colors.danger600),
                ),
              ],
              const SizedBox(height: 24),
              // ── Submit ──────────────────────────────────────────
              AuroraButton(
                label: 'I agree, continue',
                size: AuroraButtonSize.lg,
                fullWidth: true,
                loading: _submitting,
                onPressed: _canSubmit ? _submit : null,
              ),
              const SizedBox(height: 6),
              if (!_canSubmit)
                Center(
                  child: Text(
                    'Complete the items above to continue',
                    style: typography.bodySm
                        .copyWith(color: colors.neutral500),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  static String _monthName(int m) => const [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ][m - 1];
}

class _Toggle extends StatelessWidget {
  const _Toggle({
    required this.label,
    required this.required_,
    required this.value,
    required this.onChanged,
    this.helper,
  });

  final String label;
  final bool required_;
  final bool value;
  final ValueChanged<bool> onChanged;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Switch(
            value: value,
            onChanged: onChanged,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 10),
                Text(
                  label,
                  style: typography.body
                      .copyWith(color: colors.neutral900, height: 1.35),
                ),
                if (helper != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      helper!,
                      style: typography.bodySm.copyWith(
                        color: colors.brand600,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                if (required_)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      'Required',
                      style: typography.overline
                          .copyWith(color: colors.neutral500),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
