// Sprint 24 (P4-S24) — pure helper for PYQ chapter-frequency analysis.
//
// Renders trend arrows on the chapter list ("3 questions in 2024 → trending up")
// based on the per-year counts the backend returns.

export type YearCounts = Record<number | string, number>;

export type TrendDirection = "up" | "down" | "flat" | "single";

/** Direction of the year-over-year trend across the most-recent two years
 *  for which we have data. "single" when only one year is present. */
export function trendDirection(counts: YearCounts): TrendDirection {
  const years = Object.keys(counts)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (years.length === 0) return "flat";
  if (years.length === 1) return "single";
  const lastYear = years[years.length - 1];
  const prevYear = years[years.length - 2];
  const last = counts[lastYear] ?? 0;
  const prev = counts[prevYear] ?? 0;
  if (last > prev) return "up";
  if (last < prev) return "down";
  return "flat";
}

/** Total PYQs across all years tracked. */
export function totalAcrossYears(counts: YearCounts): number {
  return Object.values(counts).reduce((acc, n) => acc + (n || 0), 0);
}
