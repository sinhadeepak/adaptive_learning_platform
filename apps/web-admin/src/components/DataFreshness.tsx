/**
 * Track 2 Sprint A8 — freshness footer.
 *
 * A small "Data as of: X" line every aggregate dashboard renders at
 * the bottom. The honest-signalling pattern: if a dashboard is
 * showing stale data because the rollup worker hasn't run, the
 * student / admin should see that, not silently consume yesterday's
 * numbers as if they were live.
 *
 * Usage:
 *   <DataFreshness asOf={data.snapshotDate} />
 *
 * Pass an ISO timestamp (or null when truly live). Threshold defaults
 * to 36 hours — anything older shows in amber so the operator knows
 * the worker is behind.
 */

import type { ReactNode } from "react";

export function DataFreshness({
  asOf,
  threshold = 36,
}: {
  asOf: string | null | undefined;
  threshold?: number;
}): ReactNode {
  if (!asOf) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 16, fontStyle: "italic" }}>
        Live data — no snapshot timestamp.
      </p>
    );
  }
  const ts = new Date(asOf);
  const ageHours = (Date.now() - ts.getTime()) / 3_600_000;
  const stale = ageHours > threshold;
  const tone = stale ? "var(--color-amber)" : "var(--text-muted)";
  return (
    <p style={{ color: tone, fontSize: 11, marginTop: 16, fontStyle: "italic" }}>
      Data as of {ts.toLocaleString()} ({Math.round(ageHours)}h ago)
      {stale && " — rollup worker may be behind"}
    </p>
  );
}
