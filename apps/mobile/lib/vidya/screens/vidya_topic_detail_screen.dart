// VidyaTopicDetailScreen — Phase 3b.full v2. Reached via Navigator.push
// from VidyaSubjectDetailScreen. Stateless — caller passes the Topic
// object + EWA so no fetches happen here. Concept tree / prerequisite
// map / common pitfalls are deferred to Phase 3b.full v3.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';

class VidyaTopicDetailScreen extends StatelessWidget {
  final Topic topic;
  final double ewa;
  const VidyaTopicDetailScreen({
    super.key,
    required this.topic,
    required this.ewa,
  });

  String _bucketLabel() {
    if (ewa >= 0.70) return 'STRONG';
    if (ewa >= 0.40) return 'DEVELOPING';
    if (ewa > 0) return 'WEAK';
    return 'NOT STARTED';
  }

  Color _bucketColor(VidyaThemeData v) {
    if (ewa >= 0.70) return v.good;
    if (ewa >= 0.40) return v.info;
    if (ewa > 0) return v.bad;
    return v.ink3;
  }

  void _onPracticeTap(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Topic-targeted practice for ${topic.title} is coming in '
          'Phase 3c.full.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final dot = _bucketColor(v);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: topic.title,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: dot,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${_bucketLabel()} • ${ewa.toStringAsFixed(2)}',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: v.ink3,
                  letterSpacing: 1.4,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            topic.title,
            style: TextStyle(
              fontFamily: VidyaFonts.display,
              fontSize: 32,
              fontWeight: FontWeight.w500,
              color: v.ink,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${topic.questionCount} questions in this topic',
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontSize: 14,
              color: v.ink2,
            ),
          ),
          const SizedBox(height: 20),
          VidyaButton(
            label: 'Practice this topic',
            onPressed: () => _onPracticeTap(context),
            size: VidyaButtonSize.md,
          ),
          const SizedBox(height: 16),
          VidyaCard(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'COMING IN PHASE 3b.full v3',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 10,
                      color: v.ink3,
                      letterSpacing: 1.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Concept tree, prerequisite map, and common '
                    'pitfalls for this topic.',
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
      ),
    );
  }
}
