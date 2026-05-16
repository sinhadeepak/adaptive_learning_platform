import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, strengthFor } from "../components/dashboard";
// Phase 1B — wire existing analytics primitives.
import { MasteryBar } from "../components/stats";

// Practice hub — fast-action surface to start the next adaptive practice
// round. Pulls AI-recommended next steps + per-topic mastery, surfaces
// weakest topics for drill, and offers one-tap "Start now" buttons that
// POST /api/v1/quiz/sessions/start and route into the existing /quiz/:id
// runner.
//
// What's real:
//   • Mastery, streak, and AI-guided next steps are real backend calls.
//   • "Start now" creates a real adaptive session for the topic.
//   • The mock-test CTA points at the AI mock orchestrator
//     (/adaptive/mock/plan + /adaptive/mock/score). Attempts are persisted
//     to profile_schema.mock_attempts for the History page.

interface Profile {
  user: { firstName: string };
  exams: Array<{ examId: string; targetDate: string | null }>;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface StreakResponse {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

interface TopicDetail {
  id: string;
  title: string;
  subjectId: string;
  questionCount?: number;
}

interface GuidedStep {
  action: "REVISE" | "PRACTICE" | "DIAGNOSE" | "MOCK_SLICE";
  topicId: string;
  topicTitle: string;
  why: string;
  estMinutes: number;
}

interface GuidedResponse {
  headline: string;
  steps: GuidedStep[];
  source: "ai" | "heuristic";
}

interface DrillTopic {
  topicId: string;
  title: string;
  ewa: number;
  attempts: number;
  subjectName?: string;
}

const ACTION_ICON: Record<GuidedStep["action"], string> = {
  REVISE: "📖",
  PRACTICE: "🎯",
  DIAGNOSE: "🔍",
  MOCK_SLICE: "⏱",
};

const ACTION_CLASS: Record<GuidedStep["action"], string> = {
  REVISE: "pr-drill-icon-revise",
  PRACTICE: "pr-drill-icon-practice",
  DIAGNOSE: "pr-drill-icon-diagnose",
  MOCK_SLICE: "pr-drill-icon-mock",
};

const ACTION_LABEL: Record<GuidedStep["action"], string> = {
  REVISE: "Revise",
  PRACTICE: "Practice",
  DIAGNOSE: "Diagnose",
  MOCK_SLICE: "Mock slice",
};

export function Practice() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mastery, setMastery] = useState<MasteryListResponse["topics"] | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [guided, setGuided] = useState<GuidedResponse | null>(null);
  const [topicTitles, setTopicTitles] = useState<Record<string, TopicDetail>>({});
  const [error, setError] = useState<string | null>(null);
  const [startingTopicId, setStartingTopicId] = useState<string | null>(null);
  // Phase 1B — wire existing analytics primitives.
  const [readinessBand, setReadinessBand] = useState<{
    band: string;
    readiness_score: number;
    target_score: number;
    days_to_exam: number;
    actions: string[];
  } | null>(null);
  const [revisionQueue, setRevisionQueue] = useState<Array<{
    topicId: string;
    topicTitle: string;
    lastAttemptAt: string;
    dueAt: string;
    overdueDays: number;
  }> | null>(null);
  const [topicDecay, setTopicDecay] = useState<Array<{
    conceptId?: string;
    topicId?: string;
    severity: string;
    daysSince: number;
  }> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (r.ok) setProfile((await r.json()) as Profile);
      } catch {
        /* swallow */
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (r.ok) {
          const body = (await r.json()) as MasteryListResponse;
          setMastery(body.topics);
          // Hydrate topic titles for any topic that appears in mastery.
          const ids = body.topics.map((t) => t.topicId);
          const titles: Record<string, TopicDetail> = {};
          await Promise.all(
            ids.map(async (id) => {
              try {
                const tr = await auth.fetch(`/api/v1/catalog/topics/${id}`);
                if (tr.ok) titles[id] = (await tr.json()) as TopicDetail;
              } catch {
                /* swallow */
              }
            }),
          );
          setTopicTitles(titles);
        } else {
          setMastery([]);
        }
      } catch {
        setMastery([]);
      }
      try {
        const r = await auth.fetch(`/api/v1/analytics/streak/${user.id}`);
        if (r.ok) setStreak((await r.json()) as StreakResponse);
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(`/api/v1/adaptive/guided-next-steps/${user.id}`);
        if (r.ok) setGuided((await r.json()) as GuidedResponse);
      } catch {
        /* swallow */
      }
      // Phase 1B — readiness band, revision queue, topic decay (parallel).
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/readiness-band/${user.id}?target_score=0.7&days_to_exam=120`,
        );
        if (r.ok) setReadinessBand(await r.json());
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/revision/${user.id}?limit=5`,
        );
        if (r.ok) {
          const body = await r.json();
          setRevisionQueue(body.items ?? []);
        }
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(`/api/v1/analytics/topic-decay/${user.id}`);
        if (r.ok) {
          const body = await r.json();
          setTopicDecay(body.items ?? []);
        }
      } catch {
        /* swallow */
      }
    })();
  }, [user]);

  // Hydrate any topic titles referenced by guided steps that weren't already
  // pulled in via mastery (e.g. a Diagnose step on a not-yet-attempted topic).
  useEffect(() => {
    if (!guided) return;
    const missing = guided.steps
      .map((s) => s.topicId)
      .filter((id) => !topicTitles[id]);
    if (missing.length === 0) return;
    (async () => {
      const titles: Record<string, TopicDetail> = { ...topicTitles };
      await Promise.all(
        missing.map(async (id) => {
          try {
            const tr = await auth.fetch(`/api/v1/catalog/topics/${id}`);
            if (tr.ok) titles[id] = (await tr.json()) as TopicDetail;
          } catch {
            /* swallow */
          }
        }),
      );
      setTopicTitles(titles);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guided]);

  async function startQuiz(topicId: string) {
    if (!user || startingTopicId) return;
    setError(null);
    setStartingTopicId(topicId);
    try {
      const r = await auth.fetch("/api/v1/quiz/sessions/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId, userId: user.id, mode: "PRACTICE" }),
      });
      if (r.status === 422) {
        setError("That topic doesn't have any practice questions yet.");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { sessionId: string };
      navigate(`/quiz/${body.sessionId}`);
    } catch {
      setError("We couldn't start the quiz. Try again in a moment.");
    } finally {
      setStartingTopicId(null);
    }
  }

  const tested = (mastery ?? []).filter((t) => t.n > 0);
  const totalSessions = tested.reduce((s, t) => s + t.n, 0);
  const meanEwa =
    tested.length > 0 ? tested.reduce((s, t) => s + t.ewa, 0) / tested.length : 0;

  // Weakest topics with at least one attempt — these are the highest-leverage
  // drills. Fall back to lowest-ewa topics if no attempts yet.
  const weakestDrills = useMemo<DrillTopic[]>(() => {
    if (!mastery) return [];
    const ranked = [...mastery].sort((a, b) => a.ewa - b.ewa);
    return ranked.slice(0, 6).map((t) => ({
      topicId: t.topicId,
      title: topicTitles[t.topicId]?.title ?? `Topic ${t.topicId.slice(0, 8)}`,
      ewa: t.ewa,
      attempts: t.n,
    }));
  }, [mastery, topicTitles]);

  // Recent practice — sorted by attempts desc, capped to 6.
  const recentPractice = useMemo<DrillTopic[]>(() => {
    if (!mastery) return [];
    return [...mastery]
      .filter((t) => t.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .map((t) => ({
        topicId: t.topicId,
        title: topicTitles[t.topicId]?.title ?? `Topic ${t.topicId.slice(0, 8)}`,
        ewa: t.ewa,
        attempts: t.n,
      }));
  }, [mastery, topicTitles]);

  // F2a — lazy diagnostic gate. Show a modal once per user on their
  // first Practice visit if they have zero attempted topics and haven't
  // explicitly dismissed it.
  const DISMISS_KEY = "alp.diagnostic.dismissed";
  const [diagDismissed, setDiagDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return true;
    }
  });
  const showDiagnosticGate =
    !diagDismissed &&
    mastery !== null &&
    mastery.filter((m) => m.n > 0).length === 0;

  function dismissDiagnostic() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDiagDismissed(true);
  }

  const heroStep = guided?.steps?.[0] ?? null;
  const heroTopicTitle = heroStep
    ? topicTitles[heroStep.topicId]?.title ?? heroStep.topicTitle
    : null;
  const restSteps = guided?.steps?.slice(1) ?? [];

  const greeting = profile?.user.firstName ?? user?.firstName ?? "there";

  const empty = mastery !== null && mastery.length === 0;

  return (
    <AppShell title="Practice">
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {/* F2a — Diagnostic placement modal */}
      {showDiagnosticGate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-scrim)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={dismissDiagnostic}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              maxWidth: 460,
              width: "100%",
              padding: "22px 24px 20px",
              boxShadow: "var(--shadow-float)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 9px",
                background: "rgba(8,145,178,0.08)",
                border: "1px solid rgba(8,145,178,0.30)",
                color: "var(--gold)",
                borderRadius: 20,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              ◈ Calibrate first
            </div>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--ink)",
                margin: "0 0 8px",
                lineHeight: 1.3,
              }}
            >
              Take a 10-minute diagnostic?
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                margin: "0 0 16px",
                lineHeight: 1.55,
              }}
            >
              We'll use the result to seed the IRT engine — your first
              real practice session will already be tuned to your level
              instead of starting from scratch. You can skip and start
              drilling right away if you'd rather calibrate as you go.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="pg-btn pg-btn-ghost"
                onClick={dismissDiagnostic}
              >
                Skip — start practice
              </button>
              <Link
                to="/practice/diagnostic"
                className="pg-btn pg-btn-primary"
                onClick={dismissDiagnostic}
              >
                Calibrate (10 min) →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero — AI recommended next practice ─────────────────────────── */}
      {heroStep && heroTopicTitle ? (
        <section className="ai-header" aria-label="Recommended practice">
          <div className="ai-header-left">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
              <span className="ai-pill">◈ AI PRACTICE · NEXT</span>
              <Pill tone="info">{ACTION_LABEL[heroStep.action]}</Pill>
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                ~{heroStep.estMinutes} min
              </span>
            </div>
            <h1 className="ai-header-name">
              <span className="ai-header-name-accent">{heroTopicTitle}</span>
            </h1>
            <p className="ai-header-sub">
              Hi {greeting} — {heroStep.why}
            </p>
            <div className="ai-header-btns">
              <button
                type="button"
                className="btn-ai"
                disabled={startingTopicId === heroStep.topicId}
                onClick={() => startQuiz(heroStep.topicId)}
              >
                {startingTopicId === heroStep.topicId
                  ? "Starting…"
                  : "◈ Start now"}
              </button>
              <Link
                to={`/catalog/topic/${heroStep.topicId}`}
                className="btn btn-ghost"
              >
                Read topic notes →
              </Link>
            </div>
          </div>
          <div className="ai-header-stats">
            <div className="ai-stat">
              <div className="ai-stat-num" style={{ color: "var(--warn)" }}>
                {streak?.currentStreak ?? 0}
              </div>
              <div className="ai-stat-lbl">DAY STREAK</div>
            </div>
            <div className="ai-divider" />
            <div className="ai-stat">
              <div className="ai-stat-num" style={{ color: "var(--info)" }}>
                {totalSessions}
              </div>
              <div className="ai-stat-lbl">SESSIONS</div>
            </div>
            <div className="ai-divider" />
            <div className="ai-stat">
              <div className="ai-stat-num" style={{ color: "var(--good)" }}>
                {tested.length > 0 ? `${Math.round(meanEwa * 100)}%` : "—"}
              </div>
              <div className="ai-stat-lbl">AVG MASTERY</div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Phase 1B — "Today's plan" panel: 3-col grid wiring readiness
          band, revision queue, and topic decay alerts. Each card surfaces
          its existing analytics primitive. ─────────────────────────── */}
      {(readinessBand || revisionQueue?.length || topicDecay?.length) ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
            marginTop: "var(--sp-3)",
            marginBottom: "var(--sp-4)",
          }}
        >
          {readinessBand && (
            <div className="card" style={{ padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--ink-3)",
                    textTransform: "uppercase",
                    letterSpacing: 0.04,
                  }}
                >
                  Readiness band
                </h3>
                <Pill
                  tone={
                    readinessBand.band === "approaching"
                      ? "success"
                      : readinessBand.band === "on_track"
                      ? "info"
                      : readinessBand.band === "behind"
                      ? "warning"
                      : "danger"
                  }
                >
                  {readinessBand.band.replace("_", " ")}
                </Pill>
              </div>
              <div style={{ marginBottom: 8 }}>
                <MasteryBar ewa={readinessBand.readiness_score} />
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 6 }}>
                Target {Math.round(readinessBand.target_score * 100)}% in {readinessBand.days_to_exam} days
              </div>
              {readinessBand.actions.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--ink-2)" }}>
                  {readinessBand.actions.slice(0, 3).map((a, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {revisionQueue && revisionQueue.length > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: 0.04,
                }}
              >
                Revision queue · {revisionQueue.length} due
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {revisionQueue.slice(0, 4).map((r) => (
                  <Link
                    key={r.topicId}
                    to={`/catalog/topic/${r.topicId}`}
                    style={{
                      textDecoration: "none",
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: "1px solid var(--rule)",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <span>{r.topicTitle}</span>
                    <span
                      style={{
                        fontSize: 11,
                        color:
                          r.overdueDays > 0
                            ? "var(--bad, #f43f5e)"
                            : "var(--ink-3)",
                      }}
                    >
                      {r.overdueDays > 0
                        ? `${r.overdueDays}d overdue`
                        : "due today"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {topicDecay && topicDecay.length > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: 0.04,
                }}
              >
                Decay alerts
              </h3>
              {topicDecay.filter((d) => d.severity !== "fresh").slice(0, 4).map((d, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "4px 0",
                    color: "var(--ink-2)",
                  }}
                >
                  <span>{d.topicId?.slice(0, 8) ?? d.conceptId?.slice(0, 8) ?? "?"}…</span>
                  <span
                    style={{
                      color:
                        d.severity === "critical"
                          ? "var(--bad, #f43f5e)"
                          : d.severity === "stale"
                          ? "var(--warn, #fbbf24)"
                          : "var(--ink-3)",
                      fontWeight: 600,
                    }}
                  >
                    {d.severity} · {d.daysSince}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Empty state — no sessions yet ────────────────────────────────── */}
      {empty ? (
        <div
          className="card"
          style={{ marginTop: "var(--sp-4)", textAlign: "center", padding: "32px 20px" }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
          <h2 className="section-heading" style={{ justifyContent: "center" }}>
            Run your first practice round
          </h2>
          <p style={{ fontSize: 12, color: "var(--ink-2)", maxWidth: 460, margin: "0 auto 14px" }}>
            Pick any topic from the catalog and we'll start an adaptive
            practice session — the IRT engine picks items at your edge of
            difficulty.
          </p>
          <Link to="/catalog" className="btn-ai" style={{ display: "inline-flex" }}>
            Browse topics →
          </Link>
        </div>
      ) : null}

      {/* ── F1 + F3: Mistake Replay + Custom Test Builder entry cards ──
          F1 promotes mistake replay from a single button on /analysis.
          F3 wires the new Custom Test Builder + My Tests surface. Both
          cards are gated by `!empty` so a brand-new user with no
          mastery data doesn't get confused. */}
      {!empty ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            marginTop: "var(--sp-4)",
          }}
        >
          <Link
            to="/practice/mistakes"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 18px",
              background:
                "linear-gradient(135deg, rgba(245,166,35,0.10) 0%, rgba(245,166,35,0.02) 100%)",
              border: "1px solid rgba(245,166,35,0.30)",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span style={{ fontSize: 26 }}>🎯</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--ink)",
                  marginBottom: 3,
                }}
              >
                Drill your mistakes
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Re-attempt the questions you got wrong. Filter by recency or topic.
              </div>
            </div>
            <span
              style={{
                color: "var(--warn)",
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              Open →
            </span>
          </Link>

          <Link
            to="/practice/build"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 18px",
              background:
                "linear-gradient(135deg, rgba(47,93,203,0.10) 0%, rgba(47,93,203,0.02) 100%)",
              border: "1px solid rgba(47,93,203,0.30)",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span style={{ fontSize: 26 }}>🧩</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--ink)",
                  marginBottom: 3,
                }}
              >
                Build a custom test
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Pick topics + length + difficulty + marking. Save and re-use.{" "}
                <Link
                  to="/practice/my-tests"
                  style={{ color: "var(--info)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  My tests →
                </Link>
              </div>
            </div>
            <span
              style={{
                color: "var(--info)",
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              Build →
            </span>
          </Link>

          {/* F5 — AI-suggested tests entry card */}
          <Link
            to="/practice/ai-suggestions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 18px",
              background:
                "linear-gradient(135deg, rgba(126,84,234,0.10) 0%, rgba(126,84,234,0.02) 100%)",
              border: "1px solid rgba(126,84,234,0.30)",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span style={{ fontSize: 26 }}>✨</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--ink)",
                  marginBottom: 3,
                }}
              >
                AI test of the day
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Auto-composed test targeting your weakest topics. 4 shapes
                to choose from.
              </div>
            </div>
            <span
              style={{
                color: "#7e54ea",
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              Pick →
            </span>
          </Link>
        </div>
      ) : null}

      {/* ── Two-col: Recommended drills + Drill weak topics ──────────────── */}
      {!empty ? (
        <div
          className="dashboard-bottom-grid"
          style={{ marginTop: "var(--sp-4)" }}
        >
          {/* Left — Recommended drill queue (from guided-next-steps) */}
          <div className="card">
            <div className="sec-row">
              <h2 className="section-heading">
                ◈ AI-recommended drills
                {guided?.source === "heuristic" ? (
                  <span style={{ fontSize: 9.5, color: "var(--ink-4)", fontWeight: 500 }}>
                    · heuristic
                  </span>
                ) : null}
              </h2>
            </div>
            {restSteps.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--ink-4)", padding: "8px 0" }}>
                {guided
                  ? "Top recommendation is in the hero card above. Drill weak topics ↓"
                  : "Recommendations loading…"}
              </div>
            ) : (
              restSteps.map((s) => {
                const title = topicTitles[s.topicId]?.title ?? s.topicTitle;
                const isStarting = startingTopicId === s.topicId;
                return (
                  <div key={s.topicId} className="pr-drill-card">
                    <div className={`pr-drill-icon ${ACTION_CLASS[s.action]}`}>
                      {ACTION_ICON[s.action]}
                    </div>
                    <div className="pr-drill-body">
                      <div className="pr-drill-title">{title}</div>
                      <div className="pr-drill-meta">
                        <Pill tone="info">{ACTION_LABEL[s.action]}</Pill>
                        <span>~{s.estMinutes} min</span>
                      </div>
                      <div className="pr-drill-why">{s.why}</div>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="pr-drill-cta"
                        onClick={() => startQuiz(s.topicId)}
                        disabled={isStarting}
                      >
                        {isStarting ? "Starting…" : "Start →"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right — Weakest topics for drilling */}
          <div className="card">
            <div className="sec-row">
              <h2 className="section-heading">Drill weak topics</h2>
              <Link to="/catalog" className="see auth-link">
                Browse all ›
              </Link>
            </div>
            {weakestDrills.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--ink-4)", padding: "8px 0" }}>
                No mastery data yet.
              </div>
            ) : (
              weakestDrills.map((t) => {
                const pct = Math.round(t.ewa * 100);
                const strength = strengthFor(t.ewa);
                const barColor =
                  strength === "STRONG"
                    ? "var(--good)"
                    : strength === "DEVELOPING"
                      ? "var(--info)"
                      : strength === "WEAK"
                        ? "var(--bad)"
                        : "var(--ink-4)";
                const isStarting = startingTopicId === t.topicId;
                return (
                  <div key={t.topicId} className="pr-drill-card">
                    <div className="pr-drill-icon pr-drill-icon-weak">🎯</div>
                    <div className="pr-drill-body">
                      <div className="pr-drill-title">{t.title}</div>
                      <div className="pr-drill-meta" style={{ marginTop: 4 }}>
                        <span className="pr-drill-meta-bar">
                          <span
                            style={{
                              display: "block",
                              width: `${pct}%`,
                              height: "100%",
                              background: barColor,
                              borderRadius: 2,
                            }}
                          />
                        </span>
                        <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span>
                        <span>·</span>
                        <span>{t.attempts} session{t.attempts === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pr-drill-cta"
                      onClick={() => startQuiz(t.topicId)}
                      disabled={isStarting}
                    >
                      {isStarting ? "Starting…" : "Drill →"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {/* ── Recently practiced ──────────────────────────────────────────── */}
      {recentPractice.length > 0 ? (
        <div className="card" style={{ marginTop: "var(--sp-4)" }}>
          <div className="sec-row">
            <h2 className="section-heading">Recently practiced</h2>
            <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
              keep cadence — sessions compound mastery
            </span>
          </div>
          {recentPractice.map((t) => {
            const pct = Math.round(t.ewa * 100);
            const strength = strengthFor(t.ewa);
            const barColor =
              strength === "STRONG"
                ? "var(--good)"
                : strength === "DEVELOPING"
                  ? "var(--info)"
                  : "var(--bad)";
            const isStarting = startingTopicId === t.topicId;
            return (
              <div key={t.topicId} className="pr-drill-card">
                <div className="pr-drill-icon pr-drill-icon-practice">🎯</div>
                <div className="pr-drill-body">
                  <div className="pr-drill-title">{t.title}</div>
                  <div className="pr-drill-meta" style={{ marginTop: 4 }}>
                    <span className="pr-drill-meta-bar">
                      <span
                        style={{
                          display: "block",
                          width: `${pct}%`,
                          height: "100%",
                          background: barColor,
                          borderRadius: 2,
                        }}
                      />
                    </span>
                    <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span>
                    <span>·</span>
                    <span>{t.attempts} session{t.attempts === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="pr-drill-cta"
                  onClick={() => startQuiz(t.topicId)}
                  disabled={isStarting}
                >
                  {isStarting ? "Starting…" : "Continue →"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ── AI Mock test ─────────────────────────────────────────────────── */}
      <div
        className="pr-mock-card"
        style={{ marginTop: "var(--sp-4)", borderLeft: "3px solid var(--warn)" }}
      >
        <div className="pr-mock-icon">⏱</div>
        <div className="pr-mock-body">
          <div className="pr-mock-title">
            AI Mock Test
            <span
              className="pill pill-warning"
              style={{ marginLeft: 8, fontSize: 10 }}
            >
              ◈ AI MOCK
            </span>
          </div>
          <div className="pr-mock-sub">
            Exam-blueprint paper, mastery-calibrated, timed 25 min, scored against
            historical percentile + projected AIR. Items selected from the topics
            where you have the largest gap.
          </div>
        </div>
        <Link to="/mock?exam=NEET" className="btn btn-primary">
          Start Mock →
        </Link>
      </div>
    </AppShell>
  );
}