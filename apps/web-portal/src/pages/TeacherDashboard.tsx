/**
 * Track 2 Sprint A3 — teacher overview.
 *
 * Composite landing page that shows every cohort the teacher is
 * assigned to with its summary stats. Drills down into the per-
 * cohort sub-pages (TopicHeatmap, Trend, Engagement, Assignments).
 *
 * Conventions mirror CohortLeaderboard.tsx — AppShell + .page +
 * inline-CSS tables, no chart library.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Pill, SkeletonRows } from "../components/primitives";
import { useAuth } from "../lib/auth-provider";
import { teacherAnalytics, type TeacherCohortRow } from "../lib/analytics-api";

export function TeacherDashboard() {
  const { user } = useAuth();
  const [cohorts, setCohorts] = useState<TeacherCohortRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    teacherAnalytics
      .dashboard(user.id)
      .then((d) => setCohorts(d.cohorts))
      .catch((e) => setError(String(e)));
  }, [user]);

  return (
    <AppShell title="Teacher Dashboard">
      <main className="page" style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>My cohorts</h1>
        <p style={{ color: "var(--ink-3)", marginTop: -8, marginBottom: 24 }}>
          One row per assigned cohort with rolling readiness deltas. Drill into a
          cohort for topic heatmap, trend chart, engagement and assignment
          compliance.
        </p>
        {error && <Pill tone="danger">Error: {error}</Pill>}
        {!cohorts ? (
          <SkeletonRows count={5} />
        ) : cohorts.length === 0 ? (
          <p style={{ color: "var(--ink-3)" }}>
            No cohorts assigned yet. Once an institution admin assigns you to a
            cohort, it will appear here.
          </p>
        ) : (
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Students</th>
                <th>Avg readiness</th>
                <th>Δ 7d</th>
                <th>Δ 30d</th>
                <th>At risk</th>
                <th>Top quartile</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohortId}>
                  <td>
                    <code>{c.cohortId.slice(0, 8)}…</code>
                  </td>
                  <td>{c.nStudents}</td>
                  <td>{Math.round(c.avgReadiness * 100)}%</td>
                  <td style={{ color: c.deltaReadiness7d >= 0 ? "var(--good)" : "var(--bad)" }}>
                    {c.deltaReadiness7d >= 0 ? "+" : ""}
                    {(c.deltaReadiness7d * 100).toFixed(1)}%
                  </td>
                  <td style={{ color: c.deltaReadiness30d >= 0 ? "var(--good)" : "var(--bad)" }}>
                    {c.deltaReadiness30d >= 0 ? "+" : ""}
                    {(c.deltaReadiness30d * 100).toFixed(1)}%
                  </td>
                  <td>
                    {c.nAtRisk > 0 ? (
                      <Pill tone="danger">{c.nAtRisk}</Pill>
                    ) : (
                      <span style={{ color: "var(--ink-3)" }}>0</span>
                    )}
                  </td>
                  <td>{c.nTopQuartile}</td>
                  <td>
                    <Link to={`/teacher/cohorts/${c.cohortId}`}>Open →</Link>
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