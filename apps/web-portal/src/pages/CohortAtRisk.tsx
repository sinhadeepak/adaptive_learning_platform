// Sprint 21 (P3-S6) — Cohort-level at-risk view for educators.
//
// Educator pastes a cohort id, page lists at-risk students with their
// risk band, intervention kind, and link-through to the existing
// Sprint 13 student drill-down page. Powered by the predictive endpoint
// shipped in Sprint 20 (no UI for it then).

import { useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { analytics, type CohortAtRiskItem } from "../lib/api";

function bandColor(band: string): string {
  if (band === "HIGH") return "var(--bad, #F43F5E)";
  if (band === "MEDIUM") return "var(--info, #4F87F6)";
  return "var(--ink-3, #3E4D6A)";
}

export function CohortAtRisk() {
  const [cohortId, setCohortId] = useState("");
  const [items, setItems] = useState<CohortAtRiskItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!cohortId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await analytics.cohortAtRisk(cohortId);
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
      setItems(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Cohort at-risk students">
      <main className="page" style={{ padding: 24, maxWidth: 900 }}>
        <h1>At-risk students</h1>
        <p style={{ color: "var(--ink-3)" }}>
          Students flagged HIGH or MEDIUM risk by the predictive scorer.
          Click through to drill into a single student's mastery + activity.
        </p>

        <fieldset style={{ marginBottom: 16 }}>
          <legend>Cohort</legend>
          <label>
            Cohort ID:{" "}
            <input
              type="text"
              value={cohortId}
              onChange={(e) => setCohortId(e.target.value)}
              placeholder="paste a cohort UUID"
              style={{ width: 320 }}
            />
          </label>{" "}
          <button type="button" onClick={load} disabled={!cohortId || loading}>
            {loading ? "Loading…" : "Load"}
          </button>
        </fieldset>

        {error && <p className="banner banner-error">{error}</p>}

        {items !== null && items.length === 0 && (
          <p>No at-risk students in this cohort. ✓</p>
        )}

        {items !== null && items.length > 0 && (
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Student</th>
                <th>Risk</th>
                <th>Score</th>
                <th>Suggested intervention</th>
                <th>Computed</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.userId}>
                  <td>
                    <Link to={`/cohorts/${cohortId}/students/${it.userId}`}>
                      <code>{it.userId.slice(0, 8)}…</code>
                    </Link>
                  </td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        background: bandColor(it.riskBand),
                        color: "white",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {it.riskBand}
                    </span>
                  </td>
                  <td>{(it.score * 100).toFixed(0)}%</td>
                  <td>{it.interventionKind ?? "—"}</td>
                  <td>{it.computedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </AppShell>
  );
}