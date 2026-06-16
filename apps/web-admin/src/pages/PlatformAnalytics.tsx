/**
 * Track 2 Sprint A6 + A7 — platform-admin business analytics.
 *
 * Nine sub-views in one page (mirrors InstituteAnalytics' tab pattern):
 *   A6 — funnels, DAU/MAU, retention, question quality, mock
 *        distributions, subscription health, tutor marketplace,
 *        cost-per-student
 *   A7 — outcome correlation (mock mastery vs self-reported real
 *        exam scores)
 *
 * Built on the Vidya admin design system (StatCard / SectionHeader /
 * data-table). Primary accent is ink — green/gold/red are reserved
 * for semantic verdicts only.
 */

import { useEffect, useState } from "react";

import { AdminShell } from "../components/AdminShell";
import { Banner, Pill, SectionHeader, SkeletonRows, StatCard } from "../components/primitives";
import {
  platformAnalytics,
  type FunnelStep,
  type DauMau,
  type RetentionCohort,
  type QuestionQualityRow,
  type MockBucket,
  type OutcomeCorrelation,
} from "../lib/analytics-api";

type Tab =
  | "funnels"
  | "dau-mau"
  | "retention"
  | "question-quality"
  | "mocks"
  | "subscriptions"
  | "marketplace"
  | "cost"
  | "outcomes";

const EXAM_CODES = ["NEET", "JEE_MAIN", "UPSC_CSE", "CBSE", "CAT"];

