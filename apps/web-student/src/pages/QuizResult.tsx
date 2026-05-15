import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";
import { ExplainCard } from "../components/ExplainCard";
import {
  PostQuizCalibration,
  type CalibrationFeedback,
} from "../components/PostQuizCalibration";
import { ReflectionSheet } from "../components/ReflectionSheet";
import { postReflection } from "../lib/reflection";

// Practice Results — React port of
// docs/ui/01_StudentPortal_Web/09_practice-results.html.
//
// Layout (matches the design mockup):
//   1. Score hero — green-tinted card with X/N ring, greeting,
//      meta line, primary actions, and a vertical KPI column
//      (CORRECT · WRONG · READINESS PTS).
//   2. Two-column grid:
//      • Left: AI UPDATE card — 2x2 transition tiles (mastery,
//        score band, best streak, avg time/Q) + insight bullets.
//      • Right stack: AI-recommends-next banner + mastery delta card.
//   3. Question review — horizontal rows, expand-on-click for the
//      ExplainCard teaching note.

interface ItemSummary {
  itemIdx: number;
  questionId: string;
  answerIdx?: number;
  isCorrect?: boolean;
  answered: boolean;
  stem?: string;
  choices?: string[];
  correctIdx?: number;
  explanation?: string | null;
}

interface SessionDetail {
  sessionId: string;
  userId: string;
  topicId: string;
  mode: "PRACTICE" | "MOCK";
  strategy: "irt" | "binary_search";
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  targetCount: number;
  servedCount: number;
  correctCount: number;
  startedAt?: string;
  expiresAt?: string;
  items: ItemSummary[];
}

interface Topic {
  id: string;
  title: string;
  subjectId: string;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

export function QuizResult() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [mastery, setMastery] = useState<{ ewa: number; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [reportFor, setReportFor] = useState<ItemSummary | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [aiInsights, setAiInsights] = useState<{
    diagnosis: string;
    weak_concepts: { concept: string; why: string }[];
    next_step: string;
    confidence_note: string;
    source: "ai" | "heuristic";
    model?: string | null;
    prompt_template_id?: string | null;
    prompt_template_version?: string | null;
  } | null>(null);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);
  // S51 — Zone 2 + 2.5 collapse to a one-sentence headline by default.
  // Tap "Show analysis" (or the headline itself) to reveal the full
  // breakdown + LLM insight cards. Score hero (Zone 1) and Question
  // review (Zone 3) stay visible above and below.
  const [analysisOpen, setAnalysisOpen] = useState(false);
  // S54 — post-session calibration. Stored in localStorage until Quiz Go
  // exposes a PATCH endpoint for calibration_feedback (the column landed
  // with migration 010 but the app code wires it in a follow-up).
  const calibrationKey = `quiz.calibration.v1.${sessionId ?? ""}`;
  const [calibrationInitial, setCalibrationInitial] =
    useState<CalibrationFeedback | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    try {
      const raw = window.localStorage.getItem(calibrationKey);
      if (raw === "too_easy" || raw === "right" || raw === "too_hard") {
        setCalibrationInitial(raw);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId, calibrationKey]);

  // S57 UX-27 — reflection sheet. Open once per session result on load;
  // localStorage flag prevents re-firing after the student dismisses.
  const reflectionKey = `quiz.reflection.v1.${sessionId ?? ""}`;
  const [reflectionOpen, setReflectionOpen] = useState(false);
  useEffect(() => {
    if (!sessionId) return;
    try {
      if (window.localStorage.getItem(reflectionKey) === "1") return;
    } catch {
      /* swallow */
    }
    // Defer one tick so the score band paints first.
    const t = setTimeout(() => setReflectionOpen(true), 250);
    return () => clearTimeout(t);
  }, [sessionId, reflectionKey]);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}`);
        if (!r.ok) {
          setError(
            r.status === 404 ? "Session not found." : "We couldn't load your results.",
          );
          return;
        }
        const body = (await r.json()) as SessionDetail;
        setSession(body);
        try {
          const t = await auth.fetch(`/api/v1/catalog/topics/${body.topicId}`);
          if (t.ok) setTopic((await t.json()) as Topic);
        } catch {
          /* swallow */
        }
      } catch {
        setError("We couldn't load your results.");
      }
    })();
  }, [sessionId]);

  useEffect(() => {
    if (!user || !session) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!r.ok) return;
        const body = (await r.json()) as MasteryListResponse;
        const m = body.topics.find((t) => t.topicId === session.topicId);
        if (m) setMastery({ ewa: m.ewa, n: m.n });
      } catch {
        /* swallow */
      }
    })();
  }, [user, session]);

  // P5 — call /adaptive/session-insights once we have items + topic.
  // Falls back to a deterministic heuristic when OPENAI_API_KEY is
  // unset; either way the panel renders within ~2-5 seconds.
  useEffect(() => {
    if (!session || !session.items || session.items.length === 0) return;
    (async () => {
      setAiInsights(null);
      setAiInsightsError(null);
      try {
        const r = await auth.fetch(`/api/v1/adaptive/session-insights`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            correct: session.correctCount,
            total: session.servedCount || session.items.length,
            topicTitle: topic?.title ?? null,
            language: "en",
            items: session.items
              .filter((it) => it.answered)
              .map((it) => ({
                stem: it.stem ?? "",
                choices: it.choices ?? [],
                correctIdx: it.correctIdx ?? -1,
                pickedIdx: it.answerIdx ?? null,
                isCorrect: it.isCorrect ?? null,
                topicTitle: topic?.title ?? null,
              })),
          }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setAiInsights(await r.json());
      } catch (e) {
        setAiInsightsError(
          e instanceof Error ? e.message : "Couldn't load insights.",
        );
      }
    })();
  }, [session, topic]);

  // Hydrate the bookmark set so the row UI can show filled vs. outline icons
  // without per-row round-trips.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/profile/bookmarks`);
        if (!r.ok) return;
        const body = (await r.json()) as { items: Array<{ questionId: string }> };
        setBookmarked(new Set(body.items.map((b) => b.questionId)));
      } catch {
        /* swallow */
      }
    })();
  }, [user]);

  const [askingAi, setAskingAi] = useState<string | null>(null);

  async function askAiAbout(it: ItemSummary) {
    if (!session || askingAi) return;
    setAskingAi(it.questionId);
    try {
      const r = await auth.fetch(`/api/v1/doubts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionText: it.stem ?? `Question #${it.questionId.slice(0, 8)}`,
          topicId: session.topicId,
          topicTitle: topic?.title ?? null,
        }),
      });
      if (!r.ok) return;
      const body = (await r.json()) as { id: string };
      navigate(`/doubts/${body.id}?askAi=1`);
    } finally {
      setAskingAi(null);
    }
  }

  async function submitReport(
    it: ItemSummary,
    kind: "WRONG_ANSWER" | "AMBIGUOUS" | "TYPO" | "OTHER",
    note: string,
  ) {
    setReported((prev) => new Set(prev).add(it.questionId));
    setReportFor(null);
    try {
      await auth.fetch(`/api/v1/profile/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: it.questionId,
          kind,
          note: note.trim() || null,
        }),
      });
    } catch {
      // Roll back on failure so the student can retry.
      setReported((prev) => {
        const next = new Set(prev);
        next.delete(it.questionId);
        return next;
      });
    }
  }

  async function toggleBookmark(it: ItemSummary) {
    if (!session) return;
    const isMarked = bookmarked.has(it.questionId);
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (isMarked) next.delete(it.questionId);
      else next.add(it.questionId);
      return next;
    });
    try {
      if (isMarked) {
        const r = await auth.fetch(`/api/v1/profile/bookmarks/${it.questionId}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error("delete failed");
      } else {
        const r = await auth.fetch(`/api/v1/profile/bookmarks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            questionId: it.questionId,
            topicId: session.topicId,
            topicTitle: topic?.title ?? null,
            stem: it.stem ?? null,
          }),
        });
        if (!r.ok) throw new Error("post failed");
      }
    } catch {
      // Roll back on failure.
      setBookmarked((prev) => {
        const next = new Set(prev);
        if (isMarked) next.add(it.questionId);
        else next.delete(it.questionId);
        return next;
      });
    }
  }

  if (error) {
    return (
      <AppShell title="Practice result">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate("/catalog")}
        >
          Back to catalog
        </button>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell title="Practice result">
        <SkeletonRows count={2} />
      </AppShell>
    );
  }

  const total = session.servedCount;
  const correct = session.correctCount;
  const wrong = session.items.filter((i) => i.answered && !i.isCorrect).length;
  const skipped = session.items.filter((i) => !i.answered).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const bucket: "strong" | "developing" | "weak" =
    pct >= 80 ? "strong" : pct >= 50 ? "developing" : "weak";
  const isExpired = session.status === "EXPIRED";

  // Elapsed time from startedAt; capped by the 90-min session TTL so a
  // stale "view this old result" page doesn't show a runaway clock.
  const elapsed = formatElapsed(session.startedAt);

  const greeting = user?.firstName ? user.firstName : "there";
  const headline = isExpired
    ? "Session expired"
    : pct >= 80
      ? `Great session, ${greeting}`
      : pct >= 50
        ? `Solid run, ${greeting}`
        : `Keep going, ${greeting}`;
  const headlineEmoji = isExpired ? "" : pct >= 80 ? " 🎉" : pct >= 50 ? " ✨" : " 💪";

  const sub = isExpired
    ? "The session timed out. Your answered items are still recorded."
    : `${topic?.title ?? "this topic"} · ${pct}% accuracy${elapsed ? ` · ${elapsed}` : ""}`;

  const subLine2 = isExpired
    ? null
    : pct >= 80
      ? "Strong run — your AI ability estimate moved up. Lock it in with a mock test."
      : pct >= 50
        ? "Your AI ability estimate moved up. Next session will be a touch harder."
        : "These ones will click — short focused rounds will rebuild signal fast.";

  // Mastery delta synth (matches existing approach — pre-PR change behaviour).
  const masteryNowPct = mastery ? Math.round(mastery.ewa * 100) : null;
  const masteryWasPct =
    masteryNowPct !== null && total > 0
      ? Math.max(0, Math.min(100, Math.round((masteryNowPct - 0.4 * pct) / 0.6)))
      : null;
  const masteryDelta =
    masteryNowPct !== null && masteryWasPct !== null
      ? masteryNowPct - masteryWasPct
      : null;

  // Streaks for the AI-update tile + insight bullet.
  const { maxStreak } = computeStreaks(session.items);
  const avgSecPerQ = total > 0 ? Math.max(15, Math.round(60 * (estMinsTotal(total) / total))) : null;
  // Per-session readiness contribution (proxy): mastery delta scaled —
  // matches the design's "+1.8 readiness pts" magnitude.
  const readinessDelta = masteryDelta !== null ? Math.max(0, +(masteryDelta * 0.2).toFixed(1)) : null;

  const insights = buildInsights({
    correct,
    wrong,
    skipped,
    total,
    pct,
    isExpired,
    items: session.items,
    topicTitle: topic?.title,
    masteryDelta,
  });

  // Topbar chips (right-aligned): exam-name placeholder + elapsed time
  const chips = [];
  if (elapsed) chips.push({ label: `⏱ ${elapsed}` });

  return (
    <AppShell
      title={`Session Complete${topic?.title ? ` · ${topic.title}` : ""}`}
      chips={chips}
      actions={
        <Link to="/catalog" className="topbar-back">
          ← Catalog
        </Link>
      }
    >
      {/* ── Zone 1: Score hero ──────────────────────────────────────── */}
      <section
        className="exam-hero"
        aria-label="Practice result"
        style={
          // Tint the hero by score band to match the design.
          bucket === "weak"
            ? { borderColor: "rgba(244,63,94,0.22)" }
            : bucket === "developing"
              ? { borderColor: "rgba(245,166,35,0.22)" }
              : undefined
        }
      >
        <div className="eh-left">
          <div className="eh-tag" style={{ flexWrap: "wrap" }}>
            <span className="ai-pill">◈ PRACTICE RESULT</span>
            {topic ? (
              <Link
                to={`/catalog/topic/${topic.id}`}
                className="auth-link"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                {topic.title}
              </Link>
            ) : null}
            <Pill tone={isExpired ? "danger" : pct >= 80 ? "success" : pct >= 50 ? "warning" : "info"}>
              {isExpired ? "Expired" : "Submitted"}
            </Pill>
          </div>
          <h1 className="eh-title">
            {headline}
            {headlineEmoji}
          </h1>
          <p className="eh-sub">
            {sub}
            {subLine2 ? (
              <>
                <br />
                {subLine2}
              </>
            ) : null}
          </p>
          <div className="eh-btns">
            <button
              type="button"
              className="btn-ai"
              onClick={() => topic && navigate(`/catalog/topic/${topic.id}`)}
              disabled={!topic}
            >
              ◈ Practice Again
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const el = document.getElementById("question-review");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Review Answers
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate("/catalog")}
            >
              Back to catalog →
            </button>
          </div>
        </div>

        <div className="eh-right">
          <ScoreRing correct={correct} total={total} bucket={bucket} />
          <div className="eh-stats">
            <div className="eh-stat">
              <div className="eh-stat-num" style={{ color: "var(--color-green)" }}>{correct}</div>
              <div className="eh-stat-lbl">CORRECT</div>
            </div>
            <div className="eh-stat">
              <div className="eh-stat-num" style={{ color: "var(--color-red)" }}>
                {wrong}
                {skipped > 0 ? <span style={{ fontSize: 11, color: "var(--text-faint)" }}>+{skipped} skip</span> : null}
              </div>
              <div className="eh-stat-lbl">{skipped > 0 ? "WRONG · SKIP" : "WRONG"}</div>
            </div>
            {readinessDelta !== null && readinessDelta > 0 ? (
              <div className="eh-stat">
                <div className="eh-stat-num" style={{ color: "var(--color-ai)" }}>+{readinessDelta}</div>
                <div className="eh-stat-lbl">READINESS PTS</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Phase 6 S54 — post-session calibration ──────────────────
          Three-bucket feedback (too_easy / right / too_hard) PATCHed
          into quiz_sessions.calibration_feedback. localStorage echo
          gives the page an instant pre-selected state after a refresh
          without an extra round-trip. */}
      {sessionId && (
        <PostQuizCalibration
          sessionId={sessionId}
          initialValue={calibrationInitial}
          onSubmit={async (value) => {
            const r = await auth.fetch(
              `/api/v1/quiz/sessions/${sessionId}/calibration`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ feedback: value }),
              },
            );
            if (!r.ok) {
              throw new Error(`calibration PATCH failed: HTTP ${r.status}`);
            }
            // Optimistic localStorage echo so reload pre-selects the
            // saved bucket without a fetch.
            try {
              window.localStorage.setItem(calibrationKey, value);
            } catch {
              /* swallow */
            }
          }}
        />
      )}

      {/* ── Zone 2 headline + collapse toggle (S51) ─────────────────
          One-sentence summary the student can act on without reading
          the full analysis. The detailed breakdown + LLM insight cards
          unfurl when expanded; collapsed is the default per spec. */}
      <section
        aria-label="Session analysis summary"
        className="qr-analysis-summary"
        style={{ marginTop: "var(--sp-4)" }}
      >
        <button
          type="button"
          className="qr-analysis-headline"
          onClick={() => setAnalysisOpen((v) => !v)}
          aria-expanded={analysisOpen}
          aria-controls="qr-analysis-detail"
        >
          <span className="qr-analysis-glyph">✦</span>
          <span className="qr-analysis-text">
            {pct >= 80
              ? "Strong round — try the next difficulty band when you come back."
              : pct >= 50
                ? "Steady round — a couple of weak points worth a quick revisit."
                : "Foundation round — spend a session on the basics before another mock."}
          </span>
          <span className="qr-analysis-toggle">
            {analysisOpen ? "Hide analysis ▴" : "Show analysis ▾"}
          </span>
        </button>
      </section>

      {/* ── Zone 2: Two-column — AI UPDATE + (reco + mastery delta) ── */}
      <div
        id="qr-analysis-detail"
        hidden={!analysisOpen}
        className="dashboard-bottom-grid"
        style={{ marginTop: "var(--sp-4)" }}
      >
        {/* Left: Session breakdown — basic stats. Honest naming:
            this card is just arithmetic over correct/wrong/time, no
            LLM is involved. The real AI insights live below. */}
        <div className="insight-card">
          <div className="ins-eyebrow">
            <span>📊</span> Session breakdown
          </div>

          <div className="au-grid">
            {/* Tile 1: Topic mastery transition */}
            {masteryNowPct !== null && masteryWasPct !== null ? (
              <div className="au-stat">
                <div className="au-before">{topic?.title ?? "Topic"} mastery</div>
                <div className="au-arrow-row">
                  <span className="au-from">{masteryWasPct}%</span>
                  <span className="au-arrow">→</span>
                  <span
                    className={
                      "au-to" +
                      (masteryDelta !== null && masteryDelta < 0 ? " au-to-amber" : "")
                    }
                  >
                    {masteryNowPct}%
                  </span>
                </div>
                <div className="au-lbl">
                  {masteryDelta !== null && masteryDelta > 0
                    ? `+${masteryDelta} pts ↑`
                    : masteryDelta !== null && masteryDelta < 0
                      ? `${masteryDelta} pts ↓`
                      : "steady"}
                </div>
              </div>
            ) : (
              <div className="au-stat">
                <div className="au-before">{topic?.title ?? "Topic"} mastery</div>
                <div className="au-arrow-row">
                  <span className="au-to au-to-blue">—</span>
                </div>
                <div className="au-lbl">first session — building signal</div>
              </div>
            )}

            {/* Tile 2: This session score */}
            <div className="au-stat">
              <div className="au-before">This session</div>
              <div className="au-arrow-row">
                <span
                  className={
                    "au-to" +
                    (bucket === "weak"
                      ? " au-to-amber"
                      : bucket === "developing"
                        ? " au-to-blue"
                        : "")
                  }
                >
                  {correct}/{total}
                </span>
                <span className="au-from" style={{ fontSize: 12 }}>
                  · {pct}%
                </span>
              </div>
              <div className="au-lbl">
                {bucket === "strong" ? "STRONG band" : bucket === "developing" ? "DEVELOPING band" : "WEAK band"}
              </div>
            </div>

            {/* Tile 3: Best correct streak */}
            <div className="au-stat">
              <div className="au-before">Best streak</div>
              <div className="au-arrow-row">
                <span className="au-to">{maxStreak}</span>
                <span className="au-from" style={{ fontSize: 12 }}>
                  in a row
                </span>
              </div>
              <div className="au-lbl">
                {maxStreak >= 4 ? "concept recall is sticky" : maxStreak >= 2 ? "good rhythm" : "—"}
              </div>
            </div>

            {/* Tile 4: Avg time per question */}
            <div className="au-stat">
              <div className="au-before">Avg time / question</div>
              <div className="au-arrow-row">
                <span className="au-to au-to-ai">~{avgSecPerQ ?? "—"}s</span>
              </div>
              <div className="au-lbl">
                {session.mode === "MOCK" ? "Mock pace" : "Practice pace"}
              </div>
            </div>
          </div>

          {insights.length > 0 ? (
            <>
              <div className="au-divider" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {insights.map((ins, i) => (
                  <div key={i} className="ai-insight-row">
                    <div
                      className="ai-insight-dot"
                      style={{ background: ins.color }}
                    />
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                      }}
                      dangerouslySetInnerHTML={{ __html: ins.text }}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Right: Reco banner + mastery delta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!isExpired && pct < 80 && topic ? (
            <Link to={`/catalog/topic/${topic.id}`} className="reco-banner">
              <div className="reco-icon">⚡</div>
              <div className="reco-body">
                <div className="reco-eyebrow">◈ AI RECOMMENDS · NEXT</div>
                <div className="reco-title">
                  Run another round on {topic.title}
                </div>
                <div className="reco-sub">
                  Focus on the misses below — the IRT engine picks items at
                  your edge of difficulty.
                </div>
                <div className="reco-impact">
                  ▲ Est. +{Math.max(2, Math.round((100 - pct) / 20))} readiness
                  pts · ~10 min
                </div>
              </div>
              <span className="btn-ai" style={{ flexShrink: 0 }}>
                Start →
              </span>
            </Link>
          ) : !isExpired && topic ? (
            <Link to="/catalog" className="reco-banner">
              <div className="reco-icon">🎯</div>
              <div className="reco-body">
                <div className="reco-eyebrow">◈ AI RECOMMENDS · NEXT</div>
                <div className="reco-title">Try a mock to lock it in</div>
                <div className="reco-sub">
                  You hit the strong band — a timed mock will surface anything
                  shaky under pressure.
                </div>
                <div className="reco-impact">▲ Picks weak topics next · ~25 min</div>
              </div>
              <span className="btn-ai" style={{ flexShrink: 0 }}>
                Browse →
              </span>
            </Link>
          ) : null}

          {masteryNowPct !== null && masteryWasPct !== null ? (
            <div className="mastery-delta-card">
              <div style={{ flex: "0 0 auto", minWidth: 160 }}>
                <div className="md-label">{topic?.title ?? "Topic"} mastery</div>
                <div className="md-pair" style={{ marginTop: 6 }}>
                  <span className="md-was">{masteryWasPct}%</span>
                  <span className="md-arrow">→</span>
                  <span
                    className="md-now"
                    style={{
                      color:
                        masteryDelta && masteryDelta > 0
                          ? "var(--color-green)"
                          : masteryDelta && masteryDelta < 0
                            ? "var(--color-red)"
                            : "var(--text-muted)",
                    }}
                  >
                    {masteryNowPct}%
                  </span>
                  {masteryDelta !== null ? (
                    <span
                      className={`md-delta-badge ${
                        masteryDelta > 0
                          ? "md-delta-up"
                          : masteryDelta < 0
                            ? "md-delta-down"
                            : "md-delta-flat"
                      }`}
                    >
                      {masteryDelta > 0 ? "▲" : masteryDelta < 0 ? "▼" : "•"}{" "}
                      {Math.abs(masteryDelta)} pts
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="md-text">
                {masteryDelta !== null && masteryDelta > 0 ? (
                  <>
                    Mastery moved <strong>+{masteryDelta} pts</strong> this
                    session — keep cadence to push the next band.
                  </>
                ) : masteryDelta !== null && masteryDelta < 0 ? (
                  <>
                    Mastery dipped this session — the IRT engine will pick
                    easier items next time to rebuild signal.
                  </>
                ) : (
                  <>
                    Mastery held steady. Next round will pick items closer to
                    your edge.
                  </>
                )}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Zone 2.5: Real AI insights — the LLM analyses the
          pattern of mistakes, not just the count. Replaces the
          rule-based "AI UPDATE" theatre that was here before.
          S51 — gated by analysisOpen so the score band → review
          path stays short. */}
      <section
        aria-label="AI insights"
        hidden={!analysisOpen}
        style={{
          marginTop: "var(--sp-5)",
          padding: "20px 22px",
          background:
            "linear-gradient(135deg, rgba(34,212,238,0.08), rgba(79,135,246,0.06))",
          border: "1px solid rgba(34,212,238,0.25)",
          borderRadius: "var(--radius-lg, 13px)",
          color: "var(--text-primary, #EEF2FF)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "var(--color-ai, #22D4EE)",
            }}
          >
            ✨ AI insights — pattern analysis
          </div>
          {aiInsights && (
            <div
              style={{
                fontSize: 10,
                color: "var(--text-faint, #7A8BAD)",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {aiInsights.source === "ai"
                ? `${aiInsights.model ?? "ai"} · ${aiInsights.prompt_template_id}@${aiInsights.prompt_template_version}`
                : "deterministic fallback (no OPENAI_API_KEY)"}
            </div>
          )}
        </div>

        {!aiInsights && !aiInsightsError && (
          <div style={{ color: "var(--text-faint, #7A8BAD)", fontSize: 13 }}>
            Analysing your answer pattern…
          </div>
        )}
        {aiInsightsError && (
          <div style={{ color: "var(--color-amber, #F5A623)", fontSize: 13 }}>
            Insights unavailable: {aiInsightsError}
          </div>
        )}
        {aiInsights && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: "var(--text-faint, #7A8BAD)",
                  marginBottom: 4,
                }}
              >
                Diagnosis
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
                {aiInsights.diagnosis}
              </p>
            </div>

            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: "var(--text-faint, #7A8BAD)",
                  marginBottom: 6,
                }}
              >
                Where to drill next
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {aiInsights.weak_concepts.map((c, i) => (
                  <li key={i} style={{ marginBottom: 6, fontSize: 13 }}>
                    <strong style={{ color: "var(--color-blue, #4F87F6)" }}>
                      {c.concept}
                    </strong>
                    <span style={{ color: "var(--text-secondary, #B8C5E0)" }}>
                      {" "}
                      — {c.why}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                paddingTop: 8,
                borderTop: "1px solid rgba(34,212,238,0.15)",
              }}
            >
              <div style={{ flex: "1 1 320px" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: "var(--text-faint, #7A8BAD)",
                  }}
                >
                  Next step
                </div>
                <p
                  style={{
                    margin: "2px 0 0 0",
                    fontSize: 13,
                    color: "var(--color-green, #10C47A)",
                    fontWeight: 500,
                  }}
                >
                  → {aiInsights.next_step}
                </p>
              </div>
              <div style={{ flex: "1 1 280px" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: "var(--text-faint, #7A8BAD)",
                  }}
                >
                  Confidence
                </div>
                <p
                  style={{
                    margin: "2px 0 0 0",
                    fontSize: 12,
                    color: "var(--text-secondary, #B8C5E0)",
                    fontStyle: "italic",
                  }}
                >
                  {aiInsights.confidence_note}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Zone 3: Question review (rows) ─────────────────────────── */}
      <section id="question-review" style={{ marginTop: "var(--sp-5)" }}>
        <div className="sec-row">
          <h2 className="section-heading">
            Question review · {session.items.length} questions
          </h2>
          <button
            type="button"
            className="see"
            style={{
              fontSize: 11,
              color: "var(--color-blue)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            onClick={() => setOpenIdx(openIdx === -1 ? null : -1)}
          >
            {openIdx === -1 ? "Collapse all" : "Expand all"}
          </button>
        </div>

        <ol className="item-review-rows">
          {session.items.map((it) => {
            const cls = it.answered
              ? it.isCorrect
                ? "qr-row qr-correct"
                : "qr-row qr-wrong"
              : "qr-row qr-skipped";
            const isOpen = openIdx === -1 || openIdx === it.itemIdx;
            const stemPreview =
              it.stem ?? `Question ${it.itemIdx + 1} · #${it.questionId.slice(0, 8)}`;
            const isBookmarked = bookmarked.has(it.questionId);
            return (
              <li key={it.itemIdx} className={cls}>
                <div
                  className="qr-head"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? null : it.itemIdx)}
                    aria-expanded={isOpen}
                    style={{
                      display: "contents",
                      background: "transparent",
                      border: 0,
                      cursor: "pointer",
                      font: "inherit",
                      color: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <span className="qr-num">{it.itemIdx + 1}</span>
                    <div className="qr-body">
                      <div className="qr-q">{stemPreview}</div>
                      <div className="qr-meta">
                        {it.answered ? (
                          it.isCorrect ? (
                            <Pill tone="success">✓ CORRECT</Pill>
                          ) : (
                            <Pill tone="danger">✗ WRONG</Pill>
                          )
                        ) : (
                          <Pill tone="muted">SKIPPED</Pill>
                        )}
                        {it.answered && it.answerIdx !== undefined ? (
                          <span className="qr-meta-text">
                            Picked {String.fromCharCode(65 + it.answerIdx)}
                            {it.isCorrect === false && it.correctIdx !== undefined
                              ? ` · correct ${String.fromCharCode(65 + it.correctIdx)}`
                              : ""}
                          </span>
                        ) : (
                          <span className="qr-meta-text">#{it.questionId.slice(0, 8)}</span>
                        )}
                      </div>
                    </div>
                    <span className="qr-toggle">{isOpen ? "Hide" : "Review"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBookmark(it);
                    }}
                    aria-label={isBookmarked ? "Remove bookmark" : "Save question"}
                    title={isBookmarked ? "Remove bookmark" : "Save question"}
                    style={{
                      background: "transparent",
                      border: 0,
                      cursor: "pointer",
                      padding: 6,
                      lineHeight: 0,
                      color: isBookmarked ? "var(--color-amber)" : "var(--text-muted)",
                      fontSize: 18,
                    }}
                  >
                    {isBookmarked ? "★" : "☆"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!reported.has(it.questionId)) setReportFor(it);
                    }}
                    aria-label={
                      reported.has(it.questionId)
                        ? "Issue already reported"
                        : "Report an issue with this question"
                    }
                    title={
                      reported.has(it.questionId)
                        ? "Issue reported · thanks"
                        : "Report an issue"
                    }
                    disabled={reported.has(it.questionId)}
                    style={{
                      background: "transparent",
                      border: 0,
                      cursor: reported.has(it.questionId) ? "default" : "pointer",
                      padding: 6,
                      lineHeight: 0,
                      color: reported.has(it.questionId)
                        ? "var(--color-green)"
                        : "var(--text-muted)",
                      fontSize: 16,
                    }}
                  >
                    {reported.has(it.questionId) ? "✓" : "⚑"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      askAiAbout(it);
                    }}
                    aria-label="Ask AI Tutor about this question"
                    title="Ask AI Tutor"
                    disabled={askingAi !== null}
                    style={{
                      background: "transparent",
                      border: 0,
                      cursor: askingAi ? "wait" : "pointer",
                      padding: 6,
                      lineHeight: 0,
                      color: askingAi === it.questionId
                        ? "var(--color-ai)"
                        : "var(--text-muted)",
                      fontSize: 14,
                    }}
                  >
                    {askingAi === it.questionId ? "…" : "◈"}
                  </button>
                </div>

                {isOpen ? (
                  <div className="qr-expand">
                    <ExplainCard
                      itemIdx={it.itemIdx}
                      questionId={it.questionId}
                      topicId={session.topicId}
                      stem={it.stem}
                      choices={it.choices}
                      correctIdx={it.correctIdx}
                      pickedIdx={it.answerIdx}
                      answered={it.answered}
                      isCorrect={it.isCorrect}
                      storedExplanation={it.explanation}
                      topicTitle={topic?.title}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {reportFor ? (
        <ReportIssueModal
          item={reportFor}
          onCancel={() => setReportFor(null)}
          onSubmit={(kind, note) => submitReport(reportFor, kind, note)}
        />
      ) : null}

      {/* S57 UX-27 — post-session reflection + commitment. */}
      {user && sessionId && (
        <ReflectionSheet
          open={reflectionOpen}
          trigger="session"
          triggerArtifactId={sessionId}
          onClose={() => {
            setReflectionOpen(false);
            try {
              window.localStorage.setItem(reflectionKey, "1");
            } catch {
              /* swallow */
            }
          }}
          onSubmit={async ({ response, commitment, commitmentDueAt }) => {
            await postReflection({
              userId: user.id,
              trigger: "session",
              triggerArtifactId: sessionId,
              response,
              commitment: commitment ?? undefined,
              commitmentDueAt: commitmentDueAt ?? undefined,
            });
          }}
        />
      )}
    </AppShell>
  );
}

function ReportIssueModal({
  item,
  onCancel,
  onSubmit,
}: {
  item: ItemSummary;
  onCancel: () => void;
  onSubmit: (
    kind: "WRONG_ANSWER" | "AMBIGUOUS" | "TYPO" | "OTHER",
    note: string,
  ) => void;
}) {
  const [kind, setKind] = useState<"WRONG_ANSWER" | "AMBIGUOUS" | "TYPO" | "OTHER">("AMBIGUOUS");
  const [note, setNote] = useState("");
  const stemPreview =
    (item.stem ?? `Question #${item.questionId.slice(0, 8)}`).slice(0, 200);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "var(--sp-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: 14,
          padding: "var(--sp-5)",
          width: "min(480px, 100%)",
          color: "var(--text-primary)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          Report an issue
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Q{item.itemIdx + 1} · {stemPreview}
          {(item.stem ?? "").length > 200 ? "…" : ""}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {[
            { id: "WRONG_ANSWER", label: "The marked answer is wrong" },
            { id: "AMBIGUOUS", label: "Multiple answers seem valid" },
            { id: "TYPO", label: "Typo or formatting issue" },
            { id: "OTHER", label: "Something else" },
          ].map((opt) => (
            <label
              key={opt.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${kind === opt.id ? "var(--color-blue)" : "var(--border-default)"}`,
                background: kind === opt.id ? "var(--bg-surface-2)" : "transparent",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <input
                type="radio"
                name="kind"
                checked={kind === opt.id}
                onChange={() => setKind(opt.id as typeof kind)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={3}
          maxLength={500}
          placeholder="Optional — what went wrong?"
          style={{
            width: "100%",
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            color: "var(--text-primary)",
            padding: 10,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            marginBottom: 8,
          }}
        />
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 16 }}>
          {note.length}/500
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSubmit(kind, note)}
          >
            Submit report
          </button>
        </div>
      </div>
    </div>
  );
}

// Score ring — shows correct/total in the centre, ring colour by band.
function ScoreRing({
  correct,
  total,
  bucket,
}: {
  correct: number;
  total: number;
  bucket: "strong" | "developing" | "weak";
}) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? correct / total : 0;
  const offset = circ - pct * circ;
  const stroke =
    bucket === "strong" ? "#10C47A" : bucket === "developing" ? "#F5A623" : "#F43F5E";
  return (
    <div
      className="eh-ring"
      role="img"
      aria-label={`Score ${correct} out of ${total}`}
    >
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="result-rg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} />
            <stop offset="100%" stopColor="#22D4EE" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#result-rg)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="eh-ring-inner">
        <div
          className="eh-ring-num"
          style={{
            // Override the green→blue gradient when in lower bands.
            background:
              bucket === "weak"
                ? "linear-gradient(135deg,#F43F5E,#F5A623)"
                : bucket === "developing"
                  ? "linear-gradient(135deg,#F5A623,#4F87F6)"
                  : undefined,
            WebkitBackgroundClip: bucket === "strong" ? undefined : "text",
            WebkitTextFillColor: bucket === "strong" ? undefined : "transparent",
          }}
        >
          {correct}/{total}
        </div>
        <div className="eh-ring-lbl">SCORE</div>
      </div>
    </div>
  );
}

// Format elapsed time as "X min Y sec" / "Y sec" given an ISO startedAt.
// Returns null if no startedAt or elapsed > 90 minutes (session TTL — we
// assume a stale view past that).
function formatElapsed(startedAt?: string): string | null {
  if (!startedAt) return null;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec === 0 || sec > 90 * 60) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

// Estimate total minutes spent — fallback when startedAt is unavailable.
function estMinsTotal(total: number): number {
  return Math.max(1, Math.round((total * 35) / 60));
}

function computeStreaks(items: ItemSummary[]): {
  maxStreak: number;
  maxWrongStreak: number;
} {
  let cur = 0;
  let max = 0;
  let curW = 0;
  let maxW = 0;
  for (const it of items) {
    if (it.answered && it.isCorrect) {
      cur++;
      curW = 0;
      if (cur > max) max = cur;
    } else if (it.answered && !it.isCorrect) {
      curW++;
      cur = 0;
      if (curW > maxW) maxW = curW;
    } else {
      cur = 0;
      curW = 0;
    }
  }
  return { maxStreak: max, maxWrongStreak: maxW };
}

interface InsightLine {
  text: string;
  color: string; // CSS colour string for the dot
}

function buildInsights(args: {
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  pct: number;
  isExpired: boolean;
  items: ItemSummary[];
  topicTitle?: string;
  masteryDelta: number | null;
}): InsightLine[] {
  const out: InsightLine[] = [];
  const { wrong, skipped, total, pct, isExpired, items, masteryDelta } = args;

  if (isExpired) {
    out.push({
      text: `<strong>Session expired</strong> — start a fresh round to keep momentum. The IRT engine still has all your prior data.`,
      color: "var(--color-amber)",
    });
    return out;
  }

  if (masteryDelta !== null && masteryDelta > 0) {
    out.push({
      text: `Mastery moved <strong>+${masteryDelta} pts</strong> — decay recovered, signal building.`,
      color: "var(--color-green)",
    });
  }

  const { maxWrongStreak } = computeStreaks(items);
  if (wrong >= 3 || maxWrongStreak >= 3) {
    out.push({
      text: `<strong>${wrong} wrong</strong> — usually a single concept gap. One focused round on the misses below tends to clear it.`,
      color: "var(--color-amber)",
    });
  }

  if (skipped > 0) {
    out.push({
      text: `<strong>${skipped} skipped</strong> — partial sessions don't build mastery as fast. Aim to finish the next round.`,
      color: "var(--color-amber)",
    });
  }

  if (pct >= 80 && total >= 5) {
    out.push({
      text: `Next session will start at <strong>Hard difficulty</strong> based on your updated ability estimate.`,
      color: "var(--color-blue)",
    });
  } else if (pct < 50 && total >= 5) {
    out.push({
      text: `Next session will pick <strong>easier items</strong> to rebuild a clean signal before stretching again.`,
      color: "var(--color-blue)",
    });
  }

  return out.slice(0, 4);
}
