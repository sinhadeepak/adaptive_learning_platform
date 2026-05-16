// Sprint 10 S10-E + Sprint 12 S12-B — Educator-facing cohort leaderboard.
//
// Now SSE-driven: connects to /analytics/cohorts/{id}/leaderboard/stream
// and patches the table in place when a `delta` event lands. Falls back
// to the cached snapshot if the EventSource fails.

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  analytics,
  type CohortLeaderboardRow,
  type CohortSummary,
} from "../lib/api";
import { env } from "../lib/env";

interface LeaderboardFrame {
  cohortId: string;
  leaderboard: CohortLeaderboardRow[];
}

export function CohortLeaderboard() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const [rows, setRows] = useState<CohortLeaderboardRow[] | null>(null);
  const [summary, setSummary] = useState<CohortSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!cohortId) return;
    let cancelled = false;

    // 1) Initial snapshot via the regular GET — covers the case where
    //    SSE is blocked by a proxy (eg. corporate firewall stripping
    //    text/event-stream).
    analytics
      .cohortLeaderboard(cohortId)
      .then((r) => {
        if (!cancelled) setRows(r.leaderboard);
      })
      .catch((e) => !cancelled && setError((e as Error).message));

    // Sprint 13 S13-D — fetch the summary header alongside the
    // leaderboard. Same fan-out as the cohortLeaderboard path; it's a
    // pure aggregation over the same source rows.
    analytics
      .cohortSummary(cohortId)
      .then((r) => {
        if (!cancelled) setSummary(r.summary);
      })
      .catch(() => {
        // Summary failure shouldn't block the leaderboard render — the
        // educator gets to keep the table even if the header tile
        // fetch hiccups.
      });

    // 2) Open the SSE stream. The browser's EventSource auto-reconnects
    //    on transient failure; we just need to wire the handlers.
    const url = `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(
      cohortId,
    )}/leaderboard/stream`;
    try {
      const es = new EventSource(url, { withCredentials: true });
      sourceRef.current = es;
      const onFrame = (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(ev.data) as LeaderboardFrame;
          if (cancelled) return;
          setRows(payload.leaderboard);
          setLive(true);
        } catch {
          /* ignore malformed frames */
        }
      };
      es.addEventListener("snapshot", onFrame as EventListener);
      es.addEventListener("delta", onFrame as EventListener);
      es.onerror = () => {
        // Don't set an error banner — the snapshot path already filled
        // the rows. Just mark live=false so the UI tells the educator
        // the table isn't auto-updating.
        setLive(false);
      };
    } catch {
      // EventSource unavailable in this runtime; rely on the GET above.
    }

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [cohortId]);

  return (
    <AppShell title="Cohort Leaderboard">
      <main className="page" style={{ padding: 24 }}>
        <Link to="/assignments">← Back to assignments</Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1>Cohort Leaderboard</h1>
          <span
            className={`pill ${live ? "pill-success" : "pill-neutral"}`}
            title="Updates every ~5s while connected"
          >
            {live ? "● LIVE" : "○ Snapshot"}
          </span>
        </div>
        {error && <p className="banner banner-error">{error}</p>}

        {/* Sprint 13 S13-D — headline summary tiles. */}
        {summary && (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
              marginTop: 16,
              marginBottom: 16,
            }}
          >
            <SummaryTile label="Members" value={summary.memberCount} />
            <SummaryTile
              label="Started"
              value={`${summary.startedCount} · ${summary.completionPct}%`}
            />
            <SummaryTile
              label="Avg readiness"
              value={`${summary.avgReadinessPct}%`}
            />
            <SummaryTile
              label="At risk"
              value={summary.atRisk.length}
              hint={summary.atRisk.length > 0 ? "see top of list" : undefined}
            />
          </section>
        )}

        {rows === null && <p>Loading…</p>}
        {rows !== null && rows.length === 0 && (
          <p>No members in this cohort yet.</p>
        )}
        {rows !== null && rows.length > 0 && (
          <table className="leaderboard">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Readiness</th>
                <th>Topics</th>
                <th>Last update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className={r.started ? "" : "row-inactive"}>
                  <td>{r.rank}</td>
                  <td>
                    {/* Sprint 13 S13-C — clickable for drill-down. */}
                    <Link to={`/cohorts/${cohortId}/students/${r.userId}`}>
                      <code>{r.userId.slice(0, 8)}…</code>
                    </Link>
                    {r.role !== "STUDENT" && (
                      <span className="pill pill-neutral" style={{ marginLeft: 8 }}>
                        {r.role}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.started ? `${Math.round(r.score * 100)}%` : "—"}
                  </td>
                  <td>{r.started ? r.nTopics : "—"}</td>
                  <td>
                    {r.updatedAt ? r.updatedAt.slice(0, 10) : "Not started"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </AppShell>
  );
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--rule)",
        borderRadius: 8,
        background: "var(--card-1, #fff)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
}