import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

// Practice history — every quiz session this user has run, newest first.
// Quiz service supplies the slim list (status, counts, started_at, topic_id).
// Topic titles are resolved from catalog and cached here.

interface SessionRow {
  sessionId: string;
  topicId: string;
  mode: "PRACTICE" | "MOCK";
  strategy: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  targetCount: number;
  servedCount: number;
  correctCount: number;
  startedAt: string;
  submittedAt?: string;
}

interface MockAttempt {
  id: string;
  mockId: string | null;
  examCode: string;
  examName: string | null;
  rawScore: number;
  maxMarks: number;
  accuracy: number;
  totalQuestions: number;
  nCorrect: number;
  nWrong: number;
  nUnanswered: number;
  percentile: number | null;
  projectedRank: number | null;
  confidence: string | null;
  createdAt: string;
}

interface TopicMeta {
  id: string;
  title: string;
}

type Filter = "all" | "submitted" | "in-progress";

export function History() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [topics, setTopics] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mocks, setMocks] = useState<MockAttempt[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/quiz/sessions?userId=${user.id}&limit=100`,
        );
        if (!r.ok) {
          setError("We couldn't load your practice history.");
          return;
        }
        const body = (await r.json()) as { items: SessionRow[] };
        if (!alive) return;
        setRows(body.items);

        // Fan out topic-title resolution. Catalog is cached so duplicate calls
        // are free; we still de-duplicate the unique IDs to keep this small.
        const uniqueTopics = Array.from(new Set(body.items.map((s) => s.topicId)));
        const titleMap = new Map<string, string>();
        await Promise.all(
          uniqueTopics.map(async (id) => {
            try {
              const t = await auth.fetch(`/api/v1/catalog/topics/${id}`);
              if (!t.ok) return;
              const tb = (await t.json()) as TopicMeta;
              titleMap.set(id, tb.title);
            } catch {
              /* swallow */
            }
          }),
        );
        if (alive) setTopics(titleMap);
      } catch {
        if (alive) setError("Network error loading history.");
      }
      try {
        const r2 = await auth.fetch(`/api/v1/profile/mock-attempts`);
        if (r2.ok) {
          const body = (await r2.json()) as { items: MockAttempt[] };
          if (alive) setMocks(body.items);
        } else if (alive) {
          setMocks([]);
        }
      } catch {
        if (alive) setMocks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (filter === "all") return rows;
    if (filter === "submitted") return rows.filter((r) => r.status === "SUBMITTED");
    return rows.filter((r) => r.status === "IN_PROGRESS");
  }, [rows, filter]);

  return (
    <AppShell title="Practice history">
      <p className="muted" style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
        Every quiz and mock test you've run. Tap a row to revisit the result.
      </p>

      {error ? <Banner tone="danger" role="alert">{error}</Banner> : null}

      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        {(["all", "submitted", "in-progress"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${filter === f ? "var(--color-blue)" : "var(--border-default)"}`,
              background: filter === f ? "var(--color-blue)" : "transparent",
              color: filter === f ? "#fff" : "var(--text-primary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              textTransform: "capitalize",
            }}
          >
            {f === "in-progress" ? "In progress" : f}
          </button>
        ))}
      </div>

      {filtered === null ? (
        <SkeletonRows count={5} />
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "var(--sp-5)",
            textAlign: "center",
            color: "var(--text-muted)",
            border: "1px dashed var(--border-default)",
            borderRadius: 12,
            background: "var(--bg-surface-1)",
          }}
        >
          {rows && rows.length === 0 ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
              <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 6 }}>
                No practice sessions yet
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                Start your first practice run from the Practice tab — your sessions will show up here.
              </div>
              <div style={{ marginTop: 14 }}>
                <Link to="/practice" className="btn btn-primary">Start a practice session</Link>
              </div>
            </>
          ) : (
            <>No sessions match this filter.</>
          )}
        </div>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {filtered.map((r) => {
            const pct = r.servedCount > 0
              ? Math.round((r.correctCount / r.servedCount) * 100)
              : 0;
            const tone = r.status === "IN_PROGRESS"
              ? "warning"
              : r.status === "EXPIRED"
                ? "muted"
                : pct >= 80
                  ? "success"
                  : pct >= 50
                    ? "info"
                    : "danger";
            const title = topics.get(r.topicId) ?? `Topic #${r.topicId.slice(0, 8)}`;
            const onClick = () => {
              if (r.status === "IN_PROGRESS") navigate(`/quiz/${r.sessionId}`);
              else navigate(`/quiz/${r.sessionId}/result`);
            };
            return (
              <li
                key={r.sessionId}
                style={{
                  background: "var(--bg-surface-1)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 12,
                  padding: "var(--sp-3)",
                  cursor: "pointer",
                }}
                onClick={onClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill tone="info">{r.mode === "MOCK" ? "Mock test" : "Practice"}</Pill>
                  <Pill tone={tone}>
                    {r.status === "IN_PROGRESS"
                      ? "IN PROGRESS"
                      : r.status === "EXPIRED"
                        ? "EXPIRED"
                        : `${pct}%`}
                  </Pill>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {relative(r.startedAt)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "var(--text-primary)",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  {r.correctCount} correct of {r.servedCount} answered
                  {r.targetCount > r.servedCount && r.status === "IN_PROGRESS"
                    ? ` · ${r.targetCount - r.servedCount} remaining`
                    : ""}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Mock test history — separate section since mocks live outside
          the quiz_sessions table (in-memory plan + persisted attempts in
          profile_schema.mock_attempts). */}
      {mocks && mocks.length > 0 ? (
        <section style={{ marginTop: "var(--sp-5)" }}>
          <h2
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              margin: "0 0 var(--sp-3) 0",
            }}
          >
            Mock tests · {mocks.length}
          </h2>
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {mocks.map((m) => {
              const pct = m.maxMarks > 0 ? Math.round((m.rawScore / m.maxMarks) * 100) : 0;
              const tone =
                pct >= 70 ? "success" : pct >= 40 ? "info" : "danger";
              return (
                <li
                  key={m.id}
                  onClick={() => navigate(`/mock/result?attemptId=${m.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/mock/result?attemptId=${m.id}`);
                    }
                  }}
                  style={{
                    background: "var(--bg-surface-1)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 12,
                    padding: "var(--sp-3)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Pill tone="info">Mock test</Pill>
                    <Pill tone={tone}>
                      {m.rawScore}/{m.maxMarks} · {pct}%
                    </Pill>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {relative(m.createdAt)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: "var(--text-primary)",
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    {m.examName ?? m.examCode}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {m.nCorrect} correct · {m.nWrong} wrong · {m.nUnanswered}{" "}
                    unanswered
                    {m.percentile !== null
                      ? ` · ${m.percentile.toFixed(1)} percentile`
                      : ""}
                    {m.projectedRank
                      ? ` · projected AIR ~${m.projectedRank.toLocaleString()}`
                      : ""}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </AppShell>
  );
}

function relative(iso: string): string {
  try {
    const t = new Date(iso);
    const delta = Date.now() - t.getTime();
    const m = Math.floor(delta / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return t.toLocaleDateString();
  } catch {
    return iso;
  }
}
