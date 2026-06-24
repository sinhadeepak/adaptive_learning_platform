// VidyaExamSwitcher — shared active-exam chrome.
//
// Two presentations, both driven by the app-wide VidyaActiveExamNotifier
// (VidyaActiveExam.of(context)) so switching in any one re-scopes the whole
// app:
//   • VidyaExamPill   — a compact header pill (active code + chevron) that
//                       opens a selection sheet. For tabs whose header has
//                       no room for a chip row (Study, Insights, …).
//   • VidyaExamChips  — a horizontal chip row (Home's presentation).
//
// Both are inert (render the active exam's label, no affordance) when the
// student is enrolled in a single exam, and render nothing when enrolled in
// none.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../state/active_exam_notifier.dart';
import '../state/exam_ref.dart';

class VidyaExamPill extends StatelessWidget {
  /// Optional "Add exam" affordance in the selection sheet. When null the
  /// row is hidden (the AddExam flow is wired in a later slice).
  final VoidCallback? onAddExam;
  const VidyaExamPill({super.key, this.onAddExam});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final notifier = VidyaActiveExam.of(context);
    final active = notifier?.active;
    if (notifier == null || active == null) return const SizedBox.shrink();

    final multiple = notifier.hasMultiple;
    // Tappable when there's more than one exam to switch between, OR when an
    // "Add exam" affordance is offered (so single-exam users can still reach
    // the catalog to enrol in another).
    final tappable = multiple || onAddExam != null;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: tappable ? () => _openSheet(context, notifier) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: v.ink3.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: v.rule),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                active.code.toUpperCase(),
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: v.ink,
                  letterSpacing: 0.5,
                ),
              ),
              if (tappable) ...[
                const SizedBox(width: 4),
                Icon(Icons.expand_more, size: 16, color: v.ink3),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _openSheet(BuildContext context, VidyaActiveExamNotifier notifier) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: VidyaThemeData.of(context).paper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => _ExamSelectSheet(
        notifier: notifier,
        onAddExam: onAddExam,
      ),
    );
  }
}

class _ExamSelectSheet extends StatelessWidget {
  final VidyaActiveExamNotifier notifier;
  final VoidCallback? onAddExam;
  const _ExamSelectSheet({required this.notifier, this.onAddExam});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'YOUR EXAMS',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: v.ink3,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 12),
            for (final e in notifier.enrolled)
              _ExamRow(
                exam: e,
                selected: e.examId == notifier.active?.examId,
                onTap: () {
                  notifier.select(e.examId);
                  Navigator.of(context).pop();
                },
              ),
            if (onAddExam != null) ...[
              const SizedBox(height: 4),
              InkWell(
                onTap: () {
                  Navigator.of(context).pop();
                  onAddExam!();
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      Icon(Icons.add, size: 20, color: v.accent),
                      const SizedBox(width: 12),
                      Text(
                        'Add another exam',
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: v.accent,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ExamRow extends StatelessWidget {
  final ExamRef exam;
  final bool selected;
  final VoidCallback onTap;
  const _ExamRow({
    required this.exam,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final days = exam.daysToTarget;
    final countdown =
        days == null ? null : (days < 0 ? 'Past target' : '$days days to go');
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    exam.name,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                  if (countdown != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      countdown,
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 11,
                        color: v.ink3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (selected)
              Icon(Icons.check_circle, size: 22, color: v.accent)
            else
              Icon(Icons.circle_outlined, size: 22, color: v.ink3),
          ],
        ),
      ),
    );
  }
}

/// Horizontal chip row presentation (Home). Renders a chip per enrolled
/// exam; tapping selects it via the shared notifier. Hidden when fewer than
/// two exams are enrolled.
class VidyaExamChips extends StatelessWidget {
  const VidyaExamChips({super.key});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final notifier = VidyaActiveExam.of(context);
    if (notifier == null || !notifier.hasMultiple) {
      return const SizedBox.shrink();
    }
    final exams = notifier.enrolled;
    final activeId = notifier.active?.examId;
    return SizedBox(
      height: 34,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: exams.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) {
          final e = exams[i];
          final selected = e.examId == activeId;
          return GestureDetector(
            onTap: () => notifier.select(e.examId),
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: selected ? v.accent : v.ink3.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                e.name,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : v.ink2,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
