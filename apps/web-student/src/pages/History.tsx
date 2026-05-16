// Practice history — production-grade redesign (2026-05-11).
//
// Layout: pg-shell → pg-header → pg-stat-strip (sessions / accuracy /
// time / streak signal) → pg-tabs (Practice / Mock) → pg-filter-row
// (status chips) → pg-list of rows. Each row shows mode, status,
// accuracy, and a deep-dive link.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";

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

  return (
    <AppShell title="Practice history">
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Practice history</h1>
            <p className="pg-header-sub">
              Every quiz and mock test you've run. Tap any row to revisit the
              result or resume an in-progress session.
            </p>
          </div>
          <div className="pg-header-actions">
            <Link to="/practice" className="pg-btn pg-btn-primary">
              ＋ Start a session
            </Link>
          </div>
        </header>

        {stats && (
          <div className="pg-stat-strip">
            <div className="pg-stat">
              <div className="pg-stat-label">Sessions</div>
              <div className="pg-stat-value">{stats.total}</div>
              <div className="pg-stat-delta">
                {stats.submitted} submitted · {stats.inProgress} in progress
              </div>
            </div>
            <div className="pg-stat">
              <div className="pg-stat-label">Accuracy</div>
              <div
                className="pg-stat-value"
                style={{
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
              <div className="pg-stat-delta">
                across {stats.totalAnswered.toLocaleString()} questions
              </div>
            </div>
            <div className="pg-stat">
              <div className="pg-stat-label">Mock tests</div>
              <div className="pg-stat-value">{stats.mocks}</div>
              <div className="pg-stat-delta">
                {stats.mocks === 0 ? "try your first mock" : "exam-style runs"}
              </div>
            </div>
            <div className="pg-stat">
              <div className="pg-stat-label">In progress</div>
              <div className="pg-stat-value" style={{ color: "var(--warn)" }}>
                {stats.inProgress}
              </div>
              <div className="pg-stat-delta">
                {stats.inProgress > 0 ? "resume below" : "all up to date"}
              </div>
            </div>
          </div>
        )}

        <div className="pg-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={section === "practice"}
            className={`pg-tab${section === "practice" ? " on" : ""}`}
            onClick={() => setSection("practice")}
          >
            Practice
            <span className="pg-tab-count">{rows?.length ?? 0}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === "mock"}
            className={`pg-tab${section === "mock" ? " on" : ""}`}
            onClick={() => setSection("mock")}
          >
            Mock tests
            <span className="pg-tab-count">{mocks?.length ?? 0}</span>
          </button>
        </div>

        {error && <Banner tone="danger" role="alert">{error}</Banner>}

        {section === "practice" && (
          <>
            <div className="pg-filter-row">
              <div className="pg-filter-chips">
                {(["all", "submitted", "in-progress"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`pg-chip${statusFilter === f ? " on" : ""}`}
                    onClick={() => setStatusFilter(f)}
                  >
                    {f === "in-progress" ? "In progress" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {filteredPractice === null ? (
              <SkeletonRows count={5} />
            ) : filteredPractice.length === 0 ? (
              <div className="pg-empty">
                <div className="pg-empty-icon">📚</div>
                <h2 className="pg-empty-title">
                  {rows && rows.length === 0
                    ? "No practice sessions yet"
                    : "Nothing matches this filter"}
                </h2>
                <p className="pg-empty-body">
                  {rows && rows.length === 0
                    ? "Start your first practice run from the Practice tab — your sessions will show up here for review."
                    : "Try switching the filter to 'All' to see everything."}
                </p>
                {rows && rows.length === 0 ? (
                  <Link to="/practice" className="pg-btn pg-btn-primary">
                    Start a practice session
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="pg-btn pg-btn-ghost"
                    onClick={() => setStatusFilter("all")}
                  >
                    Show all sessions
                  </button>
                )}
              </div>
            ) : (
              <div className="pg-list">
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
                      className="pg-row"
                      onClick={onClick}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onClick();
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="pg-row-main">
                        <p className="pg-row-title">{title}</p>
                        <div className="pg-row-meta">
                          <span>{r.mode === "MOCK" ? "Mock" : "Practice"}</span>
                          <span className="pg-row-meta-dot">·</span>
                          <span>
                            {r.correctCount} correct of {r.servedCount} answered
                          </span>
                          {r.targetCount > r.servedCount && r.status === "IN_PROGRESS" && (
                            <>
                              <span className="pg-row-meta-dot">·</span>
                              <span style={{ color: "var(--warn)" }}>
                                {r.targetCount - r.servedCount} remaining
                              </span>
                            </>
                          )}
                          <span className="pg-row-meta-dot">·</span>
                          <span>{relative(r.startedAt)}</span>
                        </div>
                      </div>
                      <div className="pg-row-aside">
                        <span className={`pg-pill pg-pill-${tone}`}>{pillLabel}</span>
                        {r.status !== "IN_PROGRESS" && r.servedCount > 0 && (
                          <Link
                            to={`/sessions/${r.sessionId}/deep-dive`}
                            onClick={(e) => e.stopPropagation()}
                            className="pg-btn pg-btn-subtle pg-btn-sm"
                          >
                            Deep-dive →
                          </Link>
                        )}
                        {r.status === "IN_PROGRESS" && (
                          <span className="pg-btn pg-btn-primary pg-btn-sm">
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
              <div className="pg-empty">
                <div className="pg-empty-icon">🎓</div>
                <h2 className="pg-empty-title">No mock tests yet</h2>
                <p className="pg-empty-body">
                  Mock tests simulate the real exam environment — timed,
                  scored, and ranked against the cohort. Try your first one
                  when you're ready.
                </p>
                <Link to="/mock" className="pg-btn pg-btn-primary">
                  Browse mock tests
                </Link>
              </div>
            ) : (
              <div className="pg-list">
                {mocks.map((m) => {
                  const pct =
                    m.maxMarks > 0 ? Math.round((m.rawScore / m.maxMarks) * 100) : 0;
                  const tone: "success" | "info" | "danger" =
                    pct >= 70 ? "success" : pct >= 40 ? "info" : "danger";
                  return (
                    <div
                      key={m.id}
                      className="pg-row"
                      onClick={() => navigate(`/mock/result?attemptId=${m.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/mock/result?attemptId=${m.id}`);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="pg-row-main">
                        <p className="pg-row-title">
                          {m.examName ?? m.examCode}
                        </p>
                        <div className="pg-row-meta">
                          <span>
                            {m.nCorrect} correct · {m.nWrong} wrong · {m.nUnanswered} unanswered
                          </span>
                          {m.percentile !== null && (
                            <>
                              <span className="pg-row-meta-dot">·</span>
                              <span>{m.percentile.toFixed(1)} percentile</span>
                            </>
                          )}
                          {m.projectedRank && (
                            <>
                              <span className="pg-row-meta-dot">·</span>
                              <span>AIR ~{m.projectedRank.toLocaleString()}</span>
                            </>
                          )}
                          <span className="pg-row-meta-dot">·</span>
                          <span>{relative(m.createdAt)}</span>
                        </div>
                      </div>
                      <div className="pg-row-aside">
                        <span className={`pg-pill pg-pill-${tone}`}>
                          {m.rawScore}/{m.maxMarks} · {pct}%
                        </span>
                        <span className="pg-btn pg-btn-subtle pg-btn-sm">View →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
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