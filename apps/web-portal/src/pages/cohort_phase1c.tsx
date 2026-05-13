// Phase 1C — teacher cohort tabs:
//   <CommonMistakesTab />
//   <LessonPlanTab />
//   <CompareStudentsTab />

import { useEffect, useState } from "react";
import { Pill, SkeletonRows } from "../components/primitives";
import { auth } from "../lib/api";

interface CommonMistakesResponse {
  cohort_id: string;
  n_students: number;
  n_errors_total: number;
  classifications: Array<{
    classification: string;
    count: number;
    pct_of_errors: number;
  }>;
  top_problem_topics: Array<{
    topic_id: string;
    error_count: number;
    n_students_affected: number;
    dominant_classification: string;
  }>;
  notes: string[];
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  silly_mistake: "Silly mistakes",
  conceptual_gap: "Conceptual gap",
  time_pressure: "Time pressure",
  formula_error: "Formula error",
  sign_or_unit_error: "Sign / units",
  unattempted: "Unattempted",
};

export function CommonMistakesTab({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<CommonMistakesResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/cohorts/${cohortId}/common-mistakes`,
        );
        if (alive && r.ok) setData((await r.json()) as CommonMistakesResponse);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cohortId]);

  if (!loaded) return <SkeletonRows count={4} />;
  if (!data) return <Pill tone="warning">Couldn't load common mistakes.</Pill>;

  if (data.n_errors_total === 0) {
    return (
      <div>
        <Pill tone="info">No classified errors yet.</Pill>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
          {data.notes[0] ?? "Errors are classified after students answer practice questions."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase" }}>
        Most common mistake types · {data.n_errors_total} errors across {data.n_students} students
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        {data.classifications.slice(0, 6).map((c) => (
          <div
            key={c.classification}
            style={{
              padding: "10px 14px",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              minWidth: 140,
              background: "var(--bg-surface-1)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {CLASSIFICATION_LABEL[c.classification] ?? c.classification}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {Math.round(c.pct_of_errors * 100)}%
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {c.count} occurrences
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", marginTop: 24 }}>
        Top problem topics
      </h3>
      {data.top_problem_topics.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No topic-level patterns yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
              <th style={th}>Topic</th>
              <th style={th}>Errors</th>
              <th style={th}>Students affected</th>
              <th style={th}>Dominant pattern</th>
            </tr>
          </thead>
          <tbody>
            {data.top_problem_topics.map((t) => (
              <tr key={t.topic_id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <td style={td}>
                  <code>{t.topic_id.slice(0, 8)}</code>
                </td>
                <td style={td}>{t.error_count}</td>
                <td style={td}>{t.n_students_affected}</td>
                <td style={td}>
                  <Pill tone="warning">
                    {CLASSIFICATION_LABEL[t.dominant_classification] ?? t.dominant_classification}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface LessonPlanResponse {
  cohortId: string;
  headline: string;
  diagnosis: string;
  recommendations: Array<{
    topicId: string;
    topicTitle: string;
    rank: number;
    rationale: string;
    suggestedFormat: string;
    estMinutes: number;
  }>;
  encouragement: string;
  source: string;
}

export function LessonPlanTab({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<LessonPlanResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/adaptive/lesson-recommender?cohortId=${cohortId}`,
        );
        if (alive && r.ok) setData((await r.json()) as LessonPlanResponse);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cohortId]);

  if (!loaded) return <SkeletonRows count={4} />;
  if (!data) return <Pill tone="warning">Couldn't load lesson plan.</Pill>;

  if (data.recommendations.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: 8 }}>{data.headline}</h2>
        <p style={{ color: "var(--text-muted)" }}>{data.diagnosis}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{data.headline}</h2>
        <Pill tone={data.source === "ai" ? "info" : "muted"}>
          {data.source === "ai" ? "AI" : "heuristic"}
        </Pill>
      </div>
      <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{data.diagnosis}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.recommendations.map((r) => (
          <div
            key={r.topicId}
            style={{
              padding: "12px 16px",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              background: "var(--bg-surface-1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "var(--color-ai)" }}>#{r.rank}</span>
              <span style={{ fontWeight: 600 }}>{r.topicTitle || r.topicId.slice(0, 8)}</span>
              <Pill tone="info">{r.suggestedFormat}</Pill>
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                ~{r.estMinutes} min
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              {r.rationale}
            </p>
          </div>
        ))}
      </div>

      {data.encouragement && (
        <p style={{ marginTop: 16, fontStyle: "italic", color: "var(--text-secondary)" }}>
          {data.encouragement}
        </p>
      )}
    </div>
  );
}

