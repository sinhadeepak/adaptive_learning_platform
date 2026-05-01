import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import {
  calibration,
  type CalibrationDashboardResponse,
  type CalibrationCriterionStats,
} from "../lib/phase5-api";

// ─────────────────────────────────────────────────────────────────────────
// CE-307 — calibration dashboard.
// Wraps GET /evaluation/calibration/dashboard (P5-S47). Per-criterion
// Cohen's kappa over the last 12 weeks. Auto-pause indicator surfaces
// criteria below the kappa floor (0.7).
// ─────────────────────────────────────────────────────────────────────────

function kappaTone(k: number | null): "muted" | "danger" | "warning" | "success" {
  if (k === null) return "muted";
  if (k < 0.5) return "danger";
  if (k < 0.7) return "warning";
  return "success";
}

function CriterionCard({ row }: { row: CalibrationCriterionStats }) {
  return (
    <div
      style={{
        padding: 16,
        marginBottom: 12,
        border: row.auto_paused
          ? "2px solid var(--color-red, #f43f5e)"
          : "1px solid var(--border, #e1e5ee)",
        borderRadius: 8,
        background: "var(--bg-card, #fff)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h3 style={{ fontSize: 15, margin: 0 }}>{row.criterion}</h3>
        <div>
          <Pill tone={kappaTone(row.kappa)}>
            κ = {row.kappa === null ? "n/a" : row.kappa.toFixed(3)}
          </Pill>
          {row.auto_paused && (
            <span style={{ marginLeft: 8 }}>
              <Pill tone="danger">AUTO-PAUSED</Pill>
            </span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        {row.sample_count} samples (AI vs human)
      </div>
      {row.weekly_trend.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
            Weekly trend
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {row.weekly_trend.map((w) => {
              const k = w.kappa;
              const colour =
                k === null
                  ? "#cbd5e0"
                  : k < 0.5
                    ? "var(--color-red, #f43f5e)"
                    : k < 0.7
                      ? "var(--color-amber, #f59e0b)"
                      : "var(--color-green, #10c47a)";
              return (
                <div
                  key={w.week_start}
                  title={`${w.week_start}: κ=${k?.toFixed(3) ?? "n/a"} (n=${w.sample_count})`}
                  style={{
                    width: 12,
                    height: Math.max(8, (k ?? 0) * 40),
                    background: colour,
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CalibrationDashboard() {
  const [data, setData] = useState<CalibrationDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await calibration.dashboard(12));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load dashboard");
      }
    })();
  }, []);

  return (
    <AppShell
      title="AI Calibration Dashboard"
      chips={[{ label: "Phase 5" }, { label: "ML Eng" }]}
    >
      {error && <Banner tone="danger">{error}</Banner>}

      {data && (
        <>
          <section
            style={{
              padding: 16,
              marginBottom: 24,
              background: "var(--bg-subtle, #f8f9fc)",
              borderRadius: 8,
            }}
          >
            <div style={{ display: "flex", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>
                  Kappa floor (auto-pause)
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {data.floorKappa.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>
                  Auto-paused criteria
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {data.autoPausedCriteria.length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>
                  As of
                </div>
                <div style={{ fontSize: 14, marginTop: 6 }}>
                  {new Date(data.asOf).toLocaleString()}
                </div>
              </div>
            </div>
          </section>

          {data.autoPausedCriteria.length > 0 && (
            <Banner tone="danger">
              {data.autoPausedCriteria.length} criterion(s) below κ={data.floorKappa.toFixed(2)}
              — AI evaluation auto-paused. ML Eng + Product alerted.
            </Banner>
          )}

          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>Per-criterion kappa</h2>
            {data.criteria.length === 0 && (
              <Banner tone="info">
                No calibration samples in the last 12 weeks. The first weekly batch
                lands once the HYBRID evaluation pipeline accumulates samples.
              </Banner>
            )}
            {data.criteria.map((c) => (
              <CriterionCard key={c.criterion} row={c} />
            ))}
          </section>
        </>
      )}
    </AppShell>
  );
}
