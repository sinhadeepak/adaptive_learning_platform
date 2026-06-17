// Sprint 23 (P4-S23) — pure helpers for the exam-mode (MOCK_BLUEPRINT) UI.
//
// Section navigation strip math + marked-for-review queue computation. Lives
// in lib/ so the React component is thin and the state-machine logic is
// unit-testable independently.

export interface MockExamItem {
  itemIdx: number;
  questionId: string;
  sectionId: string | null;
}

export interface MockExamSection {
  sectionId: string;
  name: string;
  nRequested: number;
  nComposed: number;
  short: boolean;
}

export interface SectionTotals {
  sectionId: string;
  name: string;
  served: number;
  answered: number;
  marked: number;
  unanswered: number;
}

/** First item index belonging to a section (0-based), or -1 if none served. */
export function firstIdxOfSection(items: MockExamItem[], sectionId: string): number {
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].sectionId === sectionId) return i;
  }
  return -1;
}

/** Per-section answered/marked/unanswered totals — drives the nav strip. */
export function computeSectionTotals(
  items: MockExamItem[],
  sections: MockExamSection[],
  answers: Record<string, number>,
  marked: Set<string>,
): SectionTotals[] {
  const out: SectionTotals[] = sections.map((s) => ({
    sectionId: s.sectionId,
    name: s.name,
    served: 0,
    answered: 0,
    marked: 0,
    unanswered: 0,
  }));
  const lookup: Record<string, SectionTotals> = {};
  out.forEach((t) => {
    lookup[t.sectionId] = t;
  });
  for (const it of items) {
    if (!it.sectionId) continue;
    const t = lookup[it.sectionId];
    if (!t) continue;
    t.served += 1;
    if (answers[it.questionId] !== undefined) {
      t.answered += 1;
    } else {
      t.unanswered += 1;
    }
    if (marked.has(it.questionId)) {
      t.marked += 1;
    }
  }
  return out;
}

/** The list of question IDs the student has marked for end-of-exam review. */
export function markedReviewQueue(
  items: MockExamItem[],
  marked: Set<string>,
): MockExamItem[] {
  return items.filter((it) => marked.has(it.questionId));
}

/** Returns true if the player is allowed to navigate to `targetIdx` from `currentIdx`
 *  given the blueprint's inter-section navigation flag.
 *  - When inter-section nav is allowed, any (in-bounds) jump succeeds.
 *  - When sections are locked, a jump is allowed only within the same section. */
export function canNavigate(
  items: MockExamItem[],
  currentIdx: number,
  targetIdx: number,
  interSectionNavigation: boolean,
): boolean {
  if (targetIdx < 0 || targetIdx >= items.length) return false;
  if (interSectionNavigation) return true;
  const cur = items[currentIdx]?.sectionId ?? null;
  const tgt = items[targetIdx]?.sectionId ?? null;
  return cur === tgt;
}
