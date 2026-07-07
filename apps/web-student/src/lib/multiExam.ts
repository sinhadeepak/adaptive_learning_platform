// Data layer for the unified multi-exam dashboard (readiness carousel +
// per-exam attention cards). Merges the student's enrolled exams with the
// engagement multi-exam-summary roll-up.
import { auth } from "./api";

export interface EnrolledExam {
  examId: string;
  code: string;
  name: string;
  targetDate: string | null;
}

export interface ExamSummary {
  examId: string;
  readinessScore: number;
  nTopics: number;
  weakestTopicId: string | null;
  weakestEwa: number | null;
  mistakesDue: number;
  revisionDue: number;
}

interface ProfileExam {
  examId: string;
  targetDate: string | null;
}
interface CatalogExam {
  id: string;
  code: string;
  name: string;
}

/** Merge profile-enrolled exams with catalog metadata. An enrolled exam with
 *  no catalog match still renders (code/name fall back to its id) so the
 *  dashboard never silently drops an exam the student is enrolled in. */
export function buildEnrolledExams(
  profileExams: ProfileExam[],
  catalog: CatalogExam[],
): EnrolledExam[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  return profileExams.map((pe) => {
    const meta = byId.get(pe.examId);
    return {
      examId: pe.examId,
      code: meta?.code ?? pe.examId,
      name: meta?.name ?? pe.examId,
      targetDate: pe.targetDate,
    };
  });
}

/** Fetch the per-exam roll-up and return it keyed by examId. Returns an empty
 *  map on any failure — callers render from the exam list alone. */
export async function fetchMultiExamSummary(
  userId: string,
  examIds: string[],
): Promise<Record<string, ExamSummary>> {
  if (!examIds.length) return {};
  try {
    const qs = encodeURIComponent(examIds.join(","));
    const r = await auth.fetch(
      `/api/v1/analytics/multi-exam-summary/${userId}?examIds=${qs}`,
    );
    if (!r.ok) return {};
    const body = (await r.json()) as { exams?: ExamSummary[] | null };
    const out: Record<string, ExamSummary> = {};
    for (const e of Array.isArray(body.exams) ? body.exams : []) {
      out[e.examId] = e;
    }
    return out;
  } catch {
    return {};
  }
}
