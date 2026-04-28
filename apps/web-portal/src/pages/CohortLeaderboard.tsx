// Sprint 10 S10-E — Educator-facing cohort leaderboard.
//
// Consumes the L-1 endpoint added in Sprint 9. Pure presentation —
// the analytics service does the ranking; this page just renders.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { analytics, type CohortLeaderboardRow } from "../lib/api";

export function CohortLeaderboard() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const [rows, setRows] = useState<CohortLeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cohortId) return;
    analytics
      .cohortLeaderboard(cohortId)
      .then((r) => setRows(r.leaderboard))
      .catch((e) => setError((e as Error).message));
  }, [cohortId]);

  return (
    <AppShell title="Cohort Leaderboard">
      <main className="page" style={{ padding: 24 }}>
        <Link to="/assignments">← Back to assignments</Link>
        <h1>Cohort Leaderboard</h1>
        {error && <p className="banner banner-error">{error}</p>}
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
                    <code>{r.userId.slice(0, 8)}…</code>
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
