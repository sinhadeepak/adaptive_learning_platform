// Sprint 13 S13-C — per-student drill-down for the educator UI.
//
// Reachable by clicking a row on /cohorts/:cohortId/leaderboard. Shows
// readiness + per-topic mastery + streak + recent quiz sessions in one
// pane so the educator can coach a struggling student without having to
// stitch together five tabs.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner, SectionHeader, StatCard } from "../components/primitives";
import { analytics, type StudentDrillDown as DrillDown } from "../lib/api";

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
        {error && (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        )}
        {data === null && !error && <p>Loading…</p>}
        {data !== null && (
          <>
            <h1>
              <code>{userId?.slice(0, 8)}…</code>
            </h1>
            {/* Headline tiles — readiness + streak. */}
            <section className="dash-section" style={{ margin: "16px 0" }}>
              <SectionHeader label="Student overview" />
              <div className="stat-grid">
                <StatCard
                  label="Readiness"
                  value={`${Math.round(data.readiness.score * 100)}%`}
                  hint={`${data.readiness.nTopics} topics`}
                />
                <StatCard
                  label="Current streak"
                  value={data.streak.current}
                  hint={`Longest: ${data.streak.longest}`}
                />
                <StatCard
                  label="Last active"
                  value={data.streak.lastActiveDate?.slice(0, 10) ?? "—"}
                />
              </div>
            </section>

            <section className="dash-section">
              <SectionHeader
                label="Topic mastery"
                count={data.topicMastery.length || undefined}
              />
              {data.topicMastery.length === 0 ? (
                <p>No mastery data yet — student hasn't completed a session.</p>
              ) : (
                <table className="data-table">
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
                        <td><Meter pct={Math.round(m.ewa * 100)} /></td>
                        <td>{m.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="dash-section" style={{ marginTop: 32 }}>
              <SectionHeader
                label="Recent sessions"
                count={data.recentSessions.length || undefined}
              />
              {data.recentSessions.length === 0 ? (
                <p>No completed sessions yet.</p>
              ) : (
                <table className="data-table">
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
                        <td><Meter pct={s.accuracyPct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}