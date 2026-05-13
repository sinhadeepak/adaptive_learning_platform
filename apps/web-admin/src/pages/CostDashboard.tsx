import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
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
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        background: "var(--bg-surface1)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.04,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
        {fmtUsd(rollup.totalUsd)}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {rollup.callCount.toLocaleString()} calls
      </div>
      {Object.keys(rollup.byTouchpoint).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
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
                  color: "var(--text-secondary)",
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
    <AppShell title="AI Cost Dashboard" chips={[{ label: "Phase 5" }, { label: "Admin" }]}>
      {error && <Banner tone="danger">{error}</Banner>}

      {data?.alerts && data.alerts.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Budget alerts</h2>
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
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <RollupCard title="Today" rollup={data.day} />
          <RollupCard title="This week" rollup={data.week} />
          <RollupCard title="This month" rollup={data.month} />
        </section>
      )}

      {topCreators.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Top creators (last 30 days)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "right", padding: 8 }}>Cost (USD)</th>
              </tr>
            </thead>
            <tbody>
              {topCreators.map((c) => (
                <tr
                  key={c.creatorId}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>
                    {c.creatorId}
                  </td>
                  <td
                    style={{
                      padding: 8,
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
        style={{
          marginTop: 24,
          padding: 16,
          background: "var(--bg-surface1)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          color: "var(--text-primary)",
        }}
      >
        <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--text-primary)" }}>
          Audit log retention
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Drop ai_generation_jobs rows older than 90 days. Cron runs weekly; this is
          the manual override.
        </p>
        <button
          onClick={() => void handlePurge()}
          style={{
            padding: "8px 16px",
            background: "var(--color-blue)",
            color: "white",
            border: "1px solid var(--border)",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
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

      <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)" }}>
        {loading && "Refreshing…"}
        <button
          onClick={() => void reload()}
          style={{
            marginLeft: 12,
            padding: "4px 10px",
            background: "var(--bg-surface2)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>
    </AppShell>
  );
}
