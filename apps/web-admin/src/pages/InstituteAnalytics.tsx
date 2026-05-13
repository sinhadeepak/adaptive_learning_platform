/**
 * Track 2 Sprint A5 — institute admin dashboard.
 *
 * Single page hosting six sub-views per the implementation plan:
 *   • Overview        — headline numbers + trend sparkline
 *   • Cohorts         — sortable list with per-cohort summary
 *   • Teachers        — effectiveness ranking with caveats banner
 *   • Subjects        — subject-gap heatmap (weakest first)
 *   • Trend           — institute-wide readiness time series
 *   • Marketplace     — purchases + tutor sessions ROI (placeholder)
 *   • Benchmark       — anonymized peer-institute comparison (k-floor 5)
 *
 * All sub-views are tabs on the same route to avoid the routing
 * churn (and copy-paste) of 7 separate pages.
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/primitives";
import {
  institution,
  type InstitutionOverview,
  type InstitutionCohortRow,
  type TeacherEffectivenessRow,
  type SubjectGapRow,
  type InstitutionTrendPoint,
  type MarketplaceRoi,
  type InstitutionBenchmark,
} from "../lib/analytics-api";

type Tab =
  | "overview"
  | "cohorts"
  | "teachers"
  | "subjects"
  | "trend"
  | "marketplace"
  | "benchmark"
  | "interventions"
  | "report";

export function InstituteAnalytics() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  if (!tenantId) {
    return (
      <AppShell title="Institute">
        <main className="page" style={{ padding: 24 }}>
          <Pill tone="danger">Missing tenant id.</Pill>
        </main>
      </AppShell>
    );
  }
  return (
    <AppShell title={`Institute ${tenantId.slice(0, 8)}`}>
      <main className="page" style={{ padding: 24 }}>
        <Link to="/tenants" style={{ color: "var(--text-muted)", fontSize: 12 }}>
          ← All institutes
        </Link>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <h1 style={{ margin: 0 }}>
            Institute <code>{tenantId.slice(0, 8)}</code>
          </h1>
          {/* Phase 1A.5 — link into the six-level analytics drill scoped
              to this tenant. */}
          <Link
            to={`/analytics/drill?tenant=${encodeURIComponent(tenantId)}`}
            style={{
              padding: "8px 14px",
              background: "var(--color-blue, #4F87F6)",
              color: "white",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            🔍 Open hierarchical drill →
          </Link>
        </div>
        <TabBar tab={tab} setTab={setTab} />
        {tab === "overview" && <OverviewTab tenantId={tenantId} />}
        {tab === "cohorts" && <CohortsTab tenantId={tenantId} />}
        {tab === "teachers" && <TeachersTab tenantId={tenantId} />}
        {tab === "subjects" && <SubjectsTab tenantId={tenantId} />}
        {tab === "trend" && <TrendTab tenantId={tenantId} />}
        {tab === "marketplace" && <MarketplaceTab tenantId={tenantId} />}
        {tab === "benchmark" && <BenchmarkTab tenantId={tenantId} />}
        {tab === "interventions" && <InterventionEfficacyTab tenantId={tenantId} />}
        {tab === "report" && <OutcomesReportTab tenantId={tenantId} />}
      </main>
    </AppShell>
  );
}

// ── Phase 1C — Intervention efficacy ─────────────────────────

interface InterventionEfficacyResponse {
  tenant_id: string;
  n_interventions_total: number;
  n_fulfilled: number;
  overall_fulfillment_rate: number;
  by_action: Array<{
    action: string;
    n: number;
    fulfilled: number;
    fulfillment_rate: number;
    avg_days_to_fulfil: number | null;
    flagged_avg_ewa: number | null;
    baseline_avg_ewa: number | null;
    delta_vs_baseline: number | null;
  }>;
  notes: string[];
}

