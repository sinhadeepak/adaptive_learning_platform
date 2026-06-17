// Debug-only visual sanity screen for the Vidya foundation.
// Phase 1: not wired into user nav. Reach manually via a temporary
// route in main.dart during development.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../vidya/density_notifier.dart';
import '../vidya/persona_notifier.dart';
import '../vidya/theme_mode_notifier.dart';

class VidyaGalleryScreen extends StatefulWidget {
  final VidyaPersonaNotifier persona;
  final VidyaDensityNotifier density;
  final VidyaThemeModeNotifier themeMode;
  const VidyaGalleryScreen({
    super.key,
    required this.persona,
    required this.density,
    required this.themeMode,
  });

  @override
  State<VidyaGalleryScreen> createState() => _VidyaGalleryScreenState();
}

class _VidyaGalleryScreenState extends State<VidyaGalleryScreen> {
  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: const VidyaAppBar(title: 'Vidya gallery', serif: true),
      padding: EdgeInsets.all(v.density.cardP),
      body: ListView(
        children: [
          _section('Tokens · live', _tokensPreview(v)),
          _section('Controls', _controls()),
          _section(
            'Buttons',
            Row(
              children: [
                VidyaButton(label: 'Primary', onPressed: () {}),
                const SizedBox(width: 8),
                VidyaButton(
                    label: 'Secondary',
                    style: VidyaButtonStyle.secondary,
                    onPressed: () {}),
                const SizedBox(width: 8),
                VidyaButton(
                    label: 'Ghost',
                    style: VidyaButtonStyle.ghost,
                    onPressed: () {}),
              ],
            ),
          ),
          _section('TextField',
              const VidyaTextField(label: 'Email', hint: 'you@vidya.app')),
          _section(
              'Card · default',
              VidyaCard(
                  child: Text('Default card', style: VidyaText.body(v.ink)))),
          _section(
              'Card · dark',
              VidyaCard(
                  tone: VidyaCardTone.dark,
                  child: const Text('Dark card',
                      style: TextStyle(color: Colors.white)))),
          _section(
            'Chip',
            Row(
              children: [
                VidyaChip(label: 'NEET', selected: true, onTap: () {}),
                const SizedBox(width: 6),
                VidyaChip(label: 'JEE', onTap: () {}),
              ],
            ),
          ),
          _section(
            'Badge',
            Row(
              children: const [
                VidyaBadge(label: 'GOOD', tone: VidyaBadgeTone.good),
                SizedBox(width: 6),
                VidyaBadge(label: 'WARN', tone: VidyaBadgeTone.warn),
                SizedBox(width: 6),
                VidyaBadge(label: 'BAD', tone: VidyaBadgeTone.bad),
                SizedBox(width: 6),
                VidyaBadge(label: 'INFO', tone: VidyaBadgeTone.info),
              ],
            ),
          ),
          _section('Avatar', const VidyaAvatar(initials: 'AS')),
          _section(
              'Banner',
              const VidyaBanner(
                message: 'Offline · 4 days of practice cached',
                tone: VidyaBannerTone.warn,
              )),
          _section(
              'Tag',
              const VidyaTag(
                  label: 'Physics · Thermo',
                  subjectColor: Color(0xFF2F5D8C))),
          _section('AI tag', const VidyaAiTag(label: 'Recommended now')),
          _section(
              'Mastery',
              const VidyaMasteryBar(
                label: 'Kinematics',
                value: 0.85,
                bucket: VidyaMasteryBucket.mastered,
                pct: '85%',
              )),
          _section(
              'Sparkline',
              const SizedBox(
                width: 200,
                height: 40,
                child: VidyaSparkline(values: [1, 2, 4, 3, 5, 4, 6, 7]),
              )),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _section(String title, Widget child) {
    final v = VidyaThemeData.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.toUpperCase(), style: VidyaText.overline(v.ink3)),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }

  Widget _tokensPreview(VidyaThemeData v) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          _swatch('paper', v.paper, v.ink),
          _swatch('paper2', v.paper2, v.ink),
          _swatch('accent', v.accent, v.paper),
          _swatch('gold', v.gold, v.paper),
          _swatch('good', v.good, v.paper),
          _swatch('warn', v.warn, v.paper),
          _swatch('bad', v.bad, v.paper),
          _swatch('info', v.info, v.paper),
        ],
      );

  Widget _swatch(String name, Color bg, Color fg) => Container(
        width: 72,
        height: 36,
        color: bg,
        alignment: Alignment.center,
        child: Text(name,
            style: TextStyle(
                color: fg, fontFamily: VidyaFonts.mono, fontSize: 10)),
      );

  Widget _controls() => Wrap(
        spacing: 12,
        runSpacing: 8,
        children: [
          DropdownButton<ThemeMode>(
            value: widget.themeMode.mode,
            onChanged: (m) => m == null ? null : widget.themeMode.setMode(m),
            items: const [
              DropdownMenuItem(value: ThemeMode.light, child: Text('light')),
              DropdownMenuItem(value: ThemeMode.dark, child: Text('dark')),
              DropdownMenuItem(value: ThemeMode.system, child: Text('system')),
            ],
          ),
          DropdownButton<VidyaPersona>(
            value: widget.persona.persona,
            onChanged: (p) => p == null ? null : widget.persona.setPersona(p),
            items: VidyaPersona.values
                .map((p) =>
                    DropdownMenuItem(value: p, child: Text(p.name)))
                .toList(),
          ),
          DropdownButton<VidyaDensity>(
            value: widget.density.density,
            onChanged: (d) => d == null ? null : widget.density.setDensity(d),
            items: VidyaDensity.values
                .map((d) =>
                    DropdownMenuItem(value: d, child: Text(d.name)))
                .toList(),
          ),
        ],
      );
}
