// Pure guards for the exam catalog row actions (web-admin /exams).

export interface ExamCounts {
  question_count: number;
  blueprint_count: number;
}

/** An exam may be permanently deleted only when it is content-free:
 *  no authored questions and no blueprints. Mirrors the server guard. */
export function isDeletable(row: ExamCounts): boolean {
  return row.question_count === 0 && row.blueprint_count === 0;
}
