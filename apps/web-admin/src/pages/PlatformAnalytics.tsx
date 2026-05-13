/**
 * Track 2 Sprint A6 + A7 — platform-admin business analytics.
 *
 * Nine sub-views in one page (mirrors InstituteAnalytics' tab pattern):
 *   A6 — funnels, DAU/MAU, retention, question quality, mock
 *        distributions, subscription health, tutor marketplace,
 *        cost-per-student
 *   A7 — outcome correlation (mock mastery vs self-reported real
 *        exam scores)
 */

import { useEffect, useState } from "react";

import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/primitives";
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

export function PlatformAnalytics() {
  const [tab, setTab] = useState<Tab>("funnels");
  return (
    <AppShell title="Platform Analytics">
      <main className="page" style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Platform analytics</h1>
        <p style={{ color: "var(--text-muted)", marginTop: -8, marginBottom: 16 }}>
          Business + outcome metrics across the whole platform. All data
          aggregated over your access scope; identifiable info gated behind
          existing audit log.
        </p>
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
      </main>
    </AppShell>
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
  const max = Math.max(1, ...steps.map((s) => s.userCount));
  return (
    <div>
      <RangePicker days={days} setDays={setDays} options={[7, 30, 90]} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        {steps.map((s) => (
          <div key={s.event} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 160, fontSize: 13 }}>{prettyEvent(s.event)}</div>
            <div
              style={{
                flex: 1,
                background: "var(--bg-surface-3)",
                borderRadius: 4,
                height: 22,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${(s.userCount / max) * 100}%`,
                  background: "var(--color-ai)",
                  height: "100%",
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ width: 80, textAlign: "right", fontWeight: 700 }}>{s.userCount}</div>
          </div>
        ))}
      </div>
    </div>
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
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
      <Stat label="DAU" value={data.dau} />
      <Stat label="WAU" value={data.wau} />
      <Stat label="MAU" value={data.mau} />
      <Stat
        label="Stickiness (DAU/MAU)"
        value={`${Math.round(data.stickiness * 100)}%`}
        hint="Industry healthy: 20%+; sticky: 50%+"
      />
    </div>
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
  if (cohorts.length === 0) return <p style={{ color: "var(--text-muted)" }}>No cohorts yet.</p>;
  return (
    <table className="leaderboard">
      <thead>
        <tr>
          <th>Signup week</th>
          <th>Cohort size</th>
          <th>Week-1 retained</th>
          <th>Retention</th>
        </tr>
      </thead>
      <tbody>
        {cohorts.map((c) => (
          <tr key={c.week ?? "unknown"}>
            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.week ?? "—"}</td>
            <td>{c.cohortSize}</td>
            <td>{c.week1Retained}</td>
            <td>{Math.round(c.week1Retention * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  if (rows.length === 0) return <p style={{ color: "var(--text-muted)" }}>No item-response data yet.</p>;
  return (
    <div>
      <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
        Top {rows.length} most-served questions, with average accuracy. Items below 30% or
        above 95% accuracy are likely too hard or too easy.
      </p>
      <table className="leaderboard">
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
                <td>{r.exposure}</td>
                <td>{pct}%</td>
                <td><Pill tone={verdict.tone}>{verdict.text}</Pill></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Mock distributions ────────────────────────────────────

function MockDistributionsTab() {
  const [examCode, setExamCode] = useState("NEET");
  const [buckets, setBuckets] = useState<MockBucket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.mockDistributions(examCode)
      .then((d) => setBuckets(d.buckets))
      .catch((e) => setError(String(e)));
  }, [examCode]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["NEET", "JEE_MAIN", "UPSC_CSE", "CBSE", "CAT"].map((code) => (
          <button
            key={code}
            onClick={() => setExamCode(code)}
            style={{
              background: examCode === code ? "var(--color-ai)" : "var(--bg-surface-1)",
              color: examCode === code ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {code}
          </button>
        ))}
      </div>
      {!buckets ? (
        <SkeletonRows count={5} />
      ) : buckets.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No mock attempts yet for {examCode}.</p>
      ) : (
        <Histogram buckets={buckets} />
      )}
    </div>
  );
}

function Histogram({ buckets }: { buckets: MockBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.n));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 240, padding: "12px 0" }}>
      {buckets.map((b) => (
        <div
          key={b.bucket}
          title={`Score ${b.bucket}: ${b.n} attempts`}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
        >
          <div
            style={{
              width: 24,
              height: `${(b.n / max) * 200}px`,
              background: "var(--color-ai)",
              borderRadius: "3px 3px 0 0",
            }}
          />
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{b.bucket}</div>
        </div>
      ))}
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
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Stat label="Active subscriptions" value={data.activeSubscriptions} />
        <Stat label="Premium this month" value={data.premiumThisMonth} />
        <Stat label="Churn (30d)" value={data.churnLast30d} />
        <Stat label="Upgrade rate (30d)" value={`${Math.round(data.upgradeRateLast30d * 100)}%`} />
      </div>
      {data.note && <Banner tone="muted">{data.note}</Banner>}
    </div>
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
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Stat label="Sessions (30d)" value={data.sessionsLast30d} />
        <Stat label="Avg rating" value={data.avgRating.toFixed(2)} />
        <Stat label="Revenue (₹)" value={`₹${(data.totalRevenuePaise / 100).toFixed(0)}`} />
      </div>
      {data.note && <Banner tone="muted">{data.note}</Banner>}
    </div>
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
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Stat label="DAU" value={data.dau} />
        <Stat label="LLM spend / mo" value={`$${data.estLlmCostUsdMonthly.toFixed(2)}`} />
        <Stat label="Infra / mo" value={`$${data.estInfraCostUsdMonthly.toFixed(2)}`} />
        <Stat label="Cost / student / mo" value={`$${data.costPerStudentUsd.toFixed(2)}`} />
      </div>
      {data.note && <Banner tone="muted">{data.note}</Banner>}
    </div>
  );
}

// ── Outcomes (Sprint A7) ──────────────────────────────────

function OutcomesTab() {
  const [examCode, setExamCode] = useState("NEET");
  const [data, setData] = useState<OutcomeCorrelation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformAnalytics.outcomeCorrelation(examCode).then(setData).catch((e) => setError(String(e)));
  }, [examCode]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["NEET", "JEE_MAIN", "UPSC_CSE", "CBSE", "CAT"].map((code) => (
          <button
            key={code}
            onClick={() => setExamCode(code)}
            style={{
              background: examCode === code ? "var(--color-ai)" : "var(--bg-surface-1)",
              color: examCode === code ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {code}
          </button>
        ))}
      </div>
      {!data ? (
        <SkeletonRows count={3} />
      ) : data.hidden ? (
        <Banner tone="muted">
          Outcome correlation hidden — {data.reason ?? "insufficient data"}.
          {data.minRequired && ` Minimum ${data.minRequired} samples required, have ${data.n ?? 0}.`}
        </Banner>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <Stat label="Sample size" value={data.n ?? 0} />
            <Stat label="r²" value={(data.r2 ?? 0).toFixed(3)} hint="Higher = mock predicts real exam better" />
            <Stat label="Slope" value={(data.slope ?? 0).toFixed(2)} />
            <Stat label="Intercept" value={(data.intercept ?? 0).toFixed(2)} />
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
            Each point: a student's last-30-day mastery (x) vs their self-reported real-exam
            score (y). Self-reported data — treat as best-effort.
          </p>
          {data.samples && data.samples.length > 0 && (
            <Scatter points={data.samples} slope={data.slope ?? 0} intercept={data.intercept ?? 0} />
          )}
        </div>
      )}
    </div>
  );
}

function Scatter({ points, slope, intercept }: { points: { mastery: number; realScore: number }[]; slope: number; intercept: number }) {
  const w = 600;
  const h = 240;
  const pad = 32;
  const xs = points.map((p) => p.mastery);
  const ys = points.map((p) => p.realScore);
  const xMin = Math.min(0, ...xs);
  const xMax = Math.max(1, ...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(1, ...ys);
  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (w - pad * 2);
  const sy = (y: number) => h - pad - ((y - yMin) / (yMax - yMin)) * (h - pad * 2);
  return (
    <svg width={w} height={h} style={{ marginTop: 12 }} role="img" aria-label="Mock vs real-exam scatter">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--border-default)" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="var(--border-default)" />
      {/* regression line */}
      <line
        x1={sx(xMin)} y1={sy(intercept + slope * xMin)}
        x2={sx(xMax)} y2={sy(intercept + slope * xMax)}
        stroke="var(--color-ai)" strokeWidth={2} strokeDasharray="6 4"
      />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.mastery)} cy={sy(p.realScore)} r={3} fill="var(--color-blue)" opacity={0.6} />
      ))}
      <text x={pad} y={pad - 6} fill="var(--text-muted)" fontSize={11}>real score</text>
      <text x={w - pad} y={h - 4} fill="var(--text-muted)" fontSize={11} textAnchor="end">mastery</text>
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="card" style={{ padding: 16, border: "1px solid var(--border-default)", borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

function RangePicker({ days, setDays, options }: { days: number; setDays: (n: number) => void; options: number[] }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map((d) => (
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
  );
}
