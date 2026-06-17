// Sprint 21 (P3-S6) — Cohort-level at-risk view for educators.
//
// Educator pastes a cohort id, page lists at-risk students with their
// risk band, intervention kind, and link-through to the existing
// Sprint 13 student drill-down page. Powered by the predictive endpoint
// shipped in Sprint 20 (no UI for it then).

import { useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner, Pill, type PillTone } from "../components/primitives";
import { analytics, type CohortAtRiskItem } from "../lib/api";

function bandTone(band: string): PillTone {
  if (band === "HIGH") return "danger";
  if (band === "MEDIUM") return "info";
  return "muted";
}

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

        {error && (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        )}

        {items !== null && items.length === 0 && (
          <p>No at-risk students in this cohort. ✓</p>
        )}

        {items !== null && items.length > 0 && (
          <table className="data-table">
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
                    <Pill tone={bandTone(it.riskBand)}>{it.riskBand}</Pill>
                  </td>
                  <td>
                    <Meter
                      pct={Math.round(it.score * 100)}
                      tone={
                        it.riskBand === "HIGH"
                          ? "bad"
                          : it.riskBand === "MEDIUM"
                            ? "warn"
                            : undefined
                      }
                    />
                  </td>
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