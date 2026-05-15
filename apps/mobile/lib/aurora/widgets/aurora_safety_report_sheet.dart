// AuroraSafetyReportSheet — user-initiated abuse-report bottom sheet.
//
// Spec: docs/02-design/redesign/abuse-report.md
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.5.
//
// Composition (per brief §4):
//   - Header with quoted message preview
//   - Reason radio list (persona-aware extras)
//   - Optional free-text input revealed only on "Something else"
//   - Submit + cancel footer
//
// Server-side endpoint is `POST /moderation/reports` on the (forthcoming)
// alp-moderation service. Until that lands, [onSubmit] should resolve
// against a stub that returns a synthetic report id.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'aurora_button.dart';

/// Surface that hosted the reported message — used by analytics and the
/// moderator queue for routing. Persisted as the `surface` enum on the
/// server payload.
enum ReportSurface {
  lumi,
  doubtAnswer,
  friendsChat,
  leaderboardComment,
  courseReview,
}

extension ReportSurfaceX on ReportSurface {
  String get id => switch (this) {
        ReportSurface.lumi => 'lumi',
        ReportSurface.doubtAnswer => 'doubt_answer',
        ReportSurface.friendsChat => 'friends_chat',
        ReportSurface.leaderboardComment => 'leaderboard_comment',
        ReportSurface.courseReview => 'course_review',
      };
}

/// Reason taxonomy. The first 5 are common across personas; the
/// persona-specific extras are conditionally appended in
/// [AuroraSafetyReportSheet._reasonsFor].
enum ReportReason {
  inappropriateLanguage,
  wrongAnswer,
  askingForPii,
  selfHarmDistress,
  scaryOrMean, // Kid-only
  politicalStanceAsFact, // Aspirant-only
  outdatedOrOutOfSyllabus, // Aspirant-only
  offTopicForCourse, // Learner-only
  somethingElse,
}

extension ReportReasonX on ReportReason {
  String get id => switch (this) {
        ReportReason.inappropriateLanguage => 'inappropriate_language',
        ReportReason.wrongAnswer => 'wrong_answer',
        ReportReason.askingForPii => 'asking_for_pii',
        ReportReason.selfHarmDistress => 'self_harm_distress',
        ReportReason.scaryOrMean => 'scary_or_mean',
        ReportReason.politicalStanceAsFact => 'political_stance_as_fact',
        ReportReason.outdatedOrOutOfSyllabus => 'outdated_or_oos',
        ReportReason.offTopicForCourse => 'off_topic_for_course',
        ReportReason.somethingElse => 'something_else',
      };

  String label(Persona persona) => switch (this) {
        ReportReason.inappropriateLanguage => 'Inappropriate language',
        ReportReason.wrongAnswer => 'Wrong / misleading answer',
        ReportReason.askingForPii => 'Asking for personal information',
        ReportReason.selfHarmDistress => 'Self-harm or distress',
        ReportReason.scaryOrMean => 'Saying something scary or mean',
        ReportReason.politicalStanceAsFact =>
          'Stating a political opinion as fact',
        ReportReason.outdatedOrOutOfSyllabus => 'Outdated / out-of-syllabus',
        ReportReason.offTopicForCourse => 'Off-topic for this course',
        ReportReason.somethingElse => 'Something else',
      };
}

/// Payload yielded by the sheet once submission completes (or the
/// caller's `onSubmit` is invoked). The sheet does not own the network
/// call — it hands the payload back to the caller for transport.
class ReportPayload {
  ReportPayload({
    required this.messageId,
    required this.surface,
    required this.reason,
    required this.persona,
    this.freeText,
  });

  final String messageId;
  final ReportSurface surface;
  final ReportReason reason;
  final Persona persona;
  final String? freeText;

  Map<String, dynamic> toJson() => {
        'message_id': messageId,
        'surface': surface.id,
        'reason': reason.id,
        'persona': persona.id,
        if (freeText != null && freeText!.isNotEmpty) 'free_text': freeText,
      };
}

class AuroraSafetyReportSheet extends StatefulWidget {
  const AuroraSafetyReportSheet({
    super.key,
    required this.messageId,
    required this.surface,
    required this.persona,
    required this.messagePreview,
    required this.onSubmit,
  });

  /// Server-side id of the reported message.
  final String messageId;

