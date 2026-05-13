// About screen — version, build, licenses, and links to ToS / Privacy.
//
// Uses Flutter's built-in showLicensePage for the open-source license
// list (no extra dep needed). Version is read from a constant kept in
// sync with pubspec.yaml; future sprint can wire package_info_plus
// for runtime version lookup if pubspec drift becomes a concern.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../widgets/alp_card.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  // Keep in sync with apps/mobile/pubspec.yaml `version:` field.
  // The hardcoding is intentional for v1 — a future sprint adds
  // package_info_plus + flips this to a runtime read.
  static const _appVersion = '0.1.0';
  static const _buildName = 'sprint-3';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(title: const Text('About')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        children: [
          Center(
            child: Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AlpColors.colorBlue, Color(0xFF7B68EE)],
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(Icons.bolt_rounded,
                  color: Colors.white, size: 44,),
            ),
          ),
          const SizedBox(height: 16),
          const Center(
            child: Text(
              'Adaptive Learning Platform',
              style: TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,),
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              'v$_appVersion · $_buildName',
              style: const TextStyle(
                  color: AlpColors.textMuted, fontSize: 12,),
            ),
          ),
          const SizedBox(height: 28),

          AlpCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _AboutRow(
                  icon: Icons.description_outlined,
                  title: 'Terms of Service',
                  onTap: () =>
                      _copyAndToast(context, 'https://adaptivelearning.in/terms'),
                ),
                const Divider(
                    height: 1,
                    color: AlpColors.borderDefault,
                    indent: 56,
                    endIndent: 16,),
                _AboutRow(
                  icon: Icons.privacy_tip_outlined,
                  title: 'Privacy policy',
                  onTap: () => _copyAndToast(
                      context, 'https://adaptivelearning.in/privacy',),
                ),
                const Divider(
                    height: 1,
                    color: AlpColors.borderDefault,
                    indent: 56,
                    endIndent: 16,),
                _AboutRow(
                  icon: Icons.code,
                  title: 'Open-source licenses',
                  onTap: () => showLicensePage(
                    context: context,
                    applicationName: 'Adaptive Learning Platform',
                    applicationVersion: 'v$_appVersion',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Center(
            child: Text(
              'Made for India · supports en + hi',
              style:
                  TextStyle(color: AlpColors.textMuted, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  void _copyAndToast(BuildContext context, String url) {
    Clipboard.setData(ClipboardData(text: url));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        content: Text('Link copied — paste into your browser:\n$url'),
      ),
    );
  }
}

class _AboutRow extends StatelessWidget {
  const _AboutRow({
    required this.icon,
    required this.title,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AlpColors.colorAi, size: 20),
      title: Text(title,
          style: const TextStyle(
              color: AlpColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w500,),),
      trailing: const Icon(Icons.chevron_right,
          color: AlpColors.textMuted, size: 18,),
      onTap: onTap,
    );
  }
}