export function PlatformAnalytics() {
  const [tab, setTab] = useState<Tab>("funnels");
  return (
    <AdminShell
      crumbs="Platform Analytics"
      title="Platform analytics"
      subtitle="Business + outcome metrics across the whole platform. All data aggregated over your access scope; identifiable info gated behind existing audit log."
    >
      <TabBar tab={tab} setTab={setTab} />
      {tab === "funnels" && <FunnelsTab />}
      {tab === "dau-mau" && <DauMauTab />}
      {tab === "retention" && <RetentionTab />}
      {tab === "question-quality" && <QuestionQualityTab />}
      {tab === "mocks" && <MockDistributionsTab />}
      {tab === "subscriptions" && <SubscriptionsTab />}
      {tab === "marketplace" && <MarketplaceTab />}
      {tab === "cost" && <CostTab />}
      {tab === "outcomes" && <OutcomesTab />}
    </AdminShell>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "funnels", label: "Funnels" },
    { key: "dau-mau", label: "DAU / MAU" },
    { key: "retention", label: "Retention" },
    { key: "question-quality", label: "Question quality" },
    { key: "mocks", label: "Mock distributions" },
    { key: "subscriptions", label: "Subscriptions" },
    { key: "marketplace", label: "Marketplace" },
    { key: "cost", label: "Cost / student" },
    { key: "outcomes", label: "Outcomes" },
  ];
  return (
    <div className="pa-tabbar">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`pa-tab${tab === t.key ? " pa-tab--on" : ""}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Funnels ────────────────────────────────────────────────

function FunnelsTab() {
  const [steps, setSteps] = useState<FunnelStep[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.funnels(days).then((d) => setSteps(d.steps)).catch((e) => setError(String(e)));
  }, [days]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!steps) return <SkeletonRows count={5} />;
  const top = Math.max(1, steps[0]?.userCount ?? 0);
  return (
    <section className="dash-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <SectionHeader label="Activation funnel" count={`${steps.length} steps`} />
        <Segmented
          value={String(days)}
          options={[7, 30, 90].map((d) => ({ value: String(d), label: `${d}d` }))}
          onChange={(v) => setDays(Number(v))}
        />
      </div>
      <div className="pa-chart">
        <div className="pa-funnel">
          {steps.map((s, i) => {
            const ofTop = Math.round((s.userCount / top) * 100);
            const prev = steps[i - 1]?.userCount ?? 0;
            const drop = i > 0 && prev > 0 ? Math.round((1 - s.userCount / prev) * 100) : null;
            return (
              <div key={s.event} className="pa-funnel__row">
                <div>
                  <span className="pa-funnel__label">{prettyEvent(s.event)}</span>
                  {drop != null && <span className="pa-funnel__drop">↓ {drop}% from previous</span>}
                </div>
                <div className="pa-funnel__track">
                  <div className="pa-funnel__fill" style={{ width: `${ofTop}%` }} />
                  <span className="pa-funnel__pct">{ofTop}%</span>
                </div>
                <div className="pa-funnel__count">{s.userCount.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function prettyEvent(e: string): string {
  return e.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── DAU / MAU ──────────────────────────────────────────────

function DauMauTab() {
  const [data, setData] = useState<DauMau | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.dauMau().then(setData).catch((e) => setError(String(e)));
  }, []);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  const sticky = Math.round(data.stickiness * 100);
  return (
    <section className="dash-section">
      <SectionHeader label="Active users" />
      <div className="stat-grid">
        <StatCard label="DAU" value={data.dau.toLocaleString()} />
        <StatCard label="WAU" value={data.wau.toLocaleString()} />
        <StatCard label="MAU" value={data.mau.toLocaleString()} />
        <StatCard
          label="Stickiness · DAU/MAU"
          value={`${sticky}%`}
          tone={sticky >= 50 ? "success" : sticky >= 20 ? "warning" : "muted"}
          hint="Healthy ≥ 20% · Sticky ≥ 50%"
        />
      </div>
    </section>
  );
}

// ── Retention ──────────────────────────────────────────────

function RetentionTab() {
  const [cohorts, setCohorts] = useState<RetentionCohort[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.retention(8).then((d) => setCohorts(d.cohorts)).catch((e) => setError(String(e)));
  }, []);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!cohorts) return <SkeletonRows count={5} />;
  if (cohorts.length === 0) return <Banner tone="muted">No cohorts yet.</Banner>;
  return (
    <section className="dash-section">
      <SectionHeader label="Week-1 retention by cohort" count={`${cohorts.length} cohorts`} />
      <table className="data-table">
        <thead>
          <tr>
            <th>Signup week</th>
            <th>Cohort size</th>
            <th>Week-1 retained</th>
            <th>Retention</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => {
            const pct = Math.round(c.week1Retention * 100);
            return (
              <tr key={c.week ?? "unknown"}>
                <td><code>{c.week ?? "—"}</code></td>
                <td>{c.cohortSize}</td>
                <td>{c.week1Retained}</td>
                <td><Meter pct={pct} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ── Question quality ──────────────────────────────────────

function QuestionQualityTab() {
  const [rows, setRows] = useState<QuestionQualityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.questionQuality(50).then((d) => setRows(d.items)).catch((e) => setError(String(e)));
  }, []);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!rows) return <SkeletonRows count={8} />;
  if (rows.length === 0) return <Banner tone="muted">No item-response data yet.</Banner>;
  return (
    <section className="dash-section">
      <SectionHeader label="Item difficulty" count={`top ${rows.length} by exposure`} />
      <p className="dash-lede">
        Most-served questions with average accuracy. Items below 30% are likely too hard;
        above 95%, too easy.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Exposure</th>
            <th>Accuracy</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = Math.round(r.accuracy * 100);
            const verdict = pct < 30 ? { text: "Too hard", tone: "danger" as const } :
              pct > 95 ? { text: "Too easy", tone: "warning" as const } :
              { text: "Healthy", tone: "success" as const };
            return (
              <tr key={r.questionId}>
                <td><code>{r.questionId.slice(0, 8)}</code></td>
                <td>{r.exposure.toLocaleString()}</td>
                <td><Meter pct={pct} tone={verdict.tone} /></td>
                <td><Pill tone={verdict.tone}>{verdict.text}</Pill></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ── Mock distributions ────────────────────────────────────

function MockDistributionsTab() {
  const [examCode, setExamCode] = useState("NEET");
  const [buckets, setBuckets] = useState<MockBucket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setBuckets(null);
    platformAnalytics.mockDistributions(examCode)
      .then((d) => setBuckets(d.buckets))
      .catch((e) => setError(String(e)));
  }, [examCode]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  return (
    <section className="dash-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <SectionHeader label="Mock score distribution" />
        <ExamPicker value={examCode} onChange={setExamCode} />
      </div>
      {!buckets ? (
        <SkeletonRows count={5} />
      ) : buckets.length === 0 ? (
        <Banner tone="muted">No mock attempts yet for {examCode}.</Banner>
      ) : (
        <div className="pa-chart">
          <Histogram buckets={buckets} />
        </div>
      )}
    </section>
  );
}

function Histogram({ buckets }: { buckets: MockBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.n));
  return (
    <div>
      <div className="pa-hist">
        {buckets.map((b) => (
          <div key={b.bucket} className="pa-hist__col" title={`Score ${b.bucket}: ${b.n} attempts`}>
            <div className="pa-hist__n">{b.n || ""}</div>
            <div className="pa-hist__bar" style={{ height: `${(b.n / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="pa-hist__axis">
        {buckets.map((b) => (
          <div key={b.bucket} className="pa-hist__x">{b.bucket}</div>
        ))}
      </div>
    </div>
  );
}

// ── Subscriptions ─────────────────────────────────────────

function SubscriptionsTab() {
  const [data, setData] = useState<{ activeSubscriptions: number; premiumThisMonth: number; churnLast30d: number; upgradeRateLast30d: number; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.subscriptionHealth().then(setData).catch((e) => setError(String(e)));
  }, []);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  return (
    <section className="dash-section">
      <SectionHeader label="Subscription health" />
      <div className="stat-grid">
        <StatCard label="Active subscriptions" value={data.activeSubscriptions.toLocaleString()} />
        <StatCard label="Premium this month" value={data.premiumThisMonth.toLocaleString()} />
        <StatCard label="Churn · 30d" value={data.churnLast30d.toLocaleString()} />
        <StatCard label="Upgrade rate · 30d" value={`${Math.round(data.upgradeRateLast30d * 100)}%`} />
      </div>
      {data.note && <Banner tone="muted">{data.note}</Banner>}
    </section>
  );
}