  /// Which surface the message was reported from.
  final ReportSurface surface;

  /// Active persona — picks the right reason taxonomy.
  final Persona persona;

  /// First few lines of the reported message; shown as a greyed quote.
  final String messagePreview;

  /// Network-side submission. Returns `(reportId, slaResponseAt)` on
  /// success or throws on failure. The sheet handles the success /
  /// error UI from there.
  final Future<({String reportId, DateTime slaResponseAt})> Function(
      ReportPayload payload,) onSubmit;

  @override
  State<AuroraSafetyReportSheet> createState() =>
      _AuroraSafetyReportSheetState();
}

class _AuroraSafetyReportSheetState extends State<AuroraSafetyReportSheet> {
  ReportReason? _reason;
  final _freeTextController = TextEditingController();
  bool _submitting = false;
  String? _errorText;

  List<ReportReason> _reasonsFor(Persona persona) {
    final base = [
      ReportReason.inappropriateLanguage,
      ReportReason.wrongAnswer,
      ReportReason.askingForPii,
      ReportReason.selfHarmDistress,
    ];
    switch (persona) {
      case Persona.kid:
        return [...base, ReportReason.scaryOrMean, ReportReason.somethingElse];
      case Persona.teen:
        return [...base, ReportReason.somethingElse];
      case Persona.aspirant:
        return [
          ...base,
          ReportReason.politicalStanceAsFact,
          ReportReason.outdatedOrOutOfSyllabus,
          ReportReason.somethingElse,
        ];
      case Persona.learner:
        return [
          ...base,
          ReportReason.offTopicForCourse,
          ReportReason.somethingElse,
        ];
    }
  }

  Future<void> _submit() async {
    final reason = _reason;
    if (reason == null || _submitting) return;
    setState(() {
      _submitting = true;
      _errorText = null;
    });
    HapticFeedback.lightImpact();
    final payload = ReportPayload(
      messageId: widget.messageId,
      surface: widget.surface,
      reason: reason,
      persona: widget.persona,
      freeText: reason == ReportReason.somethingElse
          ? _freeTextController.text.trim()
          : null,
    );
    try {
      final result = await widget.onSubmit(payload);
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _errorText = "Couldn't submit. Try again.";
      });
    }
  }

  @override
  void dispose() {
    _freeTextController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final reasons = _reasonsFor(widget.persona);
    final showFreeText = _reason == ReportReason.somethingElse;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          16 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Report this message',
                    style: typography.h3.copyWith(color: colors.neutral900),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, color: colors.neutral500),
                    onPressed: () => Navigator.of(context).pop(),
                    tooltip: 'Close',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Quoted preview.
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: colors.neutral100,
                  borderRadius: BorderRadius.circular(10),
                  border: Border(
                    left: BorderSide(color: colors.neutral400, width: 3),
                  ),
                ),
                child: Text(
                  widget.messagePreview,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style:
                      typography.bodySm.copyWith(color: colors.neutral700),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Why are you reporting?',
                style: typography.h4.copyWith(color: colors.neutral900),
              ),
              const SizedBox(height: 8),
              // Reason list.
              ...reasons.map(
                (r) => RadioListTile<ReportReason>(
                  value: r,
                  groupValue: _reason,
                  onChanged: (v) {
                    HapticFeedback.selectionClick();
                    setState(() => _reason = v);
                  },
                  title: Text(
                    r.label(widget.persona),
                    style:
                        typography.body.copyWith(color: colors.neutral900),
                  ),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ),
              // Free-text — only when "Something else" is picked.
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                child: showFreeText
                    ? Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: TextField(
                          controller: _freeTextController,
                          maxLength: 200,
                          maxLines: 3,
                          autofocus: true,
                          decoration: const InputDecoration(
                            hintText: 'Tell us more (optional, 200 chars)',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
              if (_errorText != null) ...[
                const SizedBox(height: 8),
                Text(
                  _errorText!,
                  style:
                      typography.bodySm.copyWith(color: colors.danger600),
                ),
              ],
              const SizedBox(height: 16),
              AuroraButton(
                label: 'Submit report',
                fullWidth: true,
                loading: _submitting,
                onPressed: _reason == null ? null : _submit,
              ),
              const SizedBox(height: 4),
              Center(
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(
                    'Cancel',
                    style:
                        typography.body.copyWith(color: colors.neutral500),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
