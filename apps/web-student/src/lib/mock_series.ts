// Sprint 25 (P4-S25) — pure helpers for the Mocks series view.
//
// Renders summary rows for taken mocks: overall accuracy, weakest section,
// human-readable status. Lives in lib/ so the React component is thin and
// the math is unit-testable.

export interface SessionRow {
  sessionId: string;
  blueprintId: string | null;
  status: string; // IN_PROGRESS | SUBMITTED | EXPIRED
  startedAt: string;
  submittedAt: string | null;
  servedCount: number;
  correctCount: number;
}

export interface SectionBreakdown {
  sectionId: string;
  servedCount: number;
  correctCount: number;
  totalTimeMs: number;
  accuracy: number;
}

export interface AttemptSummary {
  sessionId: string;
  blueprintId: string | null;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  servedCount: number;
  correctCount: number;
  /** 0..1, NaN if servedCount === 0. */
  accuracy: number;
  /** Weakest section by accuracy across the breakdown rows; null when no breakdown. */
  weakestSection: { sectionId: string; accuracy: number } | null;
}

/** Pure-function summariser. Combines a session row with optional per-section
 *  breakdown rows from /analytics/sessions/:id/breakdown. */
export function summariseAttempt(
  session: SessionRow,
  breakdown?: SectionBreakdown[],
): AttemptSummary {
  const accuracy =
    session.servedCount > 0
      ? session.correctCount / session.servedCount
      : 0;
  let weakest: AttemptSummary["weakestSection"] = null;
  if (breakdown && breakdown.length > 0) {
    const sorted = [...breakdown]
      .filter((s) => s.servedCount > 0)
      .sort((a, b) => a.accuracy - b.accuracy);
    if (sorted.length > 0) {
      weakest = { sectionId: sorted[0].sectionId, accuracy: sorted[0].accuracy };
    }
  }
  return {
    sessionId: session.sessionId,
    blueprintId: session.blueprintId,
    status: session.status,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    servedCount: session.servedCount,
    correctCount: session.correctCount,
    accuracy,
    weakestSection: weakest,
  };
}

export function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}