// ── Tutor marketplace ─────────────────────────────────────

function MarketplaceTab() {
  const [data, setData] = useState<{ sessionsLast30d: number; avgRating: number; totalRevenuePaise: number; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.tutorMarketplace().then(setData).catch((e) => setError(String(e)));
  }, []);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  return (
    <section className="dash-section">
      <SectionHeader label="Tutor marketplace" />
      <div className="stat-grid">
        <StatCard label="Sessions · 30d" value={data.sessionsLast30d.toLocaleString()} />
        <StatCard label="Avg rating" value={data.avgRating.toFixed(2)} hint="out of 5.00" />
        <StatCard label="Revenue" value={`₹${(data.totalRevenuePaise / 100).toLocaleString()}`} />
      </div>
      {data.note && <Banner tone="muted">{data.note}</Banner>}
    </section>
  );
}

// ── Cost / student ────────────────────────────────────────

function CostTab() {
  const [data, setData] = useState<{ dau: number; estLlmCostUsdMonthly: number; estInfraCostUsdMonthly: number; costPerStudentUsd: number; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.costPerStudent().then(setData).catch((e) => setError(String(e)));
  }, []);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  return (
    <section className="dash-section">
      <SectionHeader label="Unit economics" />
      <div className="stat-grid">
        <StatCard label="DAU" value={data.dau.toLocaleString()} />
        <StatCard label="LLM spend / mo" value={`$${data.estLlmCostUsdMonthly.toFixed(2)}`} />
        <StatCard label="Infra / mo" value={`$${data.estInfraCostUsdMonthly.toFixed(2)}`} />
        <StatCard
          label="Cost / student / mo"
          value={`$${data.costPerStudentUsd.toFixed(2)}`}
          hint="LLM + infra ÷ DAU"
        />
      </div>
      {data.note && <Banner tone="muted">{data.note}</Banner>}
    </section>
  );
}

// ── Outcomes (Sprint A7) ──────────────────────────────────

