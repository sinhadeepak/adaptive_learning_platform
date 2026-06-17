import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import {
  Banner,
  SectionHeader,
  ServiceCard,
  StatCard,
  StatusPill,
  type StatusTone,
} from "../components/primitives";
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

function kappaTone(k: number | null): StatusTone {
  if (k === null) return "muted";
  if (k < 0.5) return "danger";
  if (k < 0.7) return "warning";
  return "success";
}

function CriterionCard({ row }: { row: CalibrationCriterionStats }) {
  const tone = row.auto_paused ? "danger" : kappaTone(row.kappa);
  return (
    <ServiceCard
      name={row.criterion}
      tone={tone}
      badge={
        <span className="badge-row">
          <StatusPill tone={kappaTone(row.kappa)}>
            κ {row.kappa === null ? "n/a" : row.kappa.toFixed(3)}
          </StatusPill>
          {row.auto_paused && <StatusPill tone="danger">Auto-paused</StatusPill>}
        </span>
      }
      detail={`${row.sample_count.toLocaleString()} samples · AI vs human`}
    >
      {row.weekly_trend.length > 0 && (
        <div className="svc-card__metrics">
          <span className="card-sublabel">Weekly trend</span>
          <div className="kappa-trend">
            {row.weekly_trend.map((w) => {
              const k = w.kappa;
              const barTone =
                k === null
                  ? "none"
                  : k < 0.5
                    ? "danger"
                    : k < 0.7
                      ? "warning"
                      : "success";
              return (
                <div
                  key={w.week_start}
                  className={`kappa-trend__bar kappa-trend__bar--${barTone}`}
                  style={{ height: Math.max(6, (k ?? 0) * 40) }}
                  title={`${w.week_start}: κ=${k?.toFixed(3) ?? "n/a"} (n=${w.sample_count})`}
                />
              );
            })}
          </div>
        </div>
      )}
    </ServiceCard>
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

  const pausedCount = data?.autoPausedCriteria.length ?? 0;

  return (
    <AdminShell
      crumbs="AI calibration dashboard · ML Eng"
      title="AI calibration"
      subtitle="Per-criterion Cohen's κ over the last 12 weeks. Criteria below the floor auto-pause AI evaluation and route 100% to human graders."
      chips={
        <>
          <span className="vidya-shell__chip">Phase 5</span>
          <span className="vidya-shell__chip">ML Eng</span>
        </>
      }
    >
      {error && <Banner tone="danger">{error}</Banner>}

      {data && (
        <div className="stat-grid">
          <StatCard label="Kappa floor" value={data.floorKappa.toFixed(2)} />
          <StatCard
            label="Auto-paused criteria"
            value={pausedCount}
            tone={pausedCount > 0 ? "danger" : "muted"}
          />
          <StatCard
            label="As of"
            value={new Date(data.asOf).toLocaleString()}
            mono
          />
        </div>
      )}

      {data && pausedCount > 0 && (
        <Banner tone="danger">
          {pausedCount} criterion(s) below κ={data.floorKappa.toFixed(2)} — AI
          evaluation auto-paused for them. ML Eng + Product alerted.
        </Banner>
      )}

      {data && (
        <section className="dash-section">
          <SectionHeader label="Per-criterion kappa" count={data.criteria.length} />
          {data.criteria.length === 0 ? (
            <Banner tone="info">
              No calibration samples in the last 12 weeks. The first weekly batch
              lands once the HYBRID evaluation pipeline accumulates samples.
            </Banner>
          ) : (
            <div className="svc-grid">
              {data.criteria.map((c) => (
                <CriterionCard key={c.criterion} row={c} />
              ))}
            </div>
          )}
        </section>
      )}
    </AdminShell>
  );
}
