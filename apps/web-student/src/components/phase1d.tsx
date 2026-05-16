// Phase 1D — student-facing analytics widgets:
//   <CareerOutcomeCard />, <RankTrajectoryChart />, <NationalRankCard />,
//   <VideoEngagementCard />.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";

// ── 1D-4 — Career outcomes ─────────────────────────────────────────

interface CareerOutcomeResp {
  exam_code: string;
  readiness_low: number;
  readiness_high: number;
  n_samples: number;
  hidden: boolean;
  rank_buckets: Array<{
    label: string;
    n: number;
    pct: number;
    rank_low: number | null;
    rank_high: number | null;
  }>;
  top_admits: Array<[string, number]>;
  notes: string[];
}

const RANK_LABELS: Record<string, string> = {
  under_5k: "AIR < 5K",
  "5k_15k": "AIR 5K-15K",
  "15k_50k": "AIR 15K-50K",
  over_50k: "AIR > 50K",
};

export function CareerOutcomeCard({
  examCode,
  readiness,
}: {
  examCode: string;
  readiness: number;
}) {
  const [data, setData] = useState<CareerOutcomeResp | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await auth.fetch(
        `/api/v1/analytics/career-outcomes?examCode=${examCode}&readiness=${readiness}`,
      );
      if (alive && r.ok) setData((await r.json()) as CareerOutcomeResp);
    })();
    return () => {
      alive = false;
    };
  }, [examCode, readiness]);

  if (!data) return null;
  if (data.hidden) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Career outlook · {examCode}</div>
        <p style={subStyle}>{data.notes[0] ?? "Not enough data yet."}</p>
      </div>
    );
  }
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Career outlook · {examCode}</div>
      <p style={{ ...subStyle, fontSize: 12 }}>
        Of <strong>{data.n_samples}</strong> students at readiness{" "}
        {Math.round(data.readiness_low * 100)}–{Math.round(data.readiness_high * 100)}%:
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {data.rank_buckets.map((b) => (
          <div
            key={b.label}
            style={{
              flex: "1 1 100px",
              padding: 10,
              background: "var(--card, #1a1a1a)",
              border: "1px solid var(--rule, #333)",
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase" }}>
              {RANK_LABELS[b.label] ?? b.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {Math.round(b.pct * 100)}%
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-3)" }}>n={b.n}</div>
          </div>
        ))}
      </div>
      {data.top_admits.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>
            Top admits
          </div>
          <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 12 }}>
            {data.top_admits.slice(0, 5).map(([name, n]) => (
              <li key={name}>
                {name} <span style={{ color: "var(--ink-3)" }}>· {n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── 1D-5 — Rank trajectory ────────────────────────────────────────

interface TrajectoryPoint {
  session_id: string;
  mock_date: string;
  user_score_pct: number;
  served_count: number;
  correct_count: number;
  mode: string;
}
interface TrajectoryResp {
  user_id: string;
  exam_code: string;
  points: TrajectoryPoint[];
  rolling_projection: number | null;
  p25_reference: number | null;
  p50_reference: number | null;
  p75_reference: number | null;
  notes: string[];
}

export function RankTrajectoryChart({
  userId,
  examCode,
}: {
  userId: string;
  examCode: string;
}) {
  const [data, setData] = useState<TrajectoryResp | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await auth.fetch(
        `/api/v1/analytics/mock/${examCode}/trajectory/${userId}`,
      );
      if (alive && r.ok) setData((await r.json()) as TrajectoryResp);
    })();
    return () => {
      alive = false;
    };
  }, [userId, examCode]);

  if (!data) return null;
  if (data.points.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Rank trajectory · {examCode}</div>
        <p style={subStyle}>{data.notes[0] ?? "No mocks submitted yet."}</p>
      </div>
    );
  }

  const w = 480;
  const h = 160;
  const pad = 24;
  const innerH = h - pad * 2;
  const innerW = w - pad * 2;
  const xs = data.points.map((_, i) => pad + (i / Math.max(1, data.points.length - 1)) * innerW);
  const yScale = (v: number) => pad + innerH * (1 - v / 100);

  const path = data.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${yScale(p.user_score_pct)}`)
    .join(" ");

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Rank trajectory · {examCode}</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block", marginTop: 8 }}>
        {[0, 25, 50, 75, 100].map((g) => (
          <line
            key={g}
            x1={pad}
            x2={w - pad}
            y1={yScale(g)}
            y2={yScale(g)}
            stroke="var(--rule, #333)"
            strokeWidth={0.5}
            opacity={0.4}
          />
        ))}
        {data.p25_reference !== null && (
          <line x1={pad} x2={w - pad} y1={yScale(data.p25_reference)} y2={yScale(data.p25_reference)} stroke="var(--bad, #f43f5e)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
        )}
        {data.p50_reference !== null && (
          <line x1={pad} x2={w - pad} y1={yScale(data.p50_reference)} y2={yScale(data.p50_reference)} stroke="var(--warn, #fbbf24)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
        )}
        {data.p75_reference !== null && (
          <line x1={pad} x2={w - pad} y1={yScale(data.p75_reference)} y2={yScale(data.p75_reference)} stroke="var(--good, #10C47A)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
        )}
        <path d={path} stroke="var(--gold, #4F87F6)" strokeWidth={2} fill="none" />
        {data.points.map((p, i) => (
          <circle key={i} cx={xs[i]} cy={yScale(p.user_score_pct)} r={4} fill="var(--gold, #4F87F6)">
            <title>{`${p.mock_date}: ${p.user_score_pct}%`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ ...subStyle, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span><span style={{ color: "var(--bad)" }}>──</span> AIR &gt; 50K band</span>
        <span><span style={{ color: "var(--warn)" }}>──</span> median band</span>
        <span><span style={{ color: "var(--good)" }}>──</span> AIR &lt; 5K band</span>
      </div>
      {data.rolling_projection !== null && (
        <p style={{ ...subStyle, marginTop: 8 }}>
          5-mock rolling: <strong>{data.rolling_projection.toFixed(1)}%</strong>
        </p>
      )}
    </div>
  );
}

// ── 1D-7 — National rank card ─────────────────────────────────────

interface NationalRankResp {
  user_id: string;
  exam_code: string;
  opted_in: boolean;
  rank: number | null;
  total_opt_in: number;
  percentile: number | null;
  score_pct: number | null;
  notes: string[];
}

export function NationalRankCard({
  userId,
  examCode,
}: {
  userId: string;
  examCode: string;
}) {
  const [data, setData] = useState<NationalRankResp | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await auth.fetch(
        `/api/v1/analytics/mock/${examCode}/national-rank/${userId}`,
      );
      if (alive && r.ok) setData((await r.json()) as NationalRankResp);
    })();
    return () => {
      alive = false;
    };
  }, [userId, examCode]);

  if (!data) return null;
  if (!data.opted_in) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>National rank · {examCode}</div>
        <p style={subStyle}>{data.notes[0] ?? "Opt in from your profile."}</p>
        <Link
          to="/profile"
          style={{
            display: "inline-block",
            marginTop: 6,
            color: "var(--gold)",
            fontSize: 12,
          }}
        >
          Opt in →
        </Link>
      </div>
    );
  }
  if (data.rank === null) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>National rank · {examCode}</div>
        <p style={subStyle}>{data.notes[0] ?? "Submit a mock to see your rank."}</p>
      </div>
    );
  }
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>National rank · {examCode}</div>
      <div style={bigStyle}>#{data.rank.toLocaleString()}</div>
      <div style={subStyle}>
        of {data.total_opt_in.toLocaleString()} opted-in students ·{" "}
        top {data.percentile ? (100 - data.percentile).toFixed(1) : "—"}%
      </div>
    </div>
  );
}

// ── 1D-6 — Video engagement (per-topic for student) ──────────────

interface MyViewsResp {
  items: Array<{
    resourceId: string;
    title: string;
    url: string;
    topicId: string | null;
    completed: boolean;
    eventCount: number;
    maxPositionSeconds: number;
  }>;
}

export function VideoEngagementCard({ topicId }: { topicId?: string }) {
  const [data, setData] = useState<MyViewsResp | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await auth.fetch(`/api/v1/content/resources/my-views?limit=50`);
      if (alive && r.ok) setData((await r.json()) as MyViewsResp);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;
  const items = topicId ? data.items.filter((i) => i.topicId === topicId) : data.items;
  if (items.length === 0) return null;
  const completed = items.filter((i) => i.completed).length;

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Watch history</div>
      <div style={bigStyle}>
        {completed} <span style={{ fontSize: 13, color: "var(--ink-3)" }}>completed</span>
      </div>
      <div style={subStyle}>
        of {items.length} watched · click counts contribute to mastery deltas.
      </div>
      <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: 12 }}>
        {items.slice(0, 5).map((v) => (
          <li
            key={v.resourceId}
            style={{
              padding: "4px 0",
              color: v.completed ? "var(--good)" : "var(--ink-3)",
            }}
          >
            {v.completed ? "✓" : "▶"} {v.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: "14px 16px",
  background: "var(--paper-2)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  minWidth: 0,
  width: "100%",
  boxSizing: "border-box",
};

const titleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-3)",
  textTransform: "uppercase",
  letterSpacing: 0.04,
  marginBottom: 4,
};

const bigStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "var(--ink)",
  fontVariantNumeric: "tabular-nums",
};

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--ink-3)",
  marginTop: 2,
};