import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill, SectionHeader, StatCard } from "../components/primitives";
import {
  cost,
  type CostDashboardResponse,
  type CostRollup,
} from "../lib/phase5-api";

// ─────────────────────────────────────────────────────────────────────────
// CE-503 — AI cost dashboard.
// Wraps GET /admin/ai-cost (P5-S45). Rolling spend per touchpoint /
// provider / creator across day / week / month. Surfaces budget alerts
// at 80% / 95% thresholds.
// ─────────────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function RollupCard({ title, rollup }: { title: string; rollup: CostRollup }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.04,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
        {fmtUsd(rollup.totalUsd)}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
        {rollup.callCount.toLocaleString()} calls
      </div>
      {Object.keys(rollup.byTouchpoint).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
            By touchpoint
          </div>
          {Object.entries(rollup.byTouchpoint)
            .sort(([, a], [, b]) => b - a)
            .map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 2,
                  color: "var(--ink-2)",
                }}
              >
                <span>{k}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtUsd(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function CostDashboard() {
  const [data, setData] = useState<CostDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [purgeStatus, setPurgeStatus] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setData(await cost.dashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load cost dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handlePurge() {
    setPurgeStatus("Purging…");
    try {
      const out = await cost.purgeAuditLog(90);
      setPurgeStatus(`Purged ${out.rowsDeleted} audit rows older than ${out.days} days`);
    } catch (e) {
      setPurgeStatus(e instanceof Error ? `Purge failed: ${e.message}` : "Purge failed");
    }
  }

  const topCreators = data?.month.topCreators ?? [];

  return (
    <AdminShell
      crumbs="Analyse · AI cost"
      title="AI Cost Dashboard"
      chips={
        <>
          <span className="vidya-shell__chip">Phase 5</span>
          <span className="vidya-shell__chip">Admin</span>
        </>
      }
      actions={
        <button
          onClick={() => void reload()}
          className="btn btn-ghost"
        >
          Refresh
        </button>
      }
    >
      {error && <Banner tone="danger">{error}</Banner>}
      {loading && <p className="dash-lede">Refreshing…</p>}

      {data?.alerts && data.alerts.length > 0 && (
        <section className="dash-section">
          <SectionHeader label="Budget alerts" count={data.alerts.length} />
          {data.alerts.map((a) => (
            <Banner
              key={`${a.period}-${a.thresholdPct}`}
              tone={a.thresholdPct >= 95 ? "danger" : "warning"}
            >
              <strong>{a.thresholdPct}% threshold breached</strong> ({a.period}):
              spent {fmtUsd(a.currentUsd)} of {fmtUsd(a.budgetUsd)} budget
            </Banner>
          ))}
        </section>
      )}

      {data && (
        <section className="dash-section">
          <SectionHeader label="Rolling spend" />
          <div className="stat-grid">
            <StatCard label="Today" value={fmtUsd(data.day.totalUsd)} mono />
            <StatCard label="This week" value={fmtUsd(data.week.totalUsd)} mono />
            <StatCard label="This month" value={fmtUsd(data.month.totalUsd)} mono />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
              marginTop: 16,
            }}
          >
            <RollupCard title="Today" rollup={data.day} />
            <RollupCard title="This week" rollup={data.week} />
            <RollupCard title="This month" rollup={data.month} />
          </div>
        </section>
      )}

      {topCreators.length > 0 && (
        <section className="dash-section">
          <SectionHeader label="Top creators (last 30 days)" count={topCreators.length} />
          <table className="data-table">
            <thead>
              <tr>
                <th>Creator</th>
                <th style={{ textAlign: "right" }}>Cost (USD)</th>
              </tr>
            </thead>
            <tbody>
              {topCreators.map((c) => (
                <tr key={c.creatorId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {c.creatorId}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtUsd(c.costUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section
        className="dash-section"
        style={{
          padding: 16,
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderRadius: 8,
        }}
      >
        <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--ink)" }}>
          Audit log retention
        </h3>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 12 }}>
          Drop ai_generation_jobs rows older than 90 days. Cron runs weekly; this is
          the manual override.
        </p>
        <button
          onClick={() => void handlePurge()}
          className="btn btn-primary"
        >
          Purge audit log (&gt; 90 days)
        </button>
        {purgeStatus && (
          <span style={{ marginLeft: 12, fontSize: 13 }}>
            <Pill tone={purgeStatus.startsWith("Purge failed") ? "danger" : "success"}>
              {purgeStatus}
            </Pill>
          </span>
        )}
      </section>
    </AdminShell>
  );
}
