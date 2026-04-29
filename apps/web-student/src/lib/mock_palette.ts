// Sprint 25 (P4-S25) — OMR-style answer-sheet palette state machine.
//
// Pure-function over (items, answers, marked) so the React component
// renders a deterministic grid and the colour math is unit-testable.
// Lives alongside mock_state.ts (S23) and mock_series.ts (S25).

import type { MockExamItem } from "./mock_state";

export type PaletteState =
  | "unanswered"  // unmarked + no answer
  | "answered"    // unmarked + has answer
  | "marked"      // marked + no answer
  | "answered_marked"; // marked + has answer

export interface PaletteCell {
  itemIdx: number;
  questionId: string;
  sectionId: string | null;
  state: PaletteState;
}

export function paletteStateFor(
  questionId: string,
  answers: Record<string, number>,
  marked: Set<string>,
): PaletteState {
  const answered = answers[questionId] !== undefined;
  const flagged = marked.has(questionId);
  if (flagged && answered) return "answered_marked";
  if (flagged) return "marked";
  if (answered) return "answered";
  return "unanswered";
}

export function computePaletteState(
  items: MockExamItem[],
  answers: Record<string, number>,
  marked: Set<string>,
): PaletteCell[] {
  return items.map((it) => ({
    itemIdx: it.itemIdx,
    questionId: it.questionId,
    sectionId: it.sectionId,
    state: paletteStateFor(it.questionId, answers, marked),
  }));
}

/** Per-section answered count strip — feeds the line above the grid. */
export function paletteSectionCounts(
  cells: PaletteCell[],
): Record<string, { answered: number; total: number }> {
  const out: Record<string, { answered: number; total: number }> = {};
  for (const c of cells) {
    const key = c.sectionId ?? "_none";
    if (!out[key]) out[key] = { answered: 0, total: 0 };
    out[key].total += 1;
    if (c.state === "answered" || c.state === "answered_marked") {
      out[key].answered += 1;
    }
  }
  return out;
}