interface CompareSide {
  side: string;
  label: string;
  n_topics: number;
  n_students: number;
  avg_ewa: number;
  weak_pct: number;
}

interface CompareResponse {
  side_a: CompareSide;
  side_b: CompareSide;
  diffs: Array<{
    topic_id: string;
    a_ewa: number;
    b_ewa: number;
    delta: number;
  }>;
  a_strengths: Array<{ topic_id: string; delta: number }>;
  b_strengths: Array<{ topic_id: string; delta: number }>;
  notes: string[];
}

export function CompareStudentsTab({ cohortId }: { cohortId: string }) {
  const [studentA, setStudentA] = useState("");
  const [studentB, setStudentB] = useState("");
  const [data, setData] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Array<{ userId: string; displayName?: string }>>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/institution/cohorts/${cohortId}/members`);
        if (alive && r.ok) {
          const body = (await r.json()) as Array<{ userId: string; role?: string; displayName?: string }>;
          setMembers(
            body
              .filter((m) => (m.role ?? "STUDENT") === "STUDENT")
              .map((m) => ({ userId: m.userId, displayName: m.displayName })),
          );
        }
      } catch {
        /* swallow */
      }
    })();
    return () => {
      alive = false;
    };
  }, [cohortId]);

  async function compare() {
    if (!studentA || !studentB) {
      setError("Pick both students.");
      return;
    }
    if (studentA === studentB) {
      setError("Pick two different students.");
      return;
    }
    setError(null);
    setLoading(true);
    setData(null);
    try {
      const r = await auth.fetch(
        `/api/v1/analytics/compare/students?a=${studentA}&b=${studentB}`,
      );
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        return;
      }
      setData((await r.json()) as CompareResponse);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Student A
          </label>
          <select
            value={studentA}
            onChange={(e) => setStudentA(e.target.value)}
            style={selectStyle}
          >
            <option value="">— select —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName ?? m.userId.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Student B
          </label>
          <select
            value={studentB}
            onChange={(e) => setStudentB(e.target.value)}
            style={selectStyle}
          >
            <option value="">— select —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName ?? m.userId.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={compare}
          disabled={loading || !studentA || !studentB}
          style={{
            padding: "8px 16px",
            background: "var(--color-ai)",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            opacity: loading || !studentA || !studentB ? 0.5 : 1,
          }}
        >
          {loading ? "Comparing…" : "Compare"}
        </button>
      </div>

      {error && <Pill tone="danger">{error}</Pill>}

      {data && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <SidePanel side={data.side_a} />
            <SidePanel side={data.side_b} />
          </div>
          {data.notes.map((n, i) => (
            <p key={i} style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0" }}>
              {n}
            </p>
          ))}
          {data.diffs.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Top differences ({data.diffs.length})
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                    <th style={th}>Topic</th>
                    <th style={th}>A EWA</th>
                    <th style={th}>B EWA</th>
                    <th style={th}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.diffs.slice(0, 12).map((d) => (
                    <tr key={d.topic_id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                      <td style={td}>
                        <code>{d.topic_id.slice(0, 8)}</code>
                      </td>
                      <td style={td}>{d.a_ewa.toFixed(2)}</td>
                      <td style={td}>{d.b_ewa.toFixed(2)}</td>
                      <td style={{ ...td, color: d.delta > 0 ? "var(--color-green)" : "var(--color-red)" }}>
                        {d.delta > 0 ? "+" : ""}{d.delta.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SidePanel({
  side,
}: {
  side: { side: string; label: string; n_topics: number; avg_ewa: number; weak_pct: number };
}) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        background: "var(--bg-surface-1)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
        Side {side.side.toUpperCase()}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        <code>{side.label.slice(0, 8)}</code>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        Topics tracked: <strong>{side.n_topics}</strong>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        Avg EWA: <strong>{side.avg_ewa.toFixed(2)}</strong>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        % weak: <strong>{Math.round(side.weak_pct * 100)}%</strong>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  fontSize: 11,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
};

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  background: "var(--bg-surface-1)",
  color: "var(--text-primary)",
  fontSize: 13,
  minWidth: 200,
};
