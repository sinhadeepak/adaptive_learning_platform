// Sprint 10 S10-B / S10-E — educator-side assignment detail with the
// per-assignment leaderboard tab.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import {
  type Assignment,
  type LeaderboardRow,
  assignments as assignmentsApi,
} from "../lib/api";

function Meter({ pct, tone }: { pct: number; tone?: "good" | "warn" | "bad" }) {
  const cls = tone ? ` pa-meter__fill--${tone}` : "";
  return (
    <span className="pa-meter">
      <span className="pa-meter__track">
        <span className={`pa-meter__fill${cls}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="pa-meter__val">{pct}%</span>
    </span>
  );
}

export function AssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assignmentId) return;
    assignmentsApi
      .get(assignmentId)
      .then(setAssignment)
      .catch((e) => setError((e as Error).message));
    assignmentsApi
      .leaderboard(assignmentId)
      .then(setLeaderboard)
      .catch(() => setLeaderboard([]));
  }, [assignmentId]);

  return (
    <AppShell title="Assignment">
      <main className="page" style={{ padding: 24 }}>
        <Link to="/assignments">← Back to assignments</Link>
        {error && (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        )}
        {assignment && (
          <>
            <h1>{assignment.title}</h1>
            <div className="meta-row">
              <Pill tone={assignment.publishedAt ? "success" : "muted"}>
                {assignment.publishedAt ? "PUBLISHED" : "DRAFT"}
              </Pill>
              {assignment.dueAt && <span>Due {assignment.dueAt.slice(0, 10)}</span>}
              <span>Cohort <code>{assignment.cohortId.slice(0, 8)}…</code></span>
            </div>
            {assignment.description && (
              <p style={{ marginTop: 12 }}>{assignment.description}</p>
            )}

            <h2 style={{ marginTop: 24 }}>Leaderboard</h2>
            {leaderboard === null ? (
              <p>Loading…</p>
            ) : leaderboard.length === 0 ? (
              <p>No completions yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th>Score</th>
                    <th>Accuracy</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => (
                    <tr key={row.userId}>
                      <td>{idx + 1}</td>
                      <td>
                        <code>{row.userId.slice(0, 8)}…</code>
                      </td>
                      <td>
                        {row.correctCount}/{row.totalCount}
                      </td>
                      <td><Meter pct={row.accuracyPct} /></td>
                      <td>{row.completedAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
