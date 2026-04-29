// Sprint 28 (P4-S28) — pure helpers for the syllabus coverage view.

export type ChapterStatus = "mastered" | "developing" | "not_started" | "missing";

export interface ChapterCoverage {
  chapterId: string;
  name: string;
  totalTopics: number;
  attemptedTopics: number;
  masteredTopics: number;
  avgEwa: number;
  status: ChapterStatus;
}

export interface SubjectCoverage {
  subjectId: string;
  name: string;
  totalChapters: number;
  coveredChapters: number;
  totalTopics: number;
  attemptedTopics: number;
  masteredTopics: number;
  chapters: ChapterCoverage[];
}

export interface CoverageResponse {
  examId: string;
  overallPct: number;
  totalTopics: number;
  masteredTopics: number;
  subjects: SubjectCoverage[];
}

/** UI colour token per chapter status. */
export function chapterStatusColour(status: ChapterStatus): string {
  switch (status) {
    case "mastered":
      return "var(--color-green, #10C47A)";
    case "developing":
      return "var(--color-blue, #4F87F6)";
    case "not_started":
      return "var(--text-faint, #3E4D6A)";
    case "missing":
      return "var(--color-amber, #F5A623)";
  }
}

/** Short label per status (used in pill text). */
export function chapterStatusLabel(status: ChapterStatus): string {
  switch (status) {
    case "mastered":
      return "Mastered";
    case "developing":
      return "In progress";
    case "not_started":
      return "Not started";
    case "missing":
      return "No topics yet";
  }
}

/** "8 chapters remaining" — counts chapters that aren't mastered, including
 *  missing ones (since a student can't master what isn't mapped yet). */
export function chaptersRemaining(coverage: CoverageResponse): number {
  let remaining = 0;
  for (const subj of coverage.subjects) {
    for (const ch of subj.chapters) {
      if (ch.status !== "mastered") remaining += 1;
    }
  }
  return remaining;
}
