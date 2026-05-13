/**
 * Track 2 Sprint A3 — per-cohort deep-dive.
 *
 * Single page hosting four sub-views the teacher needs at the cohort
 * level: topic heatmap, trend chart, engagement table, and
 * assignment compliance. We wrap them in a tab strip so a teacher
 * doesn't need to navigate across four screens — same data, less
 * router churn.
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Pill, SkeletonRows } from "../components/primitives";
import {
  teacherAnalytics,
  type TopicHeatmapRow,
  type CohortTrendPoint,
  type CohortStudentEngagement,
} from "../lib/analytics-api";
// Phase 1C — common-mistakes / lesson-plan / compare-students.
import {
  CommonMistakesTab,
  LessonPlanTab,
  CompareStudentsTab,
} from "./cohort_phase1c";

type Tab =
  | "heatmap"
  | "trend"
  | "engagement"
  | "assignments"
  | "mistakes"
  | "lesson"
  | "compare";

export function CohortDeepDive() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const [tab, setTab] = useState<Tab>("heatmap");

  if (!cohortId) {
    return (
      <AppShell title="Cohort">
        <main className="page" style={{ padding: 24 }}>
          <Pill tone="danger">Missing cohort id in URL.</Pill>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Cohort ${cohortId.slice(0, 8)}`}>
      <main className="page" style={{ padding: 24 }}>
        <Link to="/teacher/dashboard" style={{ color: "var(--text-muted)", fontSize: 12 }}>
          ← Back to dashboard
        </Link>
        <h1 style={{ marginTop: 12 }}>
          Cohort <code>{cohortId.slice(0, 8)}</code>
        </h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <TabButton active={tab === "heatmap"} onClick={() => setTab("heatmap")}>
            Topic heatmap
          </TabButton>
          <TabButton active={tab === "trend"} onClick={() => setTab("trend")}>
            Trend
          </TabButton>
          <TabButton active={tab === "engagement"} onClick={() => setTab("engagement")}>
            Engagement
          </TabButton>
          <TabButton active={tab === "assignments"} onClick={() => setTab("assignments")}>
            Assignments
          </TabButton>
          <TabButton active={tab === "mistakes"} onClick={() => setTab("mistakes")}>
            Common mistakes
          </TabButton>
          <TabButton active={tab === "lesson"} onClick={() => setTab("lesson")}>
            Lesson plan
          </TabButton>
          <TabButton active={tab === "compare"} onClick={() => setTab("compare")}>
            Compare students
          </TabButton>
          <Link
            to={`/cohorts/${cohortId}/leaderboard`}
            style={{ marginLeft: "auto", color: "var(--color-ai)", fontSize: 13 }}
          >
            Leaderboard ↗
          </Link>
        </div>
        {tab === "heatmap" && <HeatmapTab cohortId={cohortId} />}
        {tab === "trend" && <TrendTab cohortId={cohortId} />}
        {tab === "engagement" && <EngagementTab cohortId={cohortId} />}
        {tab === "assignments" && <AssignmentsTab cohortId={cohortId} />}
        {tab === "mistakes" && <CommonMistakesTab cohortId={cohortId} />}
        {tab === "lesson" && <LessonPlanTab cohortId={cohortId} />}
        {tab === "compare" && <CompareStudentsTab cohortId={cohortId} />}
      </main>
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--color-ai)" : "var(--bg-surface-1)",
        color: active ? "#fff" : "var(--text-secondary)",
        border: "1px solid var(--border-default)",
        padding: "6px 12px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

function HeatmapTab({ cohortId }: { cohortId: string }) {
  const [rows, setRows] = useState<TopicHeatmapRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    teacherAnalytics
      .topicHeatmap(cohortId)
      .then((d) => setRows(d.topics))
      .catch((e) => setError(String(e)));
  }, [cohortId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!rows) return <SkeletonRows count={8} />;
  if (rows.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        No mastery data yet for this cohort. Once students complete some practice,
        the heatmap will populate weakest-topic-first.
      </p>
    );
  }
  return (
    <div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 0 }}>
        Per-topic class mastery, weakest first. Use this to pick what to re-teach next.
      </p>
      <table className="leaderboard">
        <thead>
          <tr>
            <th>Topic</th>
            <th>Avg mastery</th>
            <th>Students</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = Math.round(r.avgEwa * 100);
            const tone = pct >= 70 ? "var(--color-green)" : pct >= 40 ? "var(--color-blue)" : "var(--color-red)";
            return (
              <tr key={r.topicId}>
                <td>{r.topicTitle || r.topicId.slice(0, 8)}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: "var(--bg-surface-3)",
                        borderRadius: 3,
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: tone,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span style={{ color: tone, fontWeight: 700, minWidth: 36, textAlign: "right" }}>
                      {pct}%
                    </span>
                  </div>
                </td>
                <td>{r.nStudents}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrendTab({ cohortId }: { cohortId: string }) {
  const [points, setPoints] = useState<CohortTrendPoint[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    teacherAnalytics
      .trend(cohortId, days)
      .then((d) => setPoints(d.points))
      .catch((e) => setError(String(e)));
  }, [cohortId, days]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!points) return <SkeletonRows count={5} />;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[7, 30, 90].map((d) => (
          <TabButton key={d} active={days === d} onClick={() => setDays(d)}>
            {d}d
          </TabButton>
        ))}
      </div>
      {points.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No data yet for this window.</p>
      ) : (
        <SparkLine points={points} />
      )}
    </div>
  );
}

// Hand-rolled inline SVG sparkline — no chart library.
function SparkLine({ points }: { points: CohortTrendPoint[] }) {
  const w = 600;
  const h = 200;
  const pad = 24;
  const xs = points.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1));
  const vals = points.map((p) => p.avgReadiness);
  const min = Math.min(0, ...vals);
  const max = Math.max(1, ...vals);
  const ys = vals.map((v) => h - pad - ((v - min) / (max - min)) * (h - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");
  return (
    <div style={{ width: "100%", overflow: "auto" }}>
      <svg width={w} height={h} role="img" aria-label="Cohort readiness trend">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--border-default)" />
        <path d={d} fill="none" stroke="var(--color-ai)" strokeWidth={2} />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={3} fill="var(--color-ai)" />
        ))}
        <text x={pad} y={pad - 4} fill="var(--text-muted)" fontSize={11}>
          {Math.round(max * 100)}%
        </text>
        <text x={pad} y={h - pad + 14} fill="var(--text-muted)" fontSize={11}>
          {Math.round(min * 100)}%
        </text>
      </svg>
      <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
        Avg readiness — {points.length} snapshots over {points.length} day(s).
      </p>
    </div>
  );
}

function EngagementTab({ cohortId }: { cohortId: string }) {
  const [students, setStudents] = useState<CohortStudentEngagement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    teacherAnalytics
      .engagement(cohortId)
      .then((d) => setStudents(d.students))
      .catch((e) => setError(String(e)));
  }, [cohortId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!students) return <SkeletonRows count={8} />;
  if (students.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>No students in this cohort.</p>;
  }
  return (
    <table className="leaderboard">
      <thead>
        <tr>
          <th>Student</th>
          <th>Last active</th>
          <th>Sessions (30d)</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {students.map((s) => {
          const stale = !s.lastActive ||
            (Date.now() - new Date(s.lastActive).getTime()) / 86400000 > 7;
          return (
            <tr key={s.userId}>
              <td>
                <Link to={`/teacher/cohorts/${cohortId}/students/${s.userId}`}>
                  <code>{s.userId.slice(0, 8)}</code>
                </Link>
              </td>
              <td>{s.lastActive ? fmtRelative(s.lastActive) : "—"}</td>
              <td>{s.sessions30d}</td>
              <td>
                {stale ? <Pill tone="warning">Stale</Pill> : <Pill tone="success">Active</Pill>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AssignmentsTab({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<{ assignments: unknown[]; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    teacherAnalytics
      .assignmentCompliance(cohortId)
      .then((d) => setData(d))
      .catch((e) => setError(String(e)));
  }, [cohortId]);
  if (error) return <Pill tone="danger">{error}</Pill>;
  if (!data) return <SkeletonRows count={3} />;
  if (data.assignments.length === 0) {
    return (
      <div>
        <p style={{ color: "var(--text-muted)" }}>
          No assignments wired to this cohort yet.
        </p>
        {data.note && (
          <p style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
            {data.note}
          </p>
        )}
      </div>
    );
  }
  return <pre style={{ color: "var(--text-secondary)" }}>{JSON.stringify(data.assignments, null, 2)}</pre>;
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.round(ms / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}
