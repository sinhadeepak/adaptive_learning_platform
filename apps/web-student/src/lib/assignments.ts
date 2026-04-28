// Sprint 9 F-1 — Educator Assignments client + pure copy helpers.
//
// `formatDueAt()` and `progressBucket()` are extracted so they can be
// unit-tested without rendering React. Mirrors the billing.ts pattern.

import { api } from "./api";

export interface Assignment {
  id: string;
  cohortId: string;
  tenantId: string | null;
  title: string;
  description: string | null;
  createdBy: string;
  dueAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  myCompletedAt?: string | null;
  myCorrectCount?: number | null;
  myTotalCount?: number | null;
}

export interface AssignmentQuestion {
  questionId: string;
  position: number;
  stem: string | null;
  // Sprint 10 S10-D — choices needed for the in-page answer form. The
  // correct index is NOT in this payload; submit grades server-side.
  choices: string[] | null;
  subjectId: string | null;
  topicId: string | null;
  language: string | null;
}

export interface SubmitResult {
  assignmentId: string;
  userId: string;
  correctCount: number;
  totalCount: number;
  completedAt: string;
  breakdown: {
    questionId: string;
    position: number;
    studentAnswer: number | null;
    correctAnswer: number;
    isCorrect: boolean;
    // Sprint 11 S11-C — stem + explanation. Explanation is null on
    // correct answers (server-side decision); always null when the
    // educator didn't author one.
    stem: string | null;
    explanation: string | null;
  }[];
}

export async function listMyAssignments(): Promise<Assignment[]> {
  return api.get<Assignment[]>("/content/assignments?mine=true");
}

export async function fetchAssignment(id: string): Promise<Assignment> {
  return api.get<Assignment>(`/content/assignments/${id}`);
}

export async function fetchAssignmentQuestions(
  id: string,
): Promise<AssignmentQuestion[]> {
  return api.get<AssignmentQuestion[]>(`/content/assignments/${id}/questions`);
}

export async function recordProgress(
  id: string,
  body: { correctCount: number; totalCount: number },
): Promise<void> {
  await api.post(`/content/assignments/${id}/progress`, body);
}

export async function submitAssignment(
  id: string,
  answers: Record<string, number>,
): Promise<SubmitResult> {
  return api.post<SubmitResult>(`/content/assignments/${id}/submit`, { answers });
}

// Sprint 12 S12-D — start a real Quiz session pinned to the educator's
// question list. The student plays through the existing /quiz/{id}
// surface; on submit Quiz publishes quiz.session.completed and Content's
// subscriber mirrors the score into assignment_progress.
export interface QuizFromAssignment {
  sessionId: string;
  assignmentId: string;
  mode: string;
  status: string;
  expiresAt: string;
  itemCount: number;
}

export async function startAssignmentQuiz(
  assignmentId: string,
  userId: string,
): Promise<QuizFromAssignment> {
  return api.post<QuizFromAssignment>("/quiz/sessions/from-assignment", {
    assignmentId,
    userId,
  });
}

// ── Pure helpers ─────────────────────────────────────────────────────────

export type ProgressBucket = "completed" | "due-soon" | "overdue" | "open";

/**
 * Decide which visual bucket an assignment row falls into.
 *  - completed: student has a `myCompletedAt` timestamp (any time).
 *  - overdue: dueAt has passed and student hasn't completed.
 *  - due-soon: dueAt is within the next 24h and student hasn't completed.
 *  - open: everything else (no due date or due > 24h).
 *
 * Pinning the contract here means UI tests can assert which pill renders
 * without simulating component state.
 */
export function progressBucket(
  assignment: Assignment,
  now: Date = new Date(),
): ProgressBucket {
  if (assignment.myCompletedAt) return "completed";
  if (!assignment.dueAt) return "open";
  const due = new Date(assignment.dueAt).getTime();
  if (due < now.getTime()) return "overdue";
  if (due - now.getTime() < 24 * 60 * 60 * 1000) return "due-soon";
  return "open";
}

/**
 * Human-readable due-date copy. Returns "" when there's no due date so
 * the caller can skip the row entirely.
 */
export function formatDueAt(
  assignment: Assignment,
  now: Date = new Date(),
): string {
  if (!assignment.dueAt) return "";
  const due = new Date(assignment.dueAt);
  const diffMs = due.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (assignment.myCompletedAt) {
    return `Due ${due.toLocaleDateString()}`;
  }
  if (diffMs < 0) {
    const days = Math.ceil(-diffMs / dayMs);
    return days === 1 ? "Overdue (yesterday)" : `Overdue (${days}d ago)`;
  }
  if (diffMs < dayMs) return "Due today";
  if (diffMs < 2 * dayMs) return "Due tomorrow";
  const days = Math.ceil(diffMs / dayMs);
  return `Due in ${days}d`;
}
