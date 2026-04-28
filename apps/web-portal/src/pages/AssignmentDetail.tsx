// Sprint 10 S10-B / S10-E — educator-side assignment detail with the
// per-assignment leaderboard tab.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  type Assignment,
  type LeaderboardRow,
  assignments as assignmentsApi,
} from "../lib/api";

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
        {error && <p className="banner banner-error">{error}</p>}
        {assignment && (
          <>
            <h1>{assignment.title}</h1>
            <div className="meta-row">
              <span
                className={`pill ${assignment.publishedAt ? "pill-success" : "pill-neutral"}`}
              >
                {assignment.publishedAt ? "PUBLISHED" : "DRAFT"}
              </span>
              {assignment.dueAt && <span>Due {assignment.dueAt.slice(0, 10)}</span>}
              <span>Cohort {assignment.cohortId.slice(0, 8)}…</span>
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
              <table className="leaderboard">
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
                      <td>{row.accuracyPct}%</td>
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
