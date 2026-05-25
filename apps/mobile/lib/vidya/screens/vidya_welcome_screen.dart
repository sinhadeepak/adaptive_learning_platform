// VidyaWelcomeScreen — first interactive screen after splash.
// Wordmark + EN/हि toggle in app bar; eyebrow + italic-accent
// headline + body in the hero; Get started + I already have an
// account in the CTA stack; terms text at the bottom. Skip remains
// available via top-right text button.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _langKey = 'vidya.lang';
const _storage = FlutterSecureStorage();

class VidyaWelcomeScreen extends StatefulWidget {
  final VoidCallback onGetStarted;
  final VoidCallback onSignIn;
  final VoidCallback onSkip;

  const VidyaWelcomeScreen({
    super.key,
    required this.onGetStarted,
    required this.onSignIn,
    required this.onSkip,
  });

  @override
  State<VidyaWelcomeScreen> createState() => _VidyaWelcomeScreenState();
}

class _VidyaWelcomeScreenState extends State<VidyaWelcomeScreen> {
  VidyaLang _lang = VidyaLang.en;

  @override
  void initState() {
    super.initState();
    _loadLang();
  }

  Future<void> _loadLang() async {
    final v = await _storage.read(key: _langKey);
    if (!mounted) return;
    setState(() => _lang = v == 'hi' ? VidyaLang.hi : VidyaLang.en);
  }

  Future<void> _setLang(VidyaLang l) async {
    setState(() => _lang = l);
    await _storage.write(
      key: _langKey,
      value: l == VidyaLang.hi ? 'hi' : 'en',
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: Padding(
          padding: const EdgeInsets.only(left: 16, top: 8, bottom: 8),
          child: RichText(
            key: const Key('vidya.welcome.wordmark'),
            text: TextSpan(
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: v.ink,
                height: 1,
              ),
              children: [
                const TextSpan(text: 'v'),
                TextSpan(
                  text: 'i',
                  style: TextStyle(
                    fontStyle: FontStyle.italic,
                    color: v.accent,
                  ),
                ),
                const TextSpan(text: 'dya'),
              ],
            ),
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
            child: VidyaLangToggle(
              key: const Key('vidya.welcome.lang'),
              value: _lang,
              onChanged: _setLang,
            ),
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 32),
                      Text(
                        'WELCOME TO VIDYA',
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 2,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text.rich(
                        TextSpan(
                          style: TextStyle(
                            fontFamily: VidyaFonts.display,
                            fontSize: 38,
                            fontWeight: FontWeight.w500,
                            color: v.ink,
                            height: 1.1,
                          ),
                          children: [
                            const TextSpan(text: "India's first "),
                            TextSpan(
                              text: 'adaptive',
                              style: TextStyle(
                                fontStyle: FontStyle.italic,
                                color: v.accent,
                              ),
                            ),
                            const TextSpan(text: ' exam tutor.'),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        "We don't teach you everything. We teach you what "
                        "you need, when you need it.",
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 15,
                          color: v.ink3,
                          height: 1.55,
                        ),
                      ),
                      const Spacer(),
                      VidyaButton(
                        key: const Key('vidya.welcome.getStarted'),
                        label: "Get started — it's free",
                        onPressed: widget.onGetStarted,
                        style: VidyaButtonStyle.primary,
                        size: VidyaButtonSize.lg,
                        fullWidth: true,
                      ),
                      const SizedBox(height: 8),
                      Center(
                        child: TextButton(
                          key: const Key('vidya.welcome.signIn'),
                          onPressed: widget.onSignIn,
                          child: const Text('I already have an account'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Center(
                        child: Text(
                          'By continuing you accept our terms',
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 11,
                            color: v.ink3,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
