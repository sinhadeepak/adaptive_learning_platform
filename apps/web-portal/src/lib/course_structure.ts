// Sprint 21 S21-C — pure helper for module/lesson position assignment
// in the CourseAuthor module/lesson editor. Extracted so the assignment
// rule (max position + 1; or 1 when empty) is unit-testable independently
// of the React component.

export interface Positioned {
  position: number;
}

export function nextPosition(items: Positioned[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((it) => it.position)) + 1;
}
