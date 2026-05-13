// Help & Support — minimal but real. Three sections:
//   1. Email support  — a clearly-labeled "Email us" CTA. Tapping
//      copies the address to clipboard (avoids needing url_launcher
//      as a dependency just for a mailto link).
//   2. FAQ            — 3-4 hardcoded entries that cover the most
//      common student questions.
//   3. Report a bug   — opens an in-app feedback sheet that POSTs
//      to /profile/feedback (already wired on api_client).
//
// Replaces the placeholder snackbar that previously sat on the
// Profile → Help & Support row.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../widgets/alp_card.dart';

class HelpSupportScreen extends StatelessWidget {
  const HelpSupportScreen({super.key});

  static const _supportEmail = 'support@adaptivelearning.in';

  static const _faqs = <({String q, String a})>[
    (
      q: 'How does adaptive practice decide difficulty?',
      a: 'The IRT engine starts each topic at a moderate level and shifts harder or easier based on whether you got the last item right and how long it took. Five answers in, the system has a fairly stable estimate of where you stand.',
    ),
    (
      q: 'Why do I see "—" or empty stats sometimes?',
      a: "Some metrics need a minimum of 5–10 answered items before they show. Until then, we'd rather show nothing than misleading numbers. Finish a couple of practice rounds and the stats fill in.",
    ),
    (
      q: 'Can I switch exams later?',
      a: 'Yes — Profile → Target Exam lets you pick a different exam any time. Your existing mastery history stays attached to the old exam; the new one starts fresh.',
    ),
    (
      q: 'How is my data used?',
      a: 'Your answers + readiness feed only your own dashboard and (anonymized) cohort/peer aggregates. Identifiable data never leaves the platform without explicit opt-in. See our Privacy policy for the full list.',
    ),
    (
      q: 'I bought a course / tutor session and need a refund.',
      a: "Within 7 days of purchase, open the course on the Marketplace tab and tap 'Request refund'. Tutor sessions can be cancelled up to 1 hour before the session start; refunds process within 3-5 business days.",
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(title: const Text('Help & Support')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          // Email
          AlpCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.email_outlined,
                        color: AlpColors.colorAi, size: 22,),
                    SizedBox(width: 10),
                    Text('Email support',
                        style: TextStyle(
                            color: AlpColors.textPrimary,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,),),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'We respond within one business day. Include your registered email so we can find your account.',
                  style: TextStyle(
                      color: AlpColors.textSecondary,
                      fontSize: 12,
                      height: 1.4,),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(
                        const ClipboardData(text: _supportEmail),);
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        behavior: SnackBarBehavior.floating,
                        content: Text(
                            'Email address copied — paste into your email app.',),
                      ),
                    );
                  },
                  icon: const Icon(Icons.copy, size: 16),
                  label: const Text(_supportEmail),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AlpColors.textPrimary,
                    side: const BorderSide(color: AlpColors.borderDefault),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // FAQs
          const AlpSectionHeading('Frequently asked'),
          ..._faqs.map((f) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AlpCard(
                  padding: EdgeInsets.zero,
                  child: ExpansionTile(
                    iconColor: AlpColors.textMuted,
                    collapsedIconColor: AlpColors.textMuted,
                    title: Text(
                      f.q,
                      style: const TextStyle(
                          color: AlpColors.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,),
                    ),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          f.a,
                          style: const TextStyle(
                              color: AlpColors.textSecondary,
                              fontSize: 13,
                              height: 1.5,),
                        ),
                      ),
                    ],
                  ),
                ),
              ),),

          const SizedBox(height: 16),

          // Bug report — funnels to email since there's no general
          // feedback endpoint backend-side. Per-question feedback
          // already has its own surface inside the quiz flow.
          AlpCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.bug_report_outlined,
                        color: AlpColors.colorAmber, size: 22,),
                    SizedBox(width: 10),
                    Text('Report a bug',
                        style: TextStyle(
                            color: AlpColors.textPrimary,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,),),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Found something off? Send a screenshot + a quick description to our support email above. Per-question issues can be flagged inside the quiz directly.',
                  style: TextStyle(
                      color: AlpColors.textSecondary,
                      fontSize: 12,
                      height: 1.4,),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