function InterventionEfficacyTab({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<InterventionEfficacyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/v1/analytics/institution/${tenantId}/intervention-efficacy`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [tenantId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  if (data.n_interventions_total === 0) {
    return (
      <div>
        <Pill tone="info">No manual interventions logged yet.</Pill>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
          {data.notes[0] ??
            "Teachers can log interventions from the cohort deep-dive panel."}
        </p>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <IeTile
          label="Total interventions"
          value={data.n_interventions_total}
          color="var(--color-ai)"
        />
        <IeTile
          label="Fulfilled"
          value={data.n_fulfilled}
          color="var(--color-green)"
        />
        <IeTile
          label="Fulfillment rate"
          value={`${Math.round(data.overall_fulfillment_rate * 100)}%`}
          color="var(--color-blue)"
        />
      </div>
      <h3 style={{ fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase" }}>
        By action
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
            <th style={ieTh}>Action</th>
            <th style={ieTh}>N</th>
            <th style={ieTh}>Fulfilled</th>
            <th style={ieTh}>Avg days</th>
            <th style={ieTh}>Flagged EWA</th>
            <th style={ieTh}>Baseline EWA</th>
            <th style={ieTh}>Δ vs baseline</th>
          </tr>
        </thead>
        <tbody>
          {data.by_action.map((r) => (
            <tr key={r.action} style={{ borderBottom: "1px solid var(--border-default)" }}>
              <td style={ieTd}>
                <Pill tone="info">{r.action}</Pill>
              </td>
              <td style={ieTd}>{r.n}</td>
              <td style={ieTd}>{r.fulfilled}</td>
              <td style={ieTd}>
                {r.avg_days_to_fulfil !== null ? `${r.avg_days_to_fulfil}d` : "—"}
              </td>
              <td style={ieTd}>
                {r.flagged_avg_ewa !== null ? r.flagged_avg_ewa.toFixed(2) : "—"}
              </td>
              <td style={ieTd}>
                {r.baseline_avg_ewa !== null ? r.baseline_avg_ewa.toFixed(2) : "—"}
              </td>
              <td
                style={{
                  ...ieTd,
                  color:
                    r.delta_vs_baseline === null
                      ? "var(--text-muted)"
                      : r.delta_vs_baseline > 0
                        ? "var(--color-green)"
                        : "var(--color-red)",
                }}
              >
                {r.delta_vs_baseline === null
                  ? "—"
                  : `${r.delta_vs_baseline > 0 ? "+" : ""}${r.delta_vs_baseline.toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IeTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        minWidth: 140,
        background: "var(--bg-surface-1)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

const ieTh: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  fontSize: 11,
  color: "var(--text-muted)",
  textTransform: "uppercase",
};

const ieTd: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
};

// ── Phase 1C — Outcomes report (PDF) ─────────────────────────

function OutcomesReportTab({ tenantId }: { tenantId: string }) {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Institute outcomes report</h3>
      <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
        A printable one-page summary: roll-up readiness, strongest/weakest
        topics, activity trend. Shareable with parents and stakeholders.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a
          href={`/api/v1/analytics/institution/${tenantId}/outcomes-report?format=pdf`}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "8px 16px",
            background: "var(--color-ai)",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ⬇ Download PDF
        </a>
        <a
          href={`/api/v1/analytics/institution/${tenantId}/outcomes-report?format=html`}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "8px 16px",
            background: "var(--bg-surface-1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          🖼 Preview HTML
        </a>
      </div>
      <p style={{ marginTop: 16, fontSize: 11, color: "var(--text-muted)" }}>
        If PDF rendering isn't available on the server, the PDF link returns an
        HTML fallback that prints to PDF in any browser.
      </p>
    </div>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "cohorts", label: "Cohorts" },
    { key: "teachers", label: "Teachers" },
    { key: "subjects", label: "Subjects" },
    { key: "trend", label: "Trend" },
    { key: "marketplace", label: "Marketplace" },
    { key: "benchmark", label: "Benchmark" },
    { key: "interventions", label: "Interventions" },
    { key: "report", label: "Outcomes report" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          style={{
            background: tab === t.key ? "var(--color-ai)" : "var(--bg-surface-1)",
            color: tab === t.key ? "#fff" : "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            padding: "6px 12px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === t.key ? 700 : 500,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Tab: Overview ────────────────────────────────────────────

function OverviewTab({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<InstitutionOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    institution.overview(tenantId).then(setData).catch((e) => setError(String(e)));
  }, [tenantId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  const tiles = [
    { label: "Students", value: data.nStudents, color: "var(--color-blue)" },
    { label: "Active in 7d", value: data.nActive7d, color: "var(--color-green)" },
    {
      label: "Avg readiness",
      value: `${Math.round(data.avgReadiness * 100)}%`,
      color: "var(--color-ai)",
    },
    {
      label: "Median readiness",
      value: `${Math.round(data.medianReadiness * 100)}%`,
      color: "var(--color-purple)",
    },
  ];
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          className="card"
          style={{ padding: 16, border: "1px solid var(--border-default)", borderRadius: 8 }}
        >
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            {t.label}
          </div>
          <div
            style={{ fontSize: 28, fontWeight: 700, color: t.color, marginTop: 4, lineHeight: 1 }}
          >
            {t.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Cohorts ───────────────────────────────────────────

function CohortsTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<InstitutionCohortRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    institution.cohorts(tenantId).then((d) => setRows(d.cohorts)).catch((e) => setError(String(e)));
  }, [tenantId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!rows) return <SkeletonRows count={5} />;
  if (rows.length === 0) return <p style={{ color: "var(--text-muted)" }}>No cohorts yet.</p>;
  return (
    <table className="leaderboard">
      <thead>
        <tr>
          <th>Cohort</th>
          <th>Avg readiness</th>
          <th>Students</th>
          <th>Active 7d</th>
          <th>Snapshot</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.cohortId}>
            <td>
              <code>{c.cohortId.slice(0, 8)}</code>
            </td>
            <td>{Math.round(c.avgReadiness * 100)}%</td>
            <td>{c.nStudents}</td>
            <td>{c.nActive7d}</td>
            <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{c.snapshotDate ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Tab: Teachers ──────────────────────────────────────────

function TeachersTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<TeacherEffectivenessRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    institution
      .teacherEffectiveness(tenantId)
      .then((d) => setRows(d.teachers))
      .catch((e) => setError(String(e)));
  }, [tenantId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!rows) return <SkeletonRows count={5} />;
  return (
    <div>
      <Banner tone="warning">
        <strong>Attribution caveats:</strong> Δ readiness reflects net cohort movement.
        Cohort intake quality, rotation, and tenure are confounders. Don't use this
        page in isolation for performance reviews.
      </Banner>
      <div style={{ height: 12 }} />
      {rows.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No teacher data yet.</p>
      ) : (
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Students</th>
              <th>Avg readiness</th>
              <th>Δ 7d</th>
              <th>Δ 30d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.educatorId}>
                <td>
                  <code>{t.educatorId.slice(0, 8)}</code>
                </td>
                <td>{t.nStudents}</td>
                <td>{Math.round(t.avgReadiness * 100)}%</td>
                <td style={{ color: t.delta7d >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                  {t.delta7d >= 0 ? "+" : ""}
                  {(t.delta7d * 100).toFixed(1)}%
                </td>
                <td style={{ color: t.delta30d >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                  {t.delta30d >= 0 ? "+" : ""}
                  {(t.delta30d * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Tab: Subjects ──────────────────────────────────────────

function SubjectsTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<SubjectGapRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    institution.subjectGaps(tenantId).then((d) => setRows(d.topics)).catch((e) => setError(String(e)));
  }, [tenantId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!rows) return <SkeletonRows count={6} />;
  if (rows.length === 0) return <p style={{ color: "var(--text-muted)" }}>No mastery data yet.</p>;
  return (
    <table className="leaderboard">
      <thead>
        <tr>
          <th>Topic</th>
          <th>Avg mastery</th>
          <th>Mastery rows</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = Math.round(r.avgEwa * 100);
          const tone = pct >= 70 ? "var(--color-green)" : pct >= 40 ? "var(--color-blue)" : "var(--color-red)";
          return (
            <tr key={r.topicId}>
              <td>
                <code>{r.topicId.slice(0, 8)}</code>
              </td>
              <td style={{ color: tone, fontWeight: 700 }}>{pct}%</td>
              <td>{r.nRows}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Tab: Trend ─────────────────────────────────────────────

function TrendTab({ tenantId }: { tenantId: string }) {
  const [points, setPoints] = useState<InstitutionTrendPoint[] | null>(null);
  const [days, setDays] = useState(90);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    institution.trend(tenantId, days).then((d) => setPoints(d.points)).catch((e) => setError(String(e)));
  }, [tenantId, days]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!points) return <SkeletonRows count={5} />;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[30, 90, 365].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              background: days === d ? "var(--color-ai)" : "var(--bg-surface-1)",
              color: days === d ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {d}d
          </button>
        ))}
      </div>
      {points.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No trend data yet.</p>
      ) : (
        <SimpleSparkline values={points.map((p) => p.avgReadiness)} />
      )}
    </div>
  );
}

// ── Tab: Marketplace ROI ───────────────────────────────────

function MarketplaceTab({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<MarketplaceRoi | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    institution.marketplaceRoi(tenantId).then(setData).catch((e) => setError(String(e)));
  }, [tenantId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <Tile label="Course purchases" value={data.coursePurchases} />
        <Tile label="Tutor sessions" value={data.tutorSessions} />
      </div>
      {data.note && (
        <p style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic", marginTop: 12 }}>
          {data.note}
        </p>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card" style={{ padding: 16, border: "1px solid var(--border-default)", borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ── Tab: Benchmark ─────────────────────────────────────────

function BenchmarkTab({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<InstitutionBenchmark | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    institution.benchmark(tenantId).then(setData).catch((e) => setError(String(e)));
  }, [tenantId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  if (data.hidden) {
    return (
      <Banner tone="muted">
        Benchmark hidden — {data.reason ?? "insufficient peer set"}.
        {data.kRequired && ` k-anonymity floor: ${data.kRequired}.`}
      </Banner>
    );
  }
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <Tile
          label="Your avg readiness"
          value={`${Math.round((data.ownAvgReadiness ?? 0) * 100)}%`}
        />
        <Tile
          label="Peer-set avg readiness"
          value={`${Math.round((data.peerAvgReadiness ?? 0) * 100)}%`}
        />
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 12 }}>
        Peer set: {data.peerCount} institutes within ±20% of your student count.
        Identifiable institute names never appear.
      </p>
    </div>
  );
}

// ── Inline sparkline ───────────────────────────────────────

function SimpleSparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const w = 600;
  const h = 200;
  const pad = 24;
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const xs = values.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1));
  const ys = values.map((v) => h - pad - ((v - min) / (max - min)) * (h - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");
  return (
    <svg width={w} height={h} role="img" aria-label="Trend">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--border-default)" />
      <path d={d} fill="none" stroke="var(--color-ai)" strokeWidth={2} />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={2.5} fill="var(--color-ai)" />
      ))}
    </svg>
  );
}
