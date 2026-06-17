// Sprint 29 (P4-S29) — pure helpers for the error-pattern panel.

export type ErrorTag =
  | "silly_mistake"
  | "conceptual_gap"
  | "time_pressure"
  | "formula_error"
  | "sign_or_unit_error"
  | "unattempted";

export interface PatternTopic {
  topicId: string;
  topicTitle: string;
  count: number;
}

export interface PatternRow {
  classification: ErrorTag;
  count: number;
  topTopics: PatternTopic[];
}

export interface PatternRollup {
  userId: string;
  since: string | null;
  totals: Partial<Record<ErrorTag, number>>;
  topPatterns: PatternRow[];
}

export function tagLabel(tag: ErrorTag): string {
  switch (tag) {
    case "silly_mistake":
      return "Silly mistakes";
    case "conceptual_gap":
      return "Conceptual gaps";
    case "time_pressure":
      return "Time-pressure errors";
    case "formula_error":
      return "Formula misapplication";
    case "sign_or_unit_error":
      return "Sign / unit errors";
    case "unattempted":
      return "Unattempted";
  }
}

export function tagColour(tag: ErrorTag): string {
  switch (tag) {
    case "silly_mistake":
      return "var(--warn, #F5A623)";
    case "conceptual_gap":
      return "var(--bad, #F43F5E)";
    case "time_pressure":
      return "var(--info, #4F87F6)";
    case "formula_error":
      return "var(--ink-3, #7A8BAD)";
    case "sign_or_unit_error":
      return "var(--accent, #A78BFA)";
    case "unattempted":
      return "var(--ink-4, #3E4D6A)";
  }
}

/** Filter to non-zero rows + sort by count desc. */
export function summarisePatterns(rollup: PatternRollup | null): PatternRow[] {
  if (!rollup) return [];
  return [...rollup.topPatterns]
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);
}