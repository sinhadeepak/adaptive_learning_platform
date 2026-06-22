// Practice — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + Practice/Mistakes tab chips) →
// either the AI-driven hero + recommended-next composition (uses custom
// ai-* classes for page-specific design language) or the
// MistakesPracticePanel (mistakes drill picker with vidya-card-block
// sections and chip toggles).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { Banner, Pill, strengthFor } from "../components/dashboard";
// Phase 1B — wire existing analytics primitives.
import { MasteryBar } from "../components/stats";

// ── MistakesPractice (merged from /practice/mistakes — merge 2/4) ───────────
// All types, hooks, and JSX from MistakesPractice.tsx live here verbatim.
// Route /practice/mistakes now redirects to /practice?tab=mistakes.

type MistakesTab = "recent" | "week" | "topic";

const LIMIT_OPTIONS = [10, 20, 30] as const;
type Limit = (typeof LIMIT_OPTIONS)[number];

interface WeakTopic {
  topicId: string;
  title: string;
  ewa: number;
  n: number;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface ReplayResponse {
  sessionId: string;
  mode: string;
  itemCount: number;
  topicId?: string;
  replayKind: string;
}

function MistakesPracticePanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<MistakesTab>("recent");
  const [limit, setLimit] = useState<Limit>(10);
  const [topicId, setTopicId] = useState<string>("");
  const [topics, setTopics] = useState<WeakTopic[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull mastery list once; surface weakest 12 as drill targets for the
  // "By topic" tab. Catalog title-resolution lifted from Analysis.tsx.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!r.ok) {
          if (alive) setTopics([]);
          return;
        }
        const body = (await r.json()) as MasteryListResponse;
        const ordered = body.topics
          .filter((t) => t.n > 0)
          .sort((a, b) => a.ewa - b.ewa)
          .slice(0, 12);
        // Resolve titles in parallel; fall back to truncated id.
        const titled = await Promise.all(
          ordered.map(async (t) => {
            try {
              const tr = await auth.fetch(`/api/v1/catalog/topics/${t.topicId}`);
              if (tr.ok) {
                const tj = (await tr.json()) as { title: string };
                return { ...t, title: tj.title };
              }
            } catch {
              /* fall through */
            }
            return { ...t, title: `Topic ${t.topicId.slice(0, 8)}` };
          }),
        );
        if (alive) setTopics(titled);
      } catch {
        if (alive) setTopics([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const canStart = useMemo(() => {
    if (!user || submitting) return false;
    if (tab === "topic" && !topicId) return false;
    return true;
  }, [user, submitting, tab, topicId]);

  async function start() {
    if (!user || !canStart) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { userId: user.id, limit };
      if (tab === "week") body.sinceDays = 7;
      if (tab === "topic" && topicId) body.topicId = topicId;
      const r = await auth.fetch(
        `/api/v1/quiz/sessions/start-mistake-replay`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (r.status === 422) {
        setError(
          tab === "week"
            ? "No mistakes in the last 7 days — try All recent."
            : tab === "topic"
              ? "No mistakes in this topic yet. Drill it first, then come back."
              : "No wrong-answered questions yet — answer some practice items first.",
        );
        return;
      }
      if (!r.ok) {
        setError(`Couldn't start replay (HTTP ${r.status}).`);
        return;
      }
      const out = (await r.json()) as ReplayResponse;
      navigate(`/quiz/${out.sessionId}`);
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <section style={{ marginBottom: "var(--sp-4)" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
          Drill your mistakes
        </h2>
        <p style={{ margin: "var(--sp-1) 0 0", fontSize: 13, color: "var(--ink-2)", maxWidth: 580, lineHeight: 1.5 }}>
          Re-attempt the questions you got wrong. The session pre-loads your most recent mistakes — filter by recency or by a single topic, then pick how many items you want to drill.
        </p>
      </section>

      <div role="tablist" style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-4)", flexWrap: "wrap" }}>
        {(
          [
            ["recent", "All recent"],
            ["week", "Last 7 days"],
            ["topic", "By topic"],
          ] as [MistakesTab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`vidya-shell__chip${tab === t ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* By-topic chip-row — visible only on the topic tab. */}
      {tab === "topic" && (
        <section className="vidya-card-block" style={{ marginBottom: 16 }}>
          <h3 className="vidya-card-block__title" style={{ marginBottom: "var(--sp-2)" }}>
            Pick a topic
            <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400, marginLeft: 8 }}>
              weakest first · mastery shown
            </span>
          </h3>
          {topics === null ? (
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Loading topics…
            </p>
          ) : topics.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
              No topics with attempted questions yet. Practice a few
              topics first, then come back to drill mistakes per-topic.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {topics.map((t) => {
                const on = topicId === t.topicId;
                return (
                  <button
                    key={t.topicId}
                    type="button"
                    className={`vidya-shell__chip${on ? " vidya-shell__chip--on" : ""}`}
                    onClick={() => setTopicId(t.topicId)}
                    title={`${t.n} attempts · ${Math.round(t.ewa * 100)}% mastery`}
                  >
                    {t.title}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        marginLeft: 6,
                        color: on
                          ? "var(--info)"
                          : "var(--ink-4)",
                      }}
                    >
                      {Math.round(t.ewa * 100)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Length selector — always visible. */}
      <section className="vidya-card-block" style={{ marginBottom: 16 }}>
        <h3 className="vidya-card-block__title" style={{ marginBottom: "var(--sp-2)" }}>
          How many items?
          <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400, marginLeft: 8 }}>
            capped at 30 per session
          </span>
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          {LIMIT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`vidya-shell__chip${limit === n ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setLimit(n)}
            >
              {n} items
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="warning" role="alert">
            {error}
          </Banner>
        </div>
      )}

      {/* Start CTA */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 16,
          background:
            "linear-gradient(135deg, rgba(245,166,35,0.10), rgba(245,166,35,0.02))",
          border: "1px solid rgba(245,166,35,0.30)",
          borderRadius: 8,
        }}
      >
        <span style={{ fontSize: 24 }}>🎯</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--ink)",
              marginBottom: 2,
            }}
          >
            {tab === "recent"
              ? `Replay your ${limit} most recent mistakes`
              : tab === "week"
                ? `Replay mistakes from the last 7 days (up to ${limit})`
                : topicId
                  ? `Replay ${limit} mistakes from ${
                      topics?.find((t) => t.topicId === topicId)?.title ??
                      "this topic"
                    }`
                  : `Pick a topic above, then start`}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {tab === "topic" && !topicId
              ? "Select a topic chip to enable Start."
              : "Items load once; you drill them all then submit."}
          </div>
        </div>
        <button
          type="button"
          className="vidya-shell__primary"
          onClick={start}
          disabled={!canStart}
        >
          {submitting ? "Starting…" : "▶ Start drill"}
        </button>
      </div>
    </div>
  );
}
// ── end MistakesPracticePanel ────────────────────────────────────────────────

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
  preferences?: { contentLanguage?: string };
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
  const [searchParams, setSearchParams] = useSearchParams();
  const examIdParam = searchParams.get("examId");
  const [examId, setExamId] = useState<string | null>(examIdParam);
  const pageTab = searchParams.get("tab") ?? "practice";

  // Safety net: this hub does not scope to a single topic. A stray/bookmarked
  // `/practice?topic=<id>` link (the old Study Map target) is redirected to
  // that topic's page so the user never lands here on unrelated content.
  const topicParam = searchParams.get("topic");
  useEffect(() => {
    if (topicParam) navigate(`/catalog/topic/${topicParam}`, { replace: true });
  }, [topicParam, navigate]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [examTopics, setExamTopics] = useState<Array<{ id: string; title: string; subjectName: string; examName?: string; examCode?: string }>>([]);
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

  // Resolve current exam: URL examId → primary enrolled exam fallback.
  useEffect(() => {
    if (!profile) return;
    const enrolled = (profile.exams ?? []).map((e) => e.examId);
    if (examIdParam && enrolled.includes(examIdParam)) { setExamId(examIdParam); return; }
    setExamId(enrolled[0] ?? null);
  }, [profile, examIdParam]);

  // Fetch the exam's topic catalog so we can cold-start the drill list.
  useEffect(() => {
    if (!examId) { setExamTopics([]); return; }
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects-with-topics`);
        if (r.ok) { const b = await r.json(); setExamTopics(b.topics ?? []); }
      } catch { /* swallow */ }
    })();
  }, [examId]);

  useEffect(() => {
    if (!user || !examId) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}?exam_id=${examId}`);
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
        const r = await auth.fetch(`/api/v1/adaptive/guided-next-steps/${user.id}?exam_id=${examId}`);
        if (r.ok) setGuided((await r.json()) as GuidedResponse);
      } catch {
        /* swallow */
      }
      // Phase 1B — readiness band + revision queue (exam-scoped).
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/readiness-band/${user.id}?target_score=0.7&days_to_exam=120&exam_id=${examId}`,
        );
        if (r.ok) setReadinessBand(await r.json());
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/revision/${user.id}?limit=5&exam_id=${examId}`,
        );
        if (r.ok) {
          const body = await r.json();
          setRevisionQueue(body.items ?? []);
        }
      } catch {
        /* swallow */
      }
    })();
  }, [user, examId]);

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
      const { contentLanguageField } = await import("../lib/session-start");
      const langField = await contentLanguageField();
      const sessionBody: Record<string, unknown> = { topicId, userId: user.id, mode: "PRACTICE", ...langField };
      const r = await auth.fetch("/api/v1/quiz/sessions/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sessionBody),
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

  const masteryByTopic = useMemo(() => {
    const m = new Map<string, { ewa: number; n: number }>();
    (mastery ?? []).forEach((t) => m.set(t.topicId, { ewa: t.ewa, n: t.n }));
    return m;
  }, [mastery]);

  const examDrills = useMemo(() =>
    examTopics.map((t) => {
      const mt = masteryByTopic.get(t.id);
      return {
        topicId: t.id,
        title: t.title,
        ewa: mt?.ewa ?? 0,
        n: mt?.n ?? 0,
        started: !!mt && mt.n > 0,
      };
    }).sort((a, b) => Number(a.started) - Number(b.started) || a.ewa - b.ewa),
  [examTopics, masteryByTopic]);

  // Paginate the weak-topic list so a full exam catalog (50-90 topics) doesn't
  // produce an unbounded column. Reset to page 0 when the exam changes.
  const DRILL_PAGE_SIZE = 8;
  const [drillPage, setDrillPage] = useState(0);
  useEffect(() => { setDrillPage(0); }, [examId]);
  const drillPageCount = Math.max(1, Math.ceil(examDrills.length / DRILL_PAGE_SIZE));
  const drillSafePage = Math.min(drillPage, drillPageCount - 1);
  const pagedDrills = examDrills.slice(
    drillSafePage * DRILL_PAGE_SIZE,
    drillSafePage * DRILL_PAGE_SIZE + DRILL_PAGE_SIZE,
  );

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
  // The diagnostic gate is a once-per-user onboarding nudge for students who
  // have NEVER practiced. It must key off GLOBAL attempts, not the per-exam
  // (exam-scoped) `mastery` — otherwise switching to a fresh exam wrongly
  // re-triggers it, and its full-screen overlay then intercepts the drill
  // buttons (clicking Drill dismisses the modal instead of starting a session).
  const [globalHasAttempts, setGlobalHasAttempts] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (r.ok) {
          const b = (await r.json()) as { topics?: Array<{ n: number }> };
          setGlobalHasAttempts((b.topics ?? []).some((t) => t.n > 0));
        } else {
          setGlobalHasAttempts(false);
        }
      } catch {
        setGlobalHasAttempts(false);
      }
    })();
  }, [user]);
  const showDiagnosticGate = !diagDismissed && globalHasAttempts === false;

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

  // Page is "empty" only when there are no exam topics to show AND mastery is
  // also empty. When an exam has topics (examDrills.length > 0) we always
  // render the drill list — cold-start students see every topic as "Not started".
  const empty = examDrills.length === 0 && (mastery !== null && mastery.length === 0);

  return (
    <VidyaShell
      crumbs="PRACTICE · WORKOUT"
      title="Practice"
      subtitle="Drill weak topics with AI-picked sessions, or replay your recent mistakes."
      chips={
        <>
          <button
            type="button"
            role="tab"
            aria-selected={pageTab !== "mistakes"}
            className={`vidya-shell__chip${pageTab !== "mistakes" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Practice
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pageTab === "mistakes"}
            className={`vidya-shell__chip${pageTab === "mistakes" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setSearchParams({ tab: "mistakes" }, { replace: true })}
          >
            🎯 Mistakes
          </button>
        </>
      }
    >
      {/* ── Mistakes tab ─────────────────────────────────────────────────── */}
      {pageTab === "mistakes" ? (
        <MistakesPracticePanel />
      ) : (
        <>
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
                className="vidya-shell__chip"
                onClick={dismissDiagnostic}
              >
                Skip — start practice
              </button>
              <Link
                to="/practice/diagnostic"
                className="vidya-shell__primary"
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

      {/* ── Phase 1B — "Today's plan" panel: readiness band + revision queue ── */}
      {(readinessBand || revisionQueue?.length) ? (
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
            to="/practice?tab=mistakes"
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

          {/* F5 — AI-suggested tests entry card (merged into MyTests ?tab=ai-suggested) */}
          <Link
            to="/practice/my-tests?tab=ai-suggested"
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
              <h2 className="section-heading">
                Drill weak topics
                {examTopics[0]?.examName || examTopics[0]?.examCode ? (
                  <span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 400, marginLeft: 6 }}>
                    · {examTopics[0]?.examName ?? examTopics[0]?.examCode}
                  </span>
                ) : null}
              </h2>
              <Link to="/catalog" className="see auth-link">
                Browse all ›
              </Link>
            </div>
            {examDrills.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--ink-4)", padding: "8px 0" }}>
                No mastery data yet.
              </div>
            ) : (
              pagedDrills.map((t) => {
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
                      {t.started ? (
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
                          <span>{t.n} session{t.n === 1 ? "" : "s"}</span>
                        </div>
                      ) : (
                        <div className="pr-drill-meta" style={{ marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--ink-4)", fontStyle: "italic" }}>Not started</span>
                        </div>
                      )}
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
            {examDrills.length > DRILL_PAGE_SIZE ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 8,
                  fontSize: 11.5,
                  color: "var(--ink-4)",
                }}
              >
                <button
                  type="button"
                  className="see auth-link"
                  disabled={drillSafePage === 0}
                  onClick={() => setDrillPage((p) => Math.max(0, p - 1))}
                  style={{ background: "none", border: "none", padding: 0, cursor: drillSafePage === 0 ? "default" : "pointer", opacity: drillSafePage === 0 ? 0.4 : 1 }}
                >
                  ‹ Prev
                </button>
                <span>
                  {drillSafePage * DRILL_PAGE_SIZE + 1}–
                  {Math.min((drillSafePage + 1) * DRILL_PAGE_SIZE, examDrills.length)} of {examDrills.length}
                </span>
                <button
                  type="button"
                  className="see auth-link"
                  disabled={drillSafePage >= drillPageCount - 1}
                  onClick={() => setDrillPage((p) => Math.min(drillPageCount - 1, p + 1))}
                  style={{ background: "none", border: "none", padding: 0, cursor: drillSafePage >= drillPageCount - 1 ? "default" : "pointer", opacity: drillSafePage >= drillPageCount - 1 ? 0.4 : 1 }}
                >
                  Next ›
                </button>
              </div>
            ) : null}
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
      </>
      )}
    </VidyaShell>
  );
}