// VidyaHomeScreen — Phase 3a stub. Renders a single welcome card; the
// full slide-7 content (READINESS card, NEXT SESSION, stats, TODAY
// checklist) lands in Phase 3a.1 once this routing change has bedded
// in. Greeting pulls firstName from the AuthClient if available.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaHomeScreen extends StatelessWidget {
  final AuthClient auth;
  const VidyaHomeScreen({super.key, required this.auth});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final firstName = auth.user?.firstName ?? 'there';
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        Text(
          'WELCOME TO VIDYA',
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Hi, $firstName.',
          style: TextStyle(
            fontFamily: VidyaFonts.display,
            fontSize: 32,
            fontWeight: FontWeight.w500,
            color: v.ink,
            height: 1.1,
          ),
        ),
        const SizedBox(height: 16),
        VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'COMING IN PHASE 3a.1',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 10,
                    color: v.ink3,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  "Your full Home view — readiness, next session, "
                  "today's checklist — lands in the next phase.",
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 14,
                    color: v.ink2,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
