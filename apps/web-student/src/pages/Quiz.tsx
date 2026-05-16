import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { useIsMobileViewport } from "../lib/use-viewport";
import { QuizOfflineQueue } from "../lib/quiz-offline-queue";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";
import { QuizPlayer } from "../components/QuizPlayer";
import { QuizSessionMenu } from "../components/QuizSessionMenu";
import { FrictionPrompt } from "../components/FrictionPrompt";
import { IntentSelector } from "../components/IntentSelector";
import {
  checkFriction,
  loadIntentForTopic,
  saveIntentForTopic,
  type FrictionAction,
  type FrictionItemAttempt,
  type FrictionTrigger,
  type IntentAnchor,
} from "../lib/difficulty-agency";

// ─────────────────────────────────────────────────────────────────────────
// Quiz play (AI Practice) — React port of
// docs/ui/01_StudentPortal_Web/08_ai-practice.html.
//
// Layout (top-to-bottom inside AppShell main):
//   1. Session bar — back-to-study-map, topic name + sub, timer, exit
//   2. Progress strip — N color-coded pills + "Q i of N" label
//   3. AI context bar — Difficulty · IRT b · diff pips · Session accuracy ·
//      Ability θ
//   4. Body (2-col):
//      • Left: Question with stem + options + explanation + AI feedback
//      • Right (280px): Mastery ring, Ability gauge, Q grid, session stats
//   5. Footer — Hint / Bookmark / Skip on left, Submit / Next on right
//
// Data wiring (real vs synthesised):
//   • Real: quiz/sessions/<id>/next, quiz/sessions/<id>/answers,
//     quiz/sessions/<id> (for counts, items array, topicId), catalog/topics
//     (topic name), analytics/mastery (per-topic mastery for ring).
//   • Synthesised: timer (counts up from page load — real session
//     expires_at not surfaced yet), IRT b per question (Quiz /next
//     doesn't include it yet — labelled "Adaptive" until exposed),
//     ability θ (adaptive-engine returns ability after answer but
//     not in answer response yet — running accuracy stands in).
// ─────────────────────────────────────────────────────────────────────────

interface QuizItem {
  itemIdx: number;
  questionId: string;
  stem: string;
  choices: string[];
  // P5-S60 — polymorphic types. Quiz Go's /next response now carries
  // question_type + the typed payload for non-MCQ types. MCQ_SINGLE
  // ignores `payload` and uses the legacy choices array.
  questionType?: string;
  payload?: Record<string, unknown>;
}

interface NextResponse {
  sessionId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  done: boolean;
  item?: QuizItem;
}

interface AnswerResponse {
  sessionId: string;
  itemIdx: number;
  isCorrect: boolean;
  correctIdx: number;
  servedCount: number;
  correctCount: number;
}

interface ItemSummary {
  itemIdx: number;
  questionId: string;
  answerIdx?: number;
  isCorrect?: boolean;
  answered: boolean;
}

interface SessionDetail {
  sessionId: string;
  userId: string;
  topicId: string;
  mode: "PRACTICE" | "MOCK";
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  targetCount: number;
  servedCount: number;
  correctCount: number;
  items: ItemSummary[];
}

interface Topic {
  id: string;
  title: string;
  subjectId: string;
  description?: string | null;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

export function Quiz() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobileViewport();