function OutcomesTab() {
  const [examCode, setExamCode] = useState("NEET");
  const [data, setData] = useState<OutcomeCorrelation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    platformAnalytics.outcomeCorrelation(examCode).then(setData).catch((e) => setError(String(e)));
  }, [examCode]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  return (
    <section className="dash-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <SectionHeader label="Mock → real-exam correlation" />
        <ExamPicker value={examCode} onChange={setExamCode} />
      </div>
      {!data ? (
        <SkeletonRows count={3} />
      ) : data.hidden ? (
        <Banner tone="muted">
          Outcome correlation hidden — {data.reason ?? "insufficient data"}.
          {data.minRequired && ` Minimum ${data.minRequired} samples required, have ${data.n ?? 0}.`}
        </Banner>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Sample size" value={data.n ?? 0} />
            <StatCard label="r²" value={(data.r2 ?? 0).toFixed(3)} hint="Higher = mock predicts real exam better" />
            <StatCard label="Slope" value={(data.slope ?? 0).toFixed(2)} />
            <StatCard label="Intercept" value={(data.intercept ?? 0).toFixed(2)} />
          </div>
          <p className="dash-lede">
            Each point: a student's last-30-day mastery (x) vs their self-reported real-exam
            score (y). Self-reported data — treat as best-effort.
          </p>
          {data.samples && data.samples.length > 0 && (
            <div className="pa-chart">
              <Scatter points={data.samples} slope={data.slope ?? 0} intercept={data.intercept ?? 0} />
              <div className="pa-caption">
                <span className="pa-caption__swatch" />
                Regression line · slope {(data.slope ?? 0).toFixed(2)}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Scatter({ points, slope, intercept }: { points: { mastery: number; realScore: number }[]; slope: number; intercept: number }) {
  const w = 600;
  const h = 240;
  const pad = 36;
  const xs = points.map((p) => p.mastery);
  const ys = points.map((p) => p.realScore);
  const xMin = Math.min(0, ...xs);
  const xMax = Math.max(1, ...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(1, ...ys);
  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (w - pad * 2);
  const sy = (y: number) => h - pad - ((y - yMin) / (yMax - yMin)) * (h - pad * 2);
  const grid = [0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Mock vs real-exam scatter">
      {/* gridlines */}
      {grid.map((g) => (
        <line key={`gy${g}`} x1={pad} y1={sy(g)} x2={w - pad} y2={sy(g)} stroke="var(--rule)" strokeDasharray="2 4" />
      ))}
      {/* axes */}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--rule-2)" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="var(--rule-2)" />
      {/* regression line */}
      <line
        x1={sx(xMin)} y1={sy(intercept + slope * xMin)}
        x2={sx(xMax)} y2={sy(intercept + slope * xMax)}
        stroke="var(--ink)" strokeWidth={2} strokeDasharray="6 4"
      />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.mastery)} cy={sy(p.realScore)} r={3.5} fill="var(--info)" opacity={0.55} />
      ))}
      <text x={pad} y={pad - 8} fill="var(--ink-4)" fontSize={11} fontFamily="var(--font-mono)">real score →</text>
      <text x={w - pad} y={h - 6} fill="var(--ink-4)" fontSize={11} fontFamily="var(--font-mono)" textAnchor="end">mastery →</text>
    </svg>
  );
}

// ── Shared controls ───────────────────────────────────────

function Meter({ pct, tone }: { pct: number; tone?: "success" | "warning" | "danger" }) {
  const cls = tone === "success" ? " pa-meter__fill--good" :
    tone === "warning" ? " pa-meter__fill--warn" :
    tone === "danger" ? " pa-meter__fill--bad" : "";
  return (
    <span className="pa-meter">
      <span className="pa-meter__track">
        <span className={`pa-meter__fill${cls}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="pa-meter__val">{pct}%</span>
    </span>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`seg__btn${value === o.value ? " seg__btn--on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ExamPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Segmented
      value={value}
      options={EXAM_CODES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))}
      onChange={onChange}
    />
  );
}
