import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../aurora/widgets/widgets.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../widgets/alp_card.dart';

/// Mock test result — raw score + percentile + projected AIR + section
/// breakdown. Built on top of the existing rank-projection calibration so
/// the projected rank here is directly comparable to the dashboard rank.
class MockResultScreen extends StatelessWidget {
  const MockResultScreen({super.key, required this.result});
  final MockResult result;

  String _fmt(int n) {
    final s = n.toString();
    if (s.length <= 3) return s;
    final tail = s.substring(s.length - 3);
    return '${s.substring(0, s.length - 3).replaceAllMapped(RegExp(r'(\d)(?=(\d\d)+$)'), (m) => '${m[1]},')},$tail';
  }

  @override
  Widget build(BuildContext context) {
    if (result.error != null) {
      return AuroraScaffold(
        appBar: AuroraAppBar(title: 'Mock Result', backgroundColor: AlpColors.bgSurface1),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(result.message ?? 'Mock could not be scored', style: const TextStyle(color: AlpColors.colorRed)),
        ),
      );
    }

    final scorePct = result.maxMarks > 0 ? (result.rawScore / result.maxMarks * 100).round() : 0;
    final scoreTone = result.percentile >= 90
        ? AlpColors.colorGreen
        : result.percentile >= 60
            ? AlpColors.colorBlue
            : AlpColors.colorAmber;
    final confTone = result.confidence == 'high'
        ? AlpColors.colorGreen
        : result.confidence == 'medium'
            ? AlpColors.colorBlue
            : AlpColors.colorAmber;

    return AuroraScaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            const SizedBox(height: 12),
            // Trophy hero
            Center(
              child: Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [scoreTone, scoreTone.withValues(alpha: 0.6)],
                  ),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: scoreTone.withValues(alpha: 0.30),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Icon(Icons.emoji_events, color: Colors.white, size: 50),
              ),
            ),
            const SizedBox(height: 18),
            Center(
              child: Text(
                '${result.rawScore} / ${result.maxMarks}',
                style: TextStyle(
                  color: scoreTone,
                  fontSize: 56,
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Center(
              child: Text(
                '${result.examName} · $scorePct% raw · ${result.percentile.toStringAsFixed(1)} pctl',
                style: const TextStyle(fontSize: 14),
              ),
            ),

            const SizedBox(height: 20),

            // Predicted AIR card (the ARPU-anchor)
            AlpCard(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF1A1B3A), Color(0xFF24193A)],
              ),
              borderColor: AlpColors.colorPurple.withValues(alpha: 0.30),
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'PROJECTED ALL-INDIA RANK',
                    style: TextStyle(
                      color: AlpColors.textMuted,
                      fontSize: 11,
                      letterSpacing: 0.8,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '~${_fmt(result.projectedRank)}',
                    style: const TextStyle(
                      color: AlpColors.colorPurple,
                      fontSize: 38,
                      fontWeight: FontWeight.w700,
                      height: 1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'range ${_fmt(result.rankLow)} – ${_fmt(result.rankHigh)}',
                    style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(Icons.circle, size: 8, color: confTone),
                      const SizedBox(width: 4),
                      Text(
                        '${result.confidence} confidence',
                        style: TextStyle(color: confTone, fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '· based on this paper',
                        style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 3-stat grid
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.2,
              children: [
                _StatTile(value: result.nCorrect.toString(), label: 'Correct', tone: AlpColors.colorGreen),
                _StatTile(value: result.nWrong.toString(), label: 'Wrong', tone: AlpColors.colorRed),
                _StatTile(value: result.nUnanswered.toString(), label: 'Skipped', tone: AlpColors.textMuted),
              ],
            ),

            const SizedBox(height: 16),

            // Section breakdown
            const AuroraSectionHeading('Section Breakdown'),
            ...result.sections.map((s) => _SectionRow(section: s)),

            const SizedBox(height: 18),

            // Actions — primary CTA pops back so the student can re-plan a
            // fresh mock from Practice (the in-memory plan for this attempt
            // is gone; clicking would route through /adaptive/mock/plan again).
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text(
                  '↺ Take another mock',
                  style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                child: const Text(
                  '← Back to Home',
                  style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.value, required this.label, required this.tone});
  final String value;
  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AlpColors.bgSurface2,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AlpColors.borderDefault),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value, style: TextStyle(color: tone, fontSize: 22, fontWeight: FontWeight.w700, height: 1)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: AlpColors.textMuted, fontSize: 11)),
        ],
      ),
    );
  }
}

class _SectionRow extends StatelessWidget {
  const _SectionRow({required this.section});
  final MockSectionResult section;

  @override
  Widget build(BuildContext context) {
    final accuracy = section.total == 0 ? 0.0 : section.correct / section.total;
    final tone = accuracy >= 0.7
        ? AlpColors.colorGreen
        : accuracy >= 0.4
            ? AlpColors.colorBlue
            : AlpColors.colorRed;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AlpCard(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    section.name,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  '${section.correct} / ${section.total}',
                  style: TextStyle(color: tone, fontSize: 14, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                minHeight: 5,
                value: accuracy.clamp(0, 1),
                valueColor: AlwaysStoppedAnimation<Color>(tone),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '${section.wrong} wrong · ${section.unanswered} skipped',
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