  // S51 UX-32 v0 — offline answer queue. Persists each /answers POST
  // when the network fails so the answer isn't lost; drain on mount.
  const offlineQueueRef = useRef<QuizOfflineQueue>(new QuizOfflineQueue());
  const [offlinePending, setOfflinePending] = useState(0);
  const [offlineReplayed, setOfflineReplayed] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);

  const [item, setItem] = useState<QuizItem | null>(null);
  const [done, setDone] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  // P5-S60 — generic response payload for non-MCQ types. The
  // dispatcher's renderer drives this; MCQ_SINGLE keeps using
  // selectedIdx because Quiz Go inlines the grade for that path.
  const [responsePayload, setResponsePayload] = useState<unknown>(null);
  const [verdict, setVerdict] = useState<AnswerResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [topicMastery, setTopicMastery] = useState<{ ewa: number; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0); // seconds since page load
  // Bookmarks live in localStorage until backend persistence ships —
  // session-scoped key so a single quiz's flagged questions stay
  // together. Hydrated once on mount.
  const bookmarkStorageKey = `quiz:${sessionId}:bookmarks`;
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`quiz:${sessionId}:bookmarks`);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });
  // Hint state: a transient inline note next to the question. Hints
  // aren't authored on questions yet, so the click surfaces an
  // honest "not available" message instead of silently doing nothing.
  const [hintNote, setHintNote] = useState<string | null>(null);

  // ─── Phase 6 S54 — difficulty agency state ─────────────────────────
  //
  // Three pieces:
  //   1. friction history: { item_idx, is_correct, time_spent_ms, skipped }
  //      accumulated per answer; submitted to /adaptive/friction/check.
  //   2. lastFrictionAtIdx: short-circuits subsequent checks per ADR-0022
  //      (at most one prompt per session).
  //   3. intent picker modal: lets the student pick match/push/build_
  //      confidence via the session menu; persisted per-topic in
  //      localStorage until quiz/sessions/start accepts intent_anchor.
  const frictionHistoryRef = useRef<FrictionItemAttempt[]>([]);
  const questionStartedAtRef = useRef<number>(Date.now());
  const [frictionTrigger, setFrictionTrigger] =
    useState<FrictionTrigger | null>(null);
  const [lastFrictionAtIdx, setLastFrictionAtIdx] = useState<number | null>(
    null,
  );
  const [pendingIntentOffset, setPendingIntentOffset] = useState<
    number | null
  >(null);
  const [intentModalOpen, setIntentModalOpen] = useState(false);
  const [intent, setIntent] = useState<IntentAnchor>("match");

  // Timer — counts up from page load. Until quiz/sessions exposes
  // expires_at this is the closest stand-in for the mockup's MM:SS chip.
  useEffect(() => {
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fetchNext = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    setSelectedIdx(null);
    setResponsePayload(null);
    setVerdict(null);
    setHintNote(null);
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/next`);
      if (r.status === 409) {
        navigate(`/quiz/${sessionId}/result`, { replace: true });
        return;
      }
      if (r.status === 404) {
        setError("Session not found.");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as NextResponse;
      if (body.done) {
        setDone(true);
        setItem(null);
        return;
      }
      setItem(body.item ?? null);
      // S54 — reset the per-question timer when a new item lands.
      // checkFriction needs time_spent_ms per answer.
      questionStartedAtRef.current = Date.now();
    } catch {
      setError("We couldn't load the next question.");
    }
  }, [sessionId, navigate]);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}`);
      if (!r.ok) return;
      const body = (await r.json()) as SessionDetail;
      setSession(body);
      if (body.status !== "IN_PROGRESS") {
        navigate(`/quiz/${sessionId}/result`, { replace: true });
      }
    } catch {
      /* best-effort */
    }
  }, [sessionId, navigate]);

  // Hydrate topic name (for session bar) + topic mastery (for right-panel ring).
  useEffect(() => {
    if (!session) return;
    // S54 — hydrate the per-topic intent from localStorage so the
    // session menu shows the student's last choice as the active
    // option. When quiz/sessions/start accepts intent_anchor we
    // can read it from the session payload instead.
    const stored = loadIntentForTopic(session.topicId);
    if (stored) setIntent(stored);
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/topics/${session.topicId}`);
        if (r.ok) setTopic((await r.json()) as Topic);
      } catch {
        /* swallow */
      }
    })();
    if (user) {
      (async () => {
        try {
          const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
          if (!r.ok) return;
          const body = (await r.json()) as MasteryListResponse;
          const m = body.topics.find((t) => t.topicId === session.topicId);
          if (m) setTopicMastery({ ewa: m.ewa, n: m.n });
        } catch {
          /* swallow */
        }
      })();
    }
  }, [session, user]);

  useEffect(() => {
    fetchSession();
    fetchNext();
  }, [fetchSession, fetchNext]);

  // S51 UX-32 — drain queued answers on mount + whenever connectivity
  // returns. Quiz Go /answers is idempotent on (session_id, item_idx)
  // per Sprint-1 GAP-08 so re-sending duplicates is safe.
  const drainOfflineQueue = useCallback(async () => {
    if (!sessionId) return;
    const queue = offlineQueueRef.current;
    const replayed = await queue.drain(sessionId, async (entry) => {
      const r = await auth.fetch(
        `/api/v1/quiz/sessions/${sessionId}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemIdx: entry.itemIdx,
            ...(entry.answerIdx !== undefined
              ? { answerIdx: entry.answerIdx }
              : {}),
            ...(entry.responsePayload !== undefined
              ? { responsePayload: entry.responsePayload }
              : {}),
          }),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as AnswerResponse;
    });
    if (replayed > 0) {
      setOfflineReplayed(true);
      fetchSession(); // refresh counts after replay.
    }
    setOfflinePending(queue.load(sessionId).length);
  }, [sessionId, fetchSession]);

  useEffect(() => {
    drainOfflineQueue();
    const onOnline = () => drainOfflineQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [drainOfflineQueue]);

  async function submitAnswer() {
    if (!sessionId || !item || submitting) return;

    // P5-S60 — branch on question_type. MCQ_SINGLE keeps the
    // legacy answerIdx path (Quiz Go inlines the grade in <5 ms).
    // Other types ship the responsePayload through Quiz Go's
    // generic branch which routes to /grading/grade in alp-learning.
    const isLegacyMcq =
      !item.questionType || item.questionType === "MCQ_SINGLE";

    if (isLegacyMcq && selectedIdx === null) return;
    if (!isLegacyMcq && responsePayload === null) return;

    setSubmitting(true);
    const body = isLegacyMcq
      ? { itemIdx: item.itemIdx, answerIdx: selectedIdx ?? undefined }
      : { itemIdx: item.itemIdx, responsePayload };
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const respBody = (await r.json()) as AnswerResponse;
      setVerdict(respBody);
      // Drop any stale queue entry for this item now that the server
      // has accepted it (safe even if there was none).
      offlineQueueRef.current.remove(sessionId, item.itemIdx);
      setOfflinePending(offlineQueueRef.current.load(sessionId).length);
      // Re-fetch the session so the items[] (q-grid) updates.
      fetchSession();
      // S54 — accumulate friction history + fire the check. We do this
      // after the verdict lands (online path) so the friction prompt
      // reflects real correctness. The offline branch below also
      // appends a history entry but with no correctness signal.
      const elapsedMs = Date.now() - questionStartedAtRef.current;
      frictionHistoryRef.current = [
        ...frictionHistoryRef.current,
        {
          itemIdx: item.itemIdx,
          isCorrect: respBody.isCorrect,
          timeSpentMs: elapsedMs,
          skipped: false,
        },
      ];
      runFrictionCheck();
    } catch {
      // Network blip / TLS / DNS — assume offline and queue. Server
      // is idempotent on (session_id, item_idx) so replay is safe.
      offlineQueueRef.current.enqueue({
        sessionId,
        itemIdx: item.itemIdx,
        answerIdx: isLegacyMcq ? (selectedIdx ?? undefined) : undefined,
        responsePayload: isLegacyMcq ? undefined : responsePayload,
        queuedAt: Date.now(),
      });
      setOfflinePending(offlineQueueRef.current.load(sessionId).length);
      // Optimistic verdict so the player doesn't deadlock. Caller will
      // see "saved offline" copy and can advance. Server is the source
      // of truth — correctIdx = -1 signals "unknown yet".
      setVerdict({
        sessionId,
        itemIdx: item.itemIdx,
        isCorrect: false,
        correctIdx: -1,
        servedCount: (session?.servedCount ?? 0) + 1,
        correctCount: session?.correctCount ?? 0,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // S54 — fire the friction-check evaluator after each answer. Errors
  // are swallowed because the prompt is a nudge, not a critical path.
  async function runFrictionCheck() {
    if (lastFrictionAtIdx !== null) return; // at-most-one-per-session
    try {
      const trigger = await checkFriction(
        frictionHistoryRef.current,
        lastFrictionAtIdx,
      );
      if (trigger) setFrictionTrigger(trigger);
    } catch {
      /* swallow — never block the quiz on a friction call */
    }
  }

  function acceptFriction(offset: number, _action: FrictionAction) {
    // Until quiz/sessions/{id} accepts a mid-session offset write, we
    // just pin the pending offset locally + record that the prompt
    // fired. The next sprint wires this to Quiz Go.
    setPendingIntentOffset(offset);
    setLastFrictionAtIdx(item?.itemIdx ?? 0);
    setFrictionTrigger(null);
  }

  function dismissFriction() {
    setLastFrictionAtIdx(item?.itemIdx ?? 0);
    setFrictionTrigger(null);
  }

  async function finishSession() {
    if (!sessionId) return;
    try {
      await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } finally {
      navigate(`/quiz/${sessionId}/result`, { replace: true });
    }
  }

  useEffect(() => {
    if (done) finishSession();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ──
  const showFeedback = verdict !== null;
  const counts = useMemo(
    () => ({
      served: session?.servedCount ?? 0,
      correct: session?.correctCount ?? 0,
      target: session?.targetCount ?? 10,
      wrong: (session?.servedCount ?? 0) - (session?.correctCount ?? 0),
    }),
    [session],
  );
  const accuracyPct =
    counts.served > 0 ? Math.round((counts.correct / counts.served) * 100) : null;
  const masteryPct = topicMastery ? Math.round(topicMastery.ewa * 100) : null;

  // Stand-in for ability θ until adaptive-engine exposes it on the answer
  // response. Maps session accuracy to the same 0..1 band shown on the AI
  // ability gauge.
  const thetaSynth = useMemo(() => {
    if (counts.served === 0) return 0.5;
    return Math.max(0.1, Math.min(0.95, counts.correct / Math.max(1, counts.served)));
  }, [counts]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <AppShell title="Quiz" focusMode>
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

  if (done || !item) {
    return (
      <AppShell title="Quiz" focusMode>
        <SkeletonRows count={2} />
      </AppShell>
    );
  }

  const questionNumber = counts.served + (showFeedback ? 0 : 1);
  const topicTitle = topic?.title ?? "Practice";
  const topicSub =
    session?.mode === "MOCK"
      ? "Mock mode · 3PL IRT · Fisher Information item selection"
      : "Adaptive mode · 3PL IRT · Fisher Information item selection";
  const backHref = topic?.subjectId ? `/catalog/topic/${topic.id}` : "/home";

  return (
    <AppShell title={`${topicTitle} · AI Practice`} focusMode>
      <div className="practice-page">

        {/* ── 1. Session bar ──────────────────────────────────── */}
        <div className="sess-bar">
          <Link to={backHref} className="sb-back">
            ← Back
          </Link>
          <div className="sb-topic">
            <div className="sb-topic-name">{topicTitle} · AI Practice</div>
            <div className="sb-topic-sub">{topicSub}</div>
          </div>
          <div
            className="sb-timer"
            aria-label={`Elapsed ${formatTime(elapsed)}`}
          >
            {formatTime(elapsed)}
          </div>
          <button
            type="button"
            className="sb-exit"
            onClick={finishSession}
            aria-label="End quiz now"
          >
            End quiz
          </button>
          {isMobile && (
            <button
              type="button"
              className="sb-menu"
              onClick={() => setSessionMenuOpen(true)}
              aria-label="Session menu"
            >
              ⋯ Session
            </button>
          )}
        </div>

        {/* Offline-recovery status strips (S51 UX-32 v0). Render above
            the progress bar so the student spots them immediately. */}
        {offlineReplayed && (
          <div
            className="quiz-status-banner quiz-status-banner-success"
            role="status"
          >
            <span>✓ Synced offline answers — we caught up.</span>
            <button
              type="button"
              onClick={() => setOfflineReplayed(false)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
              }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {offlinePending > 0 && (
          <div
            className="quiz-status-banner quiz-status-banner-warning"
            role="status"
          >
            <span>
              {offlinePending === 1
                ? "1 answer waiting to sync — we'll send it when you're back online."
                : `${offlinePending} answers waiting to sync — we'll send them when you're back online.`}
            </span>
          </div>
        )}

        {/* ── 2. Progress strip ───────────────────────────────── */}
        <div
          className="prog-strip"
          aria-label={`Question ${questionNumber} of ${counts.target}`}
        >
          <div className="prog-pills">
            {Array.from({ length: counts.target }).map((_, i) => {
              const it = session?.items?.find((x) => x.itemIdx === i);
              let cls = "pp";
              if (it?.answered) cls += it.isCorrect ? " pp-done-c" : " pp-done-w";
              else if (i === counts.served) cls += " pp-current";
              return <div key={i} className={cls} />;
            })}
          </div>
          <div className="prog-label">
            Q {questionNumber} of {counts.target}
          </div>
        </div>

        {/* ── 3. AI context bar ───────────────────────────────── */}
        <div className="ai-ctx" aria-label="Adaptive session telemetry">
          <div className="ctx-item">
            <span className="ctx-label">◈ Difficulty</span>
            <span className="ctx-val">Adaptive</span>
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item">
            <span className="ctx-label">Item</span>
            <span className="ctx-ai">#{item.itemIdx + 1}</span>
          </div>
          <div className="ctx-sep" />
          <div className="diff-pips" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`dp ${i < 3 ? "dp-on-medium" : ""}`}
              />
            ))}
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item">
            <span className="ctx-label">Session accuracy</span>
            <span className="ctx-val">
              {accuracyPct !== null ? `${accuracyPct}%` : "—"}
            </span>
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item">
            <span className="ctx-label">Ability estimate</span>
            <span className="ctx-ai">θ ≈ {thetaSynth.toFixed(2)}</span>
          </div>
        </div>

        {/* ── 4. Body (question + right panel) ───────────────── */}
        <div className="practice-body">
          <QuizPlayer
            item={item}
            selectedIdx={selectedIdx}
            onSelectChoice={(idx) => setSelectedIdx(idx)}
            responsePayload={responsePayload}
            onChangeResponse={setResponsePayload}
            verdict={
              verdict
                ? {
                    itemIdx: verdict.itemIdx,
                    isCorrect: verdict.isCorrect,
                    correctIdx: verdict.correctIdx,
                  }
                : null
            }
            questionNumber={questionNumber}
            totalQuestions={counts.target}
            sessionId={sessionId}
            hintNote={hintNote}
            onDismissHint={() => setHintNote(null)}
            onSkip={() => {
              // Submit an empty response so the server records the
              // skip + advances; the next question is then served by
              // the post-submit fetchSession() flow.
              setResponsePayload({});
              void submitAnswer();
            }}
            feedbackPanel={
              showFeedback ? (
                <div className="ai-feedback">
                  <div className="af-title">◈ AI UPDATE · after this answer</div>
                  <div className="af-row">
                    <span className="af-lbl">Session accuracy</span>
                    <span className="af-val">
                      {accuracyPct !== null ? `${accuracyPct}%` : "—"}
                    </span>
                  </div>
                  <div className="af-row">
                    <span className="af-lbl">Topic mastery</span>
                    <span className="af-val">
                      {masteryPct !== null ? `${masteryPct}%` : "—"}
                      <span className="af-arrow"> →</span>
                      <span style={{ color: "var(--good)" }}>
                        {masteryPct !== null
                          ? `${Math.min(100, masteryPct + (verdict!.isCorrect ? 3 : 0))}%`
                          : "—"}
                      </span>
                    </span>
                  </div>
                  <div className="af-row">
                    <span className="af-lbl">Next question</span>
                    <span
                      className="af-val"
                      style={{
                        color: verdict!.isCorrect
                          ? "var(--warn)"
                          : "var(--info)",
                      }}
                    >
                      {verdict!.isCorrect ? "Harder · IRT-driven" : "Similar · IRT-driven"}
                    </span>
                  </div>
                  <div className="af-row">
                    <span className="af-lbl">Readiness pts</span>
                    <span
                      className="af-val"
                      style={{ color: "var(--good)" }}
                    >
                      {verdict!.isCorrect ? "+0.4 pts" : "+0.0 pts"}
                    </span>
                  </div>
                </div>
              ) : undefined
            }
          />

          {/* ── Right panel ──────────────────────────────────── */}
          <aside className="practice-right" aria-label="Session insights">
            <div>
              <div className="rp-label">Topic mastery</div>
              <div className="mastery-ring">
                <MasteryRing pct={masteryPct ?? 0} />
                <div className="mr-info">
                  <div className="mr-title">{topicTitle}</div>
                  <div className="mr-sub">
                    {topicMastery && topicMastery.n > 0
                      ? `${topicMastery.n} session${topicMastery.n === 1 ? "" : "s"} so far`
                      : "First session"}
                  </div>
                  {accuracyPct !== null && counts.served > 0 ? (
                    <div className="mr-delta">
                      ▲ {counts.correct}/{counts.served} this session
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <div className="rp-label">AI ability estimate</div>
              <div className="ability-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <div className="ab-theta">θ {thetaSynth.toFixed(2)}</div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--gold)",
                      fontWeight: 600,
                    }}
                  >
                    {thetaSynth >= 0.7
                      ? "Upper-Intermediate"
                      : thetaSynth >= 0.4
                        ? "Intermediate"
                        : "Beginner"}
                  </div>
                </div>
                <div className="ab-bar">
                  <div
                    className="ab-fill"
                    style={{ width: `${Math.round(thetaSynth * 100)}%` }}
                  />
                </div>
                <div className="ab-markers">
                  <span>Beginner</span>
                  <span>Mid</span>
                  <span>Advanced</span>
                </div>
              </div>
            </div>

            <div>
              <div className="rp-label">Questions</div>
              <div className="q-grid">
                {Array.from({ length: counts.target }).map((_, i) => {
                  const it = session?.items?.find((x) => x.itemIdx === i);
                  let cls = "qg-cell";
                  if (it?.answered)
                    cls += it.isCorrect ? " qg-cell-done-c" : " qg-cell-done-w";
                  else if (i === counts.served) cls += " qg-cell-current";
                  return (
                    <div key={i} className={cls}>
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="rp-label">This session</div>
              <div className="sess-stats">
                <div className="ss-card">
                  <div
                    className="ss-num"
                    style={{ color: "var(--good)" }}
                  >
                    {counts.correct}
                  </div>
                  <div className="ss-lbl">Correct</div>
                </div>
                <div className="ss-card">
                  <div className="ss-num" style={{ color: "var(--bad)" }}>
                    {counts.wrong}
                  </div>
                  <div className="ss-lbl">Wrong</div>
                </div>
                <div className="ss-card">
                  <div className="ss-num" style={{ color: "var(--gold)" }}>
                    +{(counts.correct * 0.4).toFixed(1)}
                  </div>
                  <div className="ss-lbl">Readiness pts</div>
                </div>
                <div className="ss-card">
                  <div
                    className="ss-num"
                    style={{ color: "var(--warn)" }}
                  >
                    {accuracyPct !== null ? `${accuracyPct}%` : "—"}
                  </div>
                  <div className="ss-lbl">Accuracy</div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ── 5. Footer ───────────────────────────────────────── */}
        <div className="q-footer">
          <div className="foot-left">
            <button
              type="button"
              className="btn-q-ghost"
              onClick={() =>
                setHintNote(
                  "Hints aren't authored on this question yet — try eliminating wrong options first.",
                )
              }
              title="Show a hint for this question"
            >
              💡 Hint
            </button>
            <button
              type="button"
              className={`btn-q-ghost${
                item && bookmarks.has(item.questionId) ? " is-bookmarked" : ""
              }`}
              onClick={() => {
                if (!item) return;
                setBookmarks((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.questionId)) next.delete(item.questionId);
                  else next.add(item.questionId);
                  try {
                    localStorage.setItem(
                      bookmarkStorageKey,
                      JSON.stringify([...next]),
                    );
                  } catch {
                    /* storage may be disabled — ignore */
                  }
                  return next;
                });
              }}
              title={
                item && bookmarks.has(item.questionId)
                  ? "Remove bookmark"
                  : "Bookmark this question for later review"
              }
            >
              {item && bookmarks.has(item.questionId)
                ? "🔖 Bookmarked"
                : "🔖 Bookmark"}
            </button>
            <button
              type="button"
              className="btn-q-ghost"
              onClick={() => {
                setHintNote(null);
                if (counts.served + 1 >= counts.target) setDone(true);
                else fetchNext();
              }}
              title="Skip this question and move on"
            >
              Skip
            </button>
          </div>
          {showFeedback ? (
            <button
              type="button"
              className="btn-q-primary"
              onClick={() => {
                if (counts.served >= counts.target) setDone(true);
                else fetchNext();
              }}
            >
              {counts.served >= counts.target ? "Finish quiz" : "Next question →"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-q-primary"
              disabled={
                ((!item?.questionType || item.questionType === "MCQ_SINGLE")
                  ? selectedIdx === null
                  : responsePayload === null) || submitting
              }
              onClick={submitAnswer}
            >
              {submitting ? "Submitting…" : "Submit answer"}
            </button>
          )}
        </div>
      </div>
      {/* Mobile session-menu — bottom-sheet wired to End / Bookmark /
          Adjust difficulty. Rendered unconditionally so it works for
          test viewports too; the trigger only appears on < 640 px via
          the `.sb-menu` media query in shell.css. */}
      <QuizSessionMenu
        open={sessionMenuOpen}
        onClose={() => setSessionMenuOpen(false)}
        isBookmarked={item ? bookmarks.has(item.questionId) : false}
        onToggleBookmark={() => {
          if (!item) return;
          setBookmarks((prev) => {
            const next = new Set(prev);
            if (next.has(item.questionId)) next.delete(item.questionId);
            else next.add(item.questionId);
            try {
              localStorage.setItem(
                bookmarkStorageKey,
                JSON.stringify([...next]),
              );
            } catch {
              /* storage may be disabled — ignore */
            }
            return next;
          });
        }}
        onAdjustDifficulty={() => setIntentModalOpen(true)}
        onEndQuiz={finishSession}
      />

      {/* S54 — pre/in-quiz intent picker (modal). Persists the choice
          per topic in localStorage; full server-side wiring lands when
          quiz/sessions/start accepts intent_anchor. */}
      {intentModalOpen && (
        <div
          className="qsm-scrim"
          role="dialog"
          aria-modal="true"
          aria-label="Adjust difficulty intent"
          onClick={() => setIntentModalOpen(false)}
        >
          <div
            className="qsm-sheet intent-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qsm-handle" aria-hidden />
            <div className="qsm-header">
              <div className="qsm-title">Adjust difficulty</div>
              <div className="qsm-sub">
                Where should the engine aim the next questions? Your mastery
                numbers don't change either way.
              </div>
            </div>
            <div style={{ padding: "0 12px 12px" }}>
              <IntentSelector
                value={intent}
                onChange={(next) => {
                  setIntent(next);
                  if (session?.topicId) saveIntentForTopic(session.topicId, next);
                }}
                thetaHat={thetaSynth}
              />
            </div>
            <button
              type="button"
              className="qsm-cancel"
              onClick={() => setIntentModalOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* S54 — mid-quiz friction prompt. Caller fires checkFriction
          after each verdict; at-most-one-per-session per ADR-0022. */}
      <FrictionPrompt
        trigger={frictionTrigger}
        onAccept={acceptFriction}
        onDismiss={dismissFriction}
      />

      {/* The pendingIntentOffset is set when the student accepted a
          mid-quiz nudge. Surface a tiny status note so the change
          is honest — until the backend actually shifts θ̂, the offset
          is symbolic. */}
      {pendingIntentOffset !== null && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 14px",
            borderRadius: 20,
            background: "rgba(124,58,237,0.18)",
            color: "var(--gold)",
            fontSize: 12,
            fontWeight: 600,
            zIndex: 60,
          }}
        >
          Difficulty intent updated · {pendingIntentOffset > 0 ? "harder" : "easier"}
        </div>
      )}
    </AppShell>
  );
}

function MasteryRing({ pct }: { pct: number }) {
  const r = 21;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  // SVG stroke needs concrete color values resolved at runtime — these
  // map onto the same tokens via getComputedStyle when rendered.
  const stroke =
    pct >= 70
      ? "var(--good)"
      : pct >= 40
        ? "var(--info)"
        : pct > 0
          ? "var(--bad)"
          : "var(--ink-4)";
  return (
    <div
      className="mr-ring"
      role="img"
      aria-label={`Topic mastery ${pct}%`}
    >
      <svg viewBox="0 0 52 52">
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="var(--rule)"
          strokeWidth="5"
        />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <div className="mr-inner">
        <div className="mr-num" style={{ color: stroke }}>
          {pct > 0 ? `${pct}%` : "—"}
        </div>
        <div className="mr-lbl">mastery</div>
      </div>
    </div>
  );
}