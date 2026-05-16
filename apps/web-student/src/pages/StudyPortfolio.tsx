import { useEffect, useMemo, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";

// ────────────────────────────────────────────────────────────────────
// Study Portfolio — Phase B2.
//
// Robinhood/Zerodha-style asset-allocation view of the user's study
// effort. For each yield bucket (High / Medium / Low) we show current
// mastery-weighted share vs the optimal share derived from base_yield.
// The "Rebalance my plan" CTA hands off to IGS's daily-plan generator
// which will weight under-invested buckets harder.
// ────────────────────────────────────────────────────────────────────

interface Bucket {
  bucket: "High" | "Medium" | "Low";
  currentMasteryShare: number;
  optimalShare: number;
  delta: number;
}

interface PortfolioResp {
  userId: string;
  examId: string;
  buckets: Bucket[];
  reallocationHint: string;
}

export function StudyPortfolio() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Array<{ examId: string; name?: string }>>([]);
  const [selectedExam, setSelectedExam] = useState<string>("");
  const [data, setData] = useState<PortfolioResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (!r.ok) throw new Error(`profile HTTP ${r.status}`);
        const profile = await r.json();
        const list = (profile?.exams || []) as Array<{ examId: string }>;
        setExams(list);
        if (list.length && !selectedExam) setSelectedExam(list[0].examId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load profile");
      }
    })();
  }, []);

  useEffect(() => {
    if (!user?.id || !selectedExam) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/pce/${user.id}/portfolio?exam_id=${selectedExam}`,
        );
        if (!r.ok) throw new Error(`portfolio HTTP ${r.status}`);
        const d = (await r.json()) as PortfolioResp;
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load portfolio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, selectedExam]);

  const empty = useMemo(() => !loading && data?.buckets?.length === 0, [loading, data]);

  async function rebalance() {
    if (!user?.id || !selectedExam) return;
    setRecomputing(true);
    try {
      await auth.fetch(`/api/v1/pce/${user.id}/recompute?exam_id=${selectedExam}`, {
        method: "POST",
      });
      const r = await auth.fetch(
        `/api/v1/pce/${user.id}/portfolio?exam_id=${selectedExam}`,
      );
      if (r.ok) setData(await r.json());
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <AppShell title="Study Portfolio">
      <header style={{ marginBottom: 16 }}>
        <div style={eyebrow}>◈ STUDY PORTFOLIO</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 4px" }}>
          Where is your effort going?
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-2, #B8C5E0)", margin: 0 }}>
          Compare your current mastery allocation against the optimal mix for the
          forecast year. Buckets with a positive Δ are under-invested.
        </p>
      </header>

      {exams.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "var(--ink-4, #7A8BAD)" }}>Exam: </label>
          <select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
            style={{ padding: "4px 8px", background: "var(--card)", color: "inherit", border: "1px solid var(--card)", borderRadius: 4 }}
          >
            {exams.map((e) => (
              <option key={e.examId} value={e.examId}>{e.name || e.examId}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <section style={cardStyle}>
          <p style={{ color: "var(--bad, #FF5C7A)", fontSize: 13 }}>{error}</p>
        </section>
      )}

      {loading && !data && (
        <section style={cardStyle}>
          <div style={{ height: 120, background: "var(--card)", borderRadius: 6 }} />
        </section>
      )}

      {empty && (
        <section style={cardStyle}>
          <p style={{ fontSize: 13 }}>
            No portfolio data yet.{" "}
            <button type="button" className="btn btn-primary" onClick={rebalance} disabled={recomputing}>
              {recomputing ? "Computing…" : "Compute now"}
            </button>
          </p>
        </section>
      )}

      {data && data.buckets.length > 0 && (
        <>
          <section style={cardStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Column
                title="Current allocation"
                subtitle="Mastery-weighted share of effort"
                buckets={data.buckets}
                kind="current"
              />
              <Column
                title="Optimal allocation"
                subtitle="Based on forecast yield"
                buckets={data.buckets}
                kind="optimal"
              />
            </div>
          </section>

          <section style={cardStyle}>
            <div style={eyebrow}>◈ REBALANCE HINT</div>
            <p style={{ marginTop: 8, fontSize: 14, color: "var(--ink, #EEF2FF)" }}>
              {data.reallocationHint}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              onClick={rebalance}
              disabled={recomputing}
            >
              {recomputing ? "Rebalancing…" : "Rebalance my plan →"}
            </button>
            <p style={{ marginTop: 8, fontSize: 11, color: "var(--ink-4, #7A8BAD)" }}>
              Re-runs PCE; today's plan will pick up the new weights on the next IGS recompute.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}

function Column(props: { title: string; subtitle: string; buckets: Bucket[]; kind: "current" | "optimal" }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink, #EEF2FF)" }}>
        {props.title}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-4, #7A8BAD)", marginBottom: 10 }}>
        {props.subtitle}
      </div>
      {props.buckets.map((b) => {
        const value = props.kind === "current" ? b.currentMasteryShare : b.optimalShare;
        const color = b.bucket === "High" ? "#22D4EE" : b.bucket === "Medium" ? "#FFA94D" : "#7A8BAD";
        const widthPct = Math.max(0, Math.min(100, value * 100));
        return (
          <div key={b.bucket} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>{b.bucket}-yield</span>
              <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{(value * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 8, background: "var(--card)", borderRadius: 4, overflow: "hidden", marginTop: 2 }}>
              <div style={{ width: `${widthPct}%`, height: "100%", background: color, transition: "width 250ms" }} />
            </div>
            {props.kind === "optimal" && Math.abs(b.delta) > 0.01 && (
              <div style={{ fontSize: 10, marginTop: 2, color: b.delta > 0 ? "#10C47A" : "#FF5C7A" }}>
                Δ {b.delta > 0 ? "+" : ""}{(b.delta * 100).toFixed(1)}% vs current
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 20,
  background: "var(--card)",
  border: "1px solid var(--card)",
  borderRadius: 12,
  marginBottom: 16,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
  color: "var(--gold, #22D4EE)",
};