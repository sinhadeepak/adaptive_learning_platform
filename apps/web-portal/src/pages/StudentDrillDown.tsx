// Sprint 13 S13-C — per-student drill-down for the educator UI.
//
// Reachable by clicking a row on /cohorts/:cohortId/leaderboard. Shows
// readiness + per-topic mastery + streak + recent quiz sessions in one
// pane so the educator can coach a struggling student without having to
// stitch together five tabs.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { analytics, type StudentDrillDown as DrillDown } from "../lib/api";

export function StudentDrillDown() {
  const { cohortId, userId } = useParams<{
    cohortId: string;
    userId: string;
  }>();
  const [data, setData] = useState<DrillDown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cohortId || !userId) return;
    analytics
      .studentDrillDown(cohortId, userId)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [cohortId, userId]);

  return (
    <AppShell title="Student insights">
      <main className="page" style={{ padding: 24 }}>
        <Link to={`/cohorts/${cohortId}/leaderboard`}>
          ← Back to cohort leaderboard
        </Link>
        {error && <p className="banner banner-error">{error}</p>}
        {data === null && !error && <p>Loading…</p>}
        {data !== null && (
          <>
            <h1>
              <code>{userId?.slice(0, 8)}…</code>
            </h1>
            {/* Headline tiles — readiness + streak. */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                margin: "16px 0",
              }}
            >
              <Tile
                label="Readiness"
                value={`${Math.round(data.readiness.score * 100)}%`}
                sub={`${data.readiness.nTopics} topics`}
              />
              <Tile
                label="Current streak"
                value={data.streak.current}
                sub={`Longest: ${data.streak.longest}`}
              />
              <Tile
                label="Last active"
                value={data.streak.lastActiveDate?.slice(0, 10) ?? "—"}
              />
            </section>

            <h2>Topic mastery</h2>
            {data.topicMastery.length === 0 ? (
              <p>No mastery data yet — student hasn't completed a session.</p>
            ) : (
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>EWA</th>
                    <th>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topicMastery.map((m) => (
                    <tr key={m.topicId}>
                      <td>
                        <code>{m.topicId.slice(0, 8)}…</code>
                      </td>
                      <td>{Math.round(m.ewa * 100)}%</td>
                      <td>{m.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 style={{ marginTop: 32 }}>Recent sessions</h2>
            {data.recentSessions.length === 0 ? (
              <p>No completed sessions yet.</p>
            ) : (
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Mode</th>
                    <th>Topic</th>
                    <th>Score</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSessions.map((s) => (
                    <tr key={s.sessionId}>
                      <td>{s.submittedAt?.slice(0, 10) ?? "—"}</td>
                      <td>{s.mode}</td>
                      <td>
                        {s.topicId ? (
                          <code>{s.topicId.slice(0, 8)}…</code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {s.correctCount}/{s.servedCount}
                      </td>
                      <td>{s.accuracyPct}%</td>
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

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border-faint)",
        borderRadius: 8,
        background: "var(--bg-surface-1, #fff)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
