// Sprint 11 S11-B — pure helpers for the question-picker filter +
// selection state. Mirroring the wizard pattern: pure-function logic
// here so the UI is thin and the state machine is unit-testable.

import type { Question } from "./api";

export interface PickerState {
  // Search query against stem text (case-insensitive substring match).
  query: string;
  // Topic filter — null means "all topics".
  topicId: string | null;
  // Selected question IDs (in selection order).
  selected: string[];
}

export const initialPickerState: PickerState = {
  query: "",
  topicId: null,
  selected: [],
};

export function setQuery(state: PickerState, query: string): PickerState {
  return { ...state, query };
}

export function setTopic(state: PickerState, topicId: string | null): PickerState {
  return { ...state, topicId };
}

export function toggle(state: PickerState, questionId: string): PickerState {
  const has = state.selected.includes(questionId);
  return {
    ...state,
    selected: has
      ? state.selected.filter((id) => id !== questionId)
      : [...state.selected, questionId],
  };
}

/** Return only questions matching the active filters. Pure. */
export function applyFilters(
  questions: Question[],
  state: PickerState,
): Question[] {
  let out = questions;
  if (state.topicId) {
    out = out.filter((q) => q.topicId === state.topicId);
  }
  if (state.query.trim().length > 0) {
    const q = state.query.trim().toLowerCase();
    out = out.filter((qq) => qq.stem.toLowerCase().includes(q));
  }
  return out;
}

/** Distinct topic IDs across the supplied question set, alphabetised. */
export function topicsInSet(questions: Question[]): string[] {
  const ids = new Set<string>();
  for (const q of questions) ids.add(q.topicId);
  return [...ids].sort();
}
