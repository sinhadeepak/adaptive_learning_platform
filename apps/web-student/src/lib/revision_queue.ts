// Sprint 27 (P4-S27) — pure helpers for the daily revision view.

export interface RevisionItem {
  topicId: string;
  topicTitle: string;
  lastAttemptAt: string | null;
  dueAt: string | null;
  intervalDays: number;
  easeFactor: number;
  attempts: number;
  overdueDays: number;
  // Phase 3.2 — yield-weighted priority. Items arrive pre-ranked; the reason
  // is the dominant factor ("Weak mastery here", "You keep missing this", …).
  priority?: number;
  priorityReason?: string;
  errorCount?: number;
}

export interface MasteryLookupRow {
  topicId: string;
  ewa: number;
  n: number;
}

export type MasteryBucket = "STRONG" | "DEVELOPING" | "WEAK" | "NOT_STARTED";

/** EWA → strength bucket per docs/ui/00_MASTER_README.md. */
export function masteryBucket(ewa: number | undefined): MasteryBucket {
  if (ewa === undefined || ewa === null || ewa <= 0) return "NOT_STARTED";
  if (ewa >= 0.7) return "STRONG";
  if (ewa >= 0.4) return "DEVELOPING";
  return "WEAK";
}

/** Human-readable interval label. */
export function formatInterval(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "Today";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days < 14) return "1 week";
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 60) return "1 month";
  return `${Math.round(days / 30)} months`;
}

export interface RevisionRow {
  item: RevisionItem;
  bucket: MasteryBucket;
  intervalLabel: string;
}

/** Pure-function: join a revision-list row with the user's mastery to
 *  produce the bucket pill the UI renders. */
export function summariseRevisionList(
  items: RevisionItem[],
  mastery: MasteryLookupRow[],
): RevisionRow[] {
  const lookup: Record<string, number> = {};
  for (const m of mastery) lookup[m.topicId] = m.ewa;
  return items.map((it) => ({
    item: it,
    bucket: masteryBucket(lookup[it.topicId]),
    intervalLabel: formatInterval(it.intervalDays),
  }));
}
