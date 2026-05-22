// Practice history — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + subtitle) → 4-up stat strip
// (sessions / accuracy / mocks / in-progress) → tabs (Practice / Mock)
// → status chips → list of session rows. Each row shows mode, status,
// accuracy, and a deep-dive link.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { SkeletonRows } from "../components/dashboard";

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

type Section = "practice" | "mock";
type StatusFilter = "all" | "submitted" | "in-progress";

export function History() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [topics, setTopics] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("practice");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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

  // Aggregate KPIs across all practice sessions for the strip at top.
  const stats = useMemo(() => {
    if (!rows) return null;
    const submitted = rows.filter((r) => r.status === "SUBMITTED");
    const totalAnswered = submitted.reduce((a, r) => a + r.servedCount, 0);
    const totalCorrect = submitted.reduce((a, r) => a + r.correctCount, 0);
    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    const inProgress = rows.filter((r) => r.status === "IN_PROGRESS").length;
    return {
      total: rows.length,
      submitted: submitted.length,
      inProgress,
      accuracy,
      totalAnswered,
      mocks: mocks?.length ?? 0,
    };
  }, [rows, mocks]);

  const filteredPractice = useMemo(() => {
    if (!rows) return null;
    let out = rows;
    if (statusFilter === "submitted") out = rows.filter((r) => r.status === "SUBMITTED");
    if (statusFilter === "in-progress") out = rows.filter((r) => r.status === "IN_PROGRESS");
    return out;
  }, [rows, statusFilter]);

  const actions = (
    <Link to="/practice" className="vidya-shell__primary">
      ＋ Start a session
    </Link>
  );

  return (
    <VidyaShell
      crumbs="ME · HISTORY"
      title="History"
      subtitle="Your activity across sessions, tests, and tutoring."
      actions={actions}
    >
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--sp-3)",
            marginBottom: "var(--sp-4)",
          }}
        >
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: "var(--sp-3) var(--sp-4)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Sessions
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{stats.total}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              {stats.submitted} submitted · {stats.inProgress} in progress
            </div>
          </div>
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: "var(--sp-3) var(--sp-4)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Accuracy
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginTop: 2,
                color:
                  stats.accuracy >= 75
                    ? "var(--good)"
                    : stats.accuracy >= 50
                      ? "var(--info)"
                      : "var(--bad)",
              }}
            >
              {stats.accuracy}%
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              across {stats.totalAnswered.toLocaleString()} questions
            </div>
          </div>
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: "var(--sp-3) var(--sp-4)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Mock tests
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{stats.mocks}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              {stats.mocks === 0 ? "try your first mock" : "exam-style runs"}
            </div>
          </div>
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: "var(--sp-3) var(--sp-4)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              In progress
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: "var(--warn)" }}>
              {stats.inProgress}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              {stats.inProgress > 0 ? "resume below" : "all up to date"}
            </div>
          </div>
        </div>
      )}

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--rule)",
          marginBottom: "var(--sp-4)",
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === "practice"}
          onClick={() => setSection("practice")}
          style={{
            padding: "8px 16px",
            fontWeight: section === "practice" ? 700 : 400,
            fontSize: 14,
            background: "none",
            border: "none",
            borderBottom:
              section === "practice"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            color: section === "practice" ? "var(--accent)" : "inherit",
            cursor: "pointer",
            marginBottom: -1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Practice
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{rows?.length ?? 0}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "mock"}
          onClick={() => setSection("mock")}
          style={{
            padding: "8px 16px",
            fontWeight: section === "mock" ? 700 : 400,
            fontSize: 14,
            background: "none",
            border: "none",
            borderBottom:
              section === "mock"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            color: section === "mock" ? "var(--accent)" : "inherit",
            cursor: "pointer",
            marginBottom: -1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Mock tests
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{mocks?.length ?? 0}</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "var(--paper)",
            border: "1px solid var(--bad)",
            color: "var(--bad)",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: "var(--sp-3)",
          }}
        >
          {error}
        </div>
      )}

      {section === "practice" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: "var(--sp-3)", flexWrap: "wrap" }}>
            {(["all", "submitted", "in-progress"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={
                  statusFilter === f
                    ? "vidya-shell__chip vidya-shell__chip--on"
                    : "vidya-shell__chip"
                }
              >
                {f === "in-progress" ? "In progress" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {filteredPractice === null ? (
            <SkeletonRows count={5} />
          ) : filteredPractice.length === 0 ? (
            <section
              style={{
                textAlign: "center",
                padding: "var(--sp-6) var(--sp-4)",
                background: "var(--paper)",
                border: "1px dashed var(--rule)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: "var(--sp-3)" }}>📚</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: "var(--sp-2)" }}>
                {rows && rows.length === 0
                  ? "No practice sessions yet"
                  : "Nothing matches this filter"}
              </h2>
              <p style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 520, margin: "0 auto var(--sp-4)" }}>
                {rows && rows.length === 0
                  ? "Start your first practice run from the Practice tab — your sessions will show up here for review."
                  : "Try switching the filter to 'All' to see everything."}
              </p>
              {rows && rows.length === 0 ? (
                <Link to="/practice" className="vidya-shell__primary">
                  Start a practice session
                </Link>
              ) : (
                <button
                  type="button"
                  className="vidya-shell__chip"
                  onClick={() => setStatusFilter("all")}
                >
                  Show all sessions
                </button>
              )}
            </section>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {filteredPractice.map((r) => {
                const pct =
                  r.servedCount > 0
                    ? Math.round((r.correctCount / r.servedCount) * 100)
                    : 0;
                const tone: "warn" | "muted" | "success" | "info" | "danger" =
                  r.status === "IN_PROGRESS"
                    ? "warn"
                    : r.status === "EXPIRED"
                      ? "muted"
                      : pct >= 80
                        ? "success"
                        : pct >= 50
                          ? "info"
                          : "danger";
                const toneColor: Record<typeof tone, string> = {
                  warn: "var(--warn)",
                  muted: "var(--ink-3)",
                  success: "var(--good)",
                  info: "var(--info)",
                  danger: "var(--bad)",
                };
                const title = topics.get(r.topicId) ?? `Topic #${r.topicId.slice(0, 8)}`;
                const onClick = () => {
                  if (r.status === "IN_PROGRESS") navigate(`/quiz/${r.sessionId}`);
                  else navigate(`/quiz/${r.sessionId}/result`);
                };
                const pillLabel =
                  r.status === "IN_PROGRESS"
                    ? "In progress"
                    : r.status === "EXPIRED"
                      ? "Expired"
                      : `${pct}%`;
                return (
                  <div
                    key={r.sessionId}
                    onClick={onClick}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onClick();
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--sp-3)",
                      padding: "var(--sp-3) var(--sp-4)",
                      background: "var(--paper)",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{title}</p>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--ink-3)",
                          marginTop: 2,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        <span>{r.mode === "MOCK" ? "Mock" : "Practice"}</span>
                        <span>·</span>
                        <span>
                          {r.correctCount} correct of {r.servedCount} answered
                        </span>
                        {r.targetCount > r.servedCount && r.status === "IN_PROGRESS" && (
                          <>
                            <span>·</span>
                            <span style={{ color: "var(--warn)" }}>
                              {r.targetCount - r.servedCount} remaining
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>{relative(r.startedAt)}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--sp-2)",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: toneColor[tone],
                          color: "var(--paper)",
                        }}
                      >
                        {pillLabel}
                      </span>
                      {r.status !== "IN_PROGRESS" && r.servedCount > 0 && (
                        <Link
                          to={`/sessions/${r.sessionId}/deep-dive`}
                          onClick={(e) => e.stopPropagation()}
                          className="vidya-shell__chip"
                        >
                          Deep-dive →
                        </Link>
                      )}
                      {r.status === "IN_PROGRESS" && (
                        <span className="vidya-shell__primary">
                          Resume →
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {section === "mock" && (
        <>
          {mocks === null ? (
            <SkeletonRows count={3} />
          ) : mocks.length === 0 ? (
            <section
              style={{
                textAlign: "center",
                padding: "var(--sp-6) var(--sp-4)",
                background: "var(--paper)",
                border: "1px dashed var(--rule)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: "var(--sp-3)" }}>🎓</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: "var(--sp-2)" }}>
                No mock tests yet
              </h2>
              <p style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 520, margin: "0 auto var(--sp-4)" }}>
                Mock tests simulate the real exam environment — timed,
                scored, and ranked against the cohort. Try your first one
                when you're ready.
              </p>
              <Link to="/mock-exam" className="vidya-shell__primary">
                Browse mock tests
              </Link>
            </section>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {mocks.map((m) => {
                const pct =
                  m.maxMarks > 0 ? Math.round((m.rawScore / m.maxMarks) * 100) : 0;
                const tone: "success" | "info" | "danger" =
                  pct >= 70 ? "success" : pct >= 40 ? "info" : "danger";
                const toneColor: Record<typeof tone, string> = {
                  success: "var(--good)",
                  info: "var(--info)",
                  danger: "var(--bad)",
                };
                return (
                  <div
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
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--sp-3)",
                      padding: "var(--sp-3) var(--sp-4)",
                      background: "var(--paper)",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
                        {m.examName ?? m.examCode}
                      </p>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--ink-3)",
                          marginTop: 2,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        <span>
                          {m.nCorrect} correct · {m.nWrong} wrong · {m.nUnanswered} unanswered
                        </span>
                        {m.percentile !== null && (
                          <>
                            <span>·</span>
                            <span>{m.percentile.toFixed(1)} percentile</span>
                          </>
                        )}
                        {m.projectedRank && (
                          <>
                            <span>·</span>
                            <span>AIR ~{m.projectedRank.toLocaleString()}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{relative(m.createdAt)}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--sp-2)",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: toneColor[tone],
                          color: "var(--paper)",
                        }}
                      >
                        {m.rawScore}/{m.maxMarks} · {pct}%
                      </span>
                      <span className="vidya-shell__chip">View →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </VidyaShell>
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
