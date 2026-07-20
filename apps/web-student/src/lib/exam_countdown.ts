// Phase 3.3 (web) — days-until-exam helper, shared by surfaces that taper
// their guidance toward the exam (guided-next-steps, study plan).

/** Whole days from today (UTC) until `targetDate` (ISO). Returns `undefined`
 *  when no target is set, and clamps past dates to 0. */
export function daysToExam(targetDate: string | null | undefined): number | undefined {
  if (!targetDate) return undefined;
  const target = new Date(targetDate);
  if (Number.isNaN(target.getTime())) return undefined;
  const ms = target.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Pick the target date for the active exam from a profile's exam list,
 *  falling back to the first exam with a target set. */
export function targetDateForExam(
  exams: Array<{ examId: string; targetDate: string | null }> | null | undefined,
  activeExamId: string | null | undefined,
): string | null {
  if (!exams || exams.length === 0) return null;
  const active = activeExamId ? exams.find((e) => e.examId === activeExamId) : undefined;
  if (active?.targetDate) return active.targetDate;
  return exams.find((e) => e.targetDate)?.targetDate ?? null;
}
