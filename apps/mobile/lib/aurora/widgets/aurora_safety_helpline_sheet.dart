// AuroraSafetyHelplineSheet — the bottom sheet that appears immediately
// after a self-harm trigger from [AuroraSafety.preflightInput] or from
// the server-side L1 classifier.
//
// Spec: docs/02-design/content-safety-policy.md §4
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.5.
//
// Design notes
// ────────────
// - Helpline data is bundled in `safety.dart` (not fetched) so the sheet
//   renders even when the network is unreachable.
// - Tap-to-call is wired via the injected [phoneLauncher] callback —
//   consumers pass `url_launcher`-backed launch on devices where it's
//   available; the default fallback copies the number to the clipboard
//   so the experience degrades gracefully.
// - The sheet is dismissable (we cannot legally trap a user) but it
//   pre-empts the AI surface — when this sheet is open, the underlying
//   chat / Lumi message is replaced by a calm holding state so the
//   user never sees the AI continue.
//
// Usage
// ─────
//   await showModalBottomSheet<void>(
//     context: ctx,
//     isScrollControlled: true,
//     isDismissible: true,
//     builder: (_) => const AuroraSafetyHelplineSheet(),
//   );

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../safety.dart';
import 'aurora_button.dart';
import 'aurora_snackbar.dart';

class AuroraSafetyHelplineSheet extends StatelessWidget {
  const AuroraSafetyHelplineSheet({
    super.key,
    this.country = 'IN',
    this.phoneLauncher,
    this.urlLauncher,
  });

  /// ISO 3166 alpha-2 of the user's country. Filters the helpline list
  /// to the relevant subset; the international directory always shows
  /// last as a fallback.
  final String country;

  /// Optional callback to launch a phone dialer with the given `tel:` URI.
  /// When null, taps copy the number to the clipboard + show a snackbar.
  final Future<bool> Function(String telUri)? phoneLauncher;

  /// Optional callback to launch an https URL. When null, taps copy
  /// the URL to the clipboard.
  final Future<bool> Function(String url)? urlLauncher;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final filtered = selfHarmHelplines
        .where((h) => h.country == country || h.country == 'XX')
        .toList();

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          16,
          24,
          16 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Drag-handle hairline + close affordance.
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: colors.neutral300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            // Empathetic headline — calm, not alarming, not patronising.
            Text(
              "It sounds like you're going through a tough time.",
              style: typography.h3.copyWith(color: colors.neutral900),
            ),
            const SizedBox(height: 8),
            Text(
              "You don't have to go through this alone. The lines below "
              'are free, confidential, and there to listen.',
              style: typography.body.copyWith(color: colors.neutral700),
            ),
            const SizedBox(height: 20),
            // Helpline rows.
            ...filtered.map(
              (h) => _HelplineRow(
                helpline: h,
                phoneLauncher: phoneLauncher,
                urlLauncher: urlLauncher,
              ),
            ),
            const SizedBox(height: 12),
            Divider(color: colors.neutral200, height: 1),
            const SizedBox(height: 16),
            // "I'm OK" affordance — doesn't unlock the AI session
            // (that happens via the 24-h cool-off path described in
            // policy §4), just closes the sheet.
            AuroraButton(
              label: "I'm OK for now",
              variant: AuroraButtonVariant.secondary,
              fullWidth: true,
              onPressed: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: 8),
            // Subtle reassurance — no analytics on this view; we
            // intentionally don't track who saw the sheet beyond the
            // session-level `event=safety_self_harm_triggered`.
            Text(
              "We won't share this conversation with anyone unless you "
              'ask us to.',
              style: typography.bodySm.copyWith(color: colors.neutral500),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _HelplineRow extends StatelessWidget {
  const _HelplineRow({
    required this.helpline,
    required this.phoneLauncher,
    required this.urlLauncher,
  });

  final SelfHarmHelpline helpline;
  final Future<bool> Function(String)? phoneLauncher;
  final Future<bool> Function(String)? urlLauncher;

  Future<void> _onCallTap(BuildContext context) async {
    final uri = helpline.phone;
    if (uri.isEmpty) return;
    if (phoneLauncher != null) {
      final launched = await phoneLauncher!(uri);
      if (launched) return;
    }
    // Fallback: copy the dial-able number to the clipboard so the
    // user can paste it into the phone app manually.
    final number = uri.replaceFirst('tel:', '');
    await Clipboard.setData(ClipboardData(text: number));
    if (!context.mounted) return;
    showAuroraSnackbar(
      context,
      message: 'Copied $number — open your phone app to call.',
    );
  }

  Future<void> _onUrlTap(BuildContext context) async {
    final url = helpline.url ?? helpline.whatsapp;
    if (url == null || url.isEmpty) return;
    if (urlLauncher != null) {
      final launched = await urlLauncher!(url);
      if (launched) return;
    }
    await Clipboard.setData(ClipboardData(text: url));
    if (!context.mounted) return;
    showAuroraSnackbar(context, message: 'Copied $url to clipboard.');
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final hasPhone = helpline.phone.isNotEmpty;
    final hasUrl = helpline.url != null || helpline.whatsapp != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.neutral100,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.neutral200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            helpline.name,
            style: typography.h4.copyWith(color: colors.neutral900),
          ),
          const SizedBox(height: 2),
          Text(
            helpline.hours,
            style: typography.bodySm.copyWith(color: colors.neutral500),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              if (hasPhone)
                Expanded(
                  child: AuroraButton(
                    label: 'Call',
                    size: AuroraButtonSize.sm,
                    onPressed: () => _onCallTap(context),
                  ),
                ),
              if (hasPhone && hasUrl) const SizedBox(width: 8),
              if (hasUrl)
                Expanded(
                  child: AuroraButton(
                    label: 'Open chat',
                    variant: AuroraButtonVariant.secondary,
                    size: AuroraButtonSize.sm,
                    onPressed: () => _onUrlTap(context),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
