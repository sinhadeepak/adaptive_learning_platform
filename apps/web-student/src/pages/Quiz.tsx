// Quiz — Vidya v1 AI Practice (mockup 4/8).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 mockup 4/8 (AI practice — live quiz).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   ┌─ quiz topbar: crumb + progress + timer + pause/flag ─────┐
//   │ ┌─ question card ─────────────────┐ ┌─ session rail ──┐ │
//   │ │ Q07 tags · stem · choices       │ │ live signal     │ │
//   │ │ ← prev → · skip · submit        │ │ session stats   │ │
//   │ └─────────────────────────────────┘ │ question map    │ │
//   │                                     │ hint card       │ │
//   └─────────────────────────────────────┴─────────────────┘
//
// Scope note: this rebuild focuses on the MCQ_SINGLE path the
// mockup shows. The previous file's advanced features (offline
// answer queue, intent-anchor modal, polymorphic question type
// renderers for fill-in / matching / numeric, friction prompts,
// bookmarks) are not yet in the Vidya mockup set — they get
// reintroduced as their dedicated mockups land. The git history
// has the prior implementation if you need to compare.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { QuestionMap, type QMapState } from "../components/vidya/dashboardParts";
import { Sparkline } from "@alp/ui";
import { QuestionRenderer } from "../components/renderers";
import { RendererErrorBoundary } from "../components/RendererErrorBoundary";

interface QuizItem {
  itemIdx: number;
  questionId: string;
  stem: string;
  choices: string[];
  // P5 — present for non-MCQ types. When absent / "MCQ_SINGLE" the
  // legacy lettered-choices path renders; otherwise the polymorphic
  // QuestionRenderer drives the answer surface off `payload`.
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
}

export function Quiz() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [item, setItem] = useState<QuizItem | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<AnswerResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Typed-answer value for non-MCQ renderers (numeric, matching, …).
  const [responsePayload, setResponsePayload] = useState<unknown>(null);
  // Explicit load/submit states so a failed fetch shows an error +
  // retry instead of a permanent "Loading next question…" spinner.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [ability, setAbility] = useState<{ ewa: number; n: number } | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  // Timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    setElapsed(0);
    if (paused) return;
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [item?.itemIdx, paused]);

  // Fetch next item
  async function fetchNext() {
    if (!sessionId) return;
    setVerdict(null);
    setSelectedIdx(null);
    setResponsePayload(null);
    setHintShown(false);
    setSubmitError(null);
    setLoadError(null);
    setLoading(true);
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/next`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as NextResponse;
      if (data.done) {
        setDone(true);
        // Submit the session so it transitions to SUBMITTED and Quiz publishes
        // quiz.session.completed — the event that drives mastery, the revision
        // queue, and Mistake-Notebook capture. Best-effort: the results page
        // renders from the item data regardless, but without this the whole
        // analytics pipeline never fires (session stays IN_PROGRESS).
        try {
          await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/submit`, { method: "POST" });
        } catch {
          /* results still render; analytics reconciles via backfill */
        }
        navigate(`/quiz/${sessionId}/result`);
      } else if (data.item) {
        setItem(data.item);
      } else {
        // IN_PROGRESS but no item and not done — surface, don't hang.
        setLoadError("No question was returned for this session.");
      }
    } catch (e) {
      setLoadError(
        e instanceof Error
          ? `Couldn't load the next question (${e.message}).`
          : "Couldn't load the next question.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchSession() {
    if (!sessionId) return;
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}`);
      if (r.ok) setSession((await r.json()) as SessionDetail);
    } catch { /* offline */ }
  }

  useEffect(() => {
    void fetchNext();
    void fetchSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Topic + ability
  useEffect(() => {
    if (!session?.topicId) return;
    let alive = true;
    (async () => {
      try {
        const t = await auth.fetch(`/api/v1/catalog/topics/${session.topicId}`);
        if (t.ok && alive) setTopic((await t.json()) as Topic);
      } catch { /* offline */ }
      if (!user?.id) return;
      try {
        const m = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (m.ok && alive) {
          const data = (await m.json()) as { topics?: Array<{ topicId: string; ewa: number; n: number }> | null };
          const ts = Array.isArray(data.topics) ? data.topics : [];
          const found = ts.find((t) => t.topicId === session.topicId);
          if (found) setAbility({ ewa: found.ewa, n: found.n });
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [session?.topicId, user?.id]);

  async function submit() {
    if (!sessionId || !item || submitting) return;
    const isMcqItem = !item.questionType || item.questionType === "MCQ_SINGLE";
    // MCQ needs a selected choice; typed questions need a response payload.
    if (isMcqItem) {
      if (selectedIdx === null) return;
    } else if (responsePayload === null || responsePayload === undefined) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // MCQ grades server-side off the choice index; typed questions
      // ship the renderer's response payload to the typed grader.
      const body = isMcqItem
        ? { itemIdx: item.itemIdx, answerIdx: selectedIdx }
        : { itemIdx: item.itemIdx, responsePayload };
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as AnswerResponse;
      setVerdict(data);
      void fetchSession();
    } catch (e) {
      setSubmitError(
        e instanceof Error
          ? `Couldn't submit your answer (${e.message}). Please try again.`
          : "Couldn't submit your answer. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function skip() {
    if (!sessionId || !item) return;
    try {
      await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIdx: item.itemIdx, skip: true }),
      });
    } catch { /* offline */ }
    void fetchNext();
  }

  /* ── Derived ──────────────────────────────────────────────── */

  const targetCount = session?.targetCount ?? 12;
  const currentIdx = item?.itemIdx ?? session?.servedCount ?? 0;
  const progressPct = ((currentIdx + 1) / targetCount) * 100;
  const correctCount = session?.correctCount ?? 0;
  const incorrectCount =
    (session?.items?.filter((it) => it.answered && it.isCorrect === false).length) ?? 0;
  const skippedCount =
    (session?.items?.filter((it) => it.answered && it.answerIdx === undefined).length) ?? 0;
  const avgTime = Math.max(elapsed, 30); // crude — real metric comes from session events
  const difficulty = ability ? Math.min(1, 0.5 + (1 - ability.ewa) * 0.4) : 0.71;
  const theta = ability ? +(ability.ewa * 2 - 1).toFixed(2) : 0.79;

  // MCQ_SINGLE (and untyped legacy items) use the lettered-choices UI +
  // answerIdx submit; every other type renders via QuestionRenderer and
  // submits a response payload.
  const isMcq = !item?.questionType || item.questionType === "MCQ_SINGLE";
  const canSubmit = isMcq
    ? selectedIdx !== null
    : responsePayload !== null && responsePayload !== undefined;

  const qmapItems: Array<{ index: number; state: QMapState }> = useMemo(() => {
    const out: Array<{ index: number; state: QMapState }> = [];
    for (let i = 0; i < targetCount; i++) {
      const summary = session?.items.find((it) => it.itemIdx === i);
      let state: QMapState = "pending";
      if (i === currentIdx) state = "active";
      else if (summary?.answered) {
        if (summary.isCorrect === true) state = "correct";
        else if (summary.isCorrect === false) state = "wrong";
        else state = "skipped";
      }
      out.push({ index: i, state });
    }
    return out;
  }, [targetCount, session, currentIdx]);

  // Synthetic theta trend for live-signal sparkline
  const thetaTrend = useMemo(() => {
    const base = theta;
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
      const noise = ((i * 7) % 5) / 25;
      out.push(base - 0.3 + i * 0.05 + noise);
    }
    return out;
  }, [theta]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (done) {
    return (
      <VidyaShell crumbs="AI practice" title="Session complete">
        <p>Redirecting to your results…</p>
      </VidyaShell>
    );
  }

  return (
    <VidyaShell hideTopbar title="">
      {/* Custom quiz topbar (replaces the dashboard one) */}
      <div className="vidya-quiz-topbar">
        <div className="vidya-quiz-topbar__crumb">
          <span className="vidya-quiz-topbar__crumb-icon" aria-hidden>⚡</span>
          AI practice · {topic?.title ?? "Loading…"}
        </div>
        <div className="vidya-quiz-topbar__progress">
          <span
            className="vidya-quiz-topbar__progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="vidya-quiz-topbar__progress-count">
          {currentIdx + 1} / {targetCount}
        </div>
        <div className="vidya-quiz-topbar__timer">
          <span aria-hidden>⏱</span> {mm}:{ss}
        </div>
        <button
          className="vidya-quiz-topbar__btn"
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button
          className={`vidya-quiz-topbar__btn${flagged ? " vidya-quiz-topbar__btn--on" : ""}`}
          onClick={() => setFlagged((f) => !f)}
        >
          ⚐ Flag
        </button>
      </div>

      <div className="vidya-grid-2">
        {/* Question column */}
        <section className="vidya-question">
          <div className="vidya-question__tags">
            <span className="vidya-question__tag vidya-question__tag--dark">
              Question {String(currentIdx + 1).padStart(2, "0")}
            </span>
            <span className="vidya-question__tag vidya-question__tag--gold-soft">
              Single correct · 4 marks
            </span>
            <span className="vidya-question__tag vidya-question__tag--accent-soft">
              ◆ b = {difficulty.toFixed(2)} · θ-matched
            </span>
            <span className="vidya-question__meta">
              NEET-style · Ch.{(topic?.subjectId ?? "??").slice(0, 2).toUpperCase()} · Q-{item?.questionId.slice(-4) ?? "----"}
            </span>
          </div>

          {loadError ? (
            <div
              role="alert"
              style={{
                padding: 16,
                background: "var(--paper-2, #fff8f8)",
                border: "1px solid var(--bad, #f43f5e)",
                borderRadius: 8,
                color: "var(--ink, #1f2937)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                ⚠ {loadError}
              </div>
              <button
                type="button"
                className="vidya-shell__primary"
                onClick={() => void fetchNext()}
              >
                Retry
              </button>
            </div>
          ) : !item ? (
            <p className="vidya-question__stem" style={{ color: "var(--ink-3)" }}>
              {loading ? "Loading next question…" : "No question available."}
            </p>
          ) : (
            <>
              <div className="vidya-question__stem">
                <MathText text={item.stem} />
              </div>

              {isMcq ? (
                <ol className="vidya-question__choices">
                  {(item.choices ?? []).map((choice, i) => {
                    const letter = String.fromCharCode(65 + i);
                    const sel = selectedIdx === i;
                    const isCorrect =
                      verdict !== null && verdict.correctIdx === i;
                    const isWrong =
                      verdict !== null && sel && !verdict.isCorrect;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          className={`vidya-question__choice${
                            sel ? " vidya-question__choice--sel" : ""
                          }${isCorrect ? " vidya-question__choice--correct" : ""}${
                            isWrong ? " vidya-question__choice--wrong" : ""
                          }`}
                          disabled={verdict !== null || paused}
                          onClick={() => setSelectedIdx(i)}
                        >
                          <span className="vidya-question__choice-letter">{letter}</span>
                          <span className="vidya-question__choice-text">
                            <MathText text={choice} inline />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="vidya-question__typed" style={{ marginTop: 16 }}>
                  <RendererErrorBoundary
                    resetKey={`${item.questionId}:${item.itemIdx}`}
                    onSkip={() => void skip()}
                  >
                    <QuestionRenderer
                      typeId={item.questionType!}
                      payload={item.payload ?? {}}
                      value={responsePayload}
                      onChange={setResponsePayload}
                      language="en"
                      disabled={verdict !== null || paused}
                      sessionId={sessionId}
                      questionId={item.questionId}
                    />
                  </RendererErrorBoundary>
                </div>
              )}

              {verdict && !isMcq && (
                <div
                  role="status"
                  style={{
                    marginTop: 16,
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    background: verdict.isCorrect
                      ? "var(--good-soft, #ecfdf5)"
                      : "var(--bad-soft, #fef2f2)",
                    color: verdict.isCorrect
                      ? "var(--good, #059669)"
                      : "var(--bad, #dc2626)",
                  }}
                >
                  {verdict.isCorrect ? "✓ Correct" : "✗ Not quite"}
                </div>
              )}
            </>
          )}

          {submitError && (
            <p
              role="alert"
              style={{ color: "var(--bad, #dc2626)", fontSize: 13, marginTop: 12 }}
            >
              {submitError}
            </p>
          )}

          <div className="vidya-question__actions">
            <button
              className="vidya-question__nav"
              onClick={() => navigate(-1)}
              disabled={currentIdx === 0}
            >
              ← Previous
            </button>
            <div style={{ flex: 1 }} />
            {verdict ? (
              <button
                className="vidya-shell__primary"
                onClick={() => void fetchNext()}
              >
                Next question →
              </button>
            ) : (
              <>
                <button
                  className="vidya-question__skip"
                  onClick={() => void skip()}
                  disabled={submitting || paused}
                >
                  Skip
                </button>
                <button
                  className="vidya-shell__primary"
                  onClick={() => void submit()}
                  disabled={!canSubmit || submitting || paused}
                >
                  → Submit answer
                </button>
              </>
            )}
          </div>
        </section>

        {/* Right rail */}
        <aside className="vidya-quiz-rail">
          <section className="vidya-signal">
            <div className="vidya-signal__eyebrow">Live signal</div>
            <div className="vidya-signal__value">
              {theta >= 0 ? "+" : ""}
              {theta.toFixed(2)}
              <span className="vidya-signal__unit">θ · ability</span>
            </div>
            <div className="vidya-signal__chart">
              <Sparkline data={thetaTrend} stroke="var(--gold)" height={36} width={220} />
            </div>
            <p className="vidya-signal__body">
              You're answering above your weak-zone average. Next question
              difficulty ↑ to <strong>{(difficulty + 0.13).toFixed(2)}</strong>.
            </p>
          </section>

          <section className="vidya-session">
            <div className="vidya-session__title">Session</div>
            <div className="vidya-session__grid">
              <div>
                <div className="vidya-session__label">Correct</div>
                <div className="vidya-session__value">{correctCount}</div>
              </div>
              <div>
                <div className="vidya-session__label">Incorrect</div>
                <div className="vidya-session__value">{incorrectCount}</div>
              </div>
              <div>
                <div className="vidya-session__label">Skipped</div>
                <div className="vidya-session__value">{skippedCount}</div>
              </div>
              <div>
                <div className="vidya-session__label">Avg time</div>
                <div className="vidya-session__value">
                  {avgTime}
                  <span className="vidya-session__unit">s</span>
                </div>
              </div>
            </div>
          </section>

          <QuestionMap
            items={qmapItems}
            onJump={() => {
              /* Server doesn't support jumping mid-session; ignore until
                 the navigation endpoint lands. */
            }}
          />

          <section className="vidya-hint">
            <div className="vidya-hint__eyebrow">Hint available</div>
            {hintShown ? (
              <p className="vidya-hint__body">
                Carnot efficiency = 1 − T₂/T₁. Then apply the 80% factor.
              </p>
            ) : (
              <button
                className="vidya-hint__btn"
                onClick={() => setHintShown(true)}
              >
                Show step-by-step (−2 marks)
              </button>
            )}
          </section>
        </aside>
      </div>
    </VidyaShell>
  );
}

/* ── Math-aware text renderer ─────────────────────────────────
   The question bank ships LaTeX-formatted stems and choices like
   "T_1 = 600 K" or "$\\eta = 1 - T_2/T_1$". We feed them through
   react-markdown + remark-math + rehype-katex so subscripts /
   superscripts / fractions render as the mockup intends. Plain
   text passes through unchanged. */

function MathText({ text, inline = false }: { text: string; inline?: boolean }) {
  // Auto-detect LaTeX-style markers the question bank uses without
  // dollar-signs (e.g. "T_1 = 600 K"). If the stem contains an
  // underscore or caret outside of $...$, wrap the whole thing in
  // inline-math so KaTeX picks up the formatting.
  const looksLikeMath = /\$[^$]+\$|\\[a-zA-Z]+|_\{?[a-zA-Z0-9]|\^\{?[a-zA-Z0-9]/.test(text);
  const source = looksLikeMath && !text.includes("$") ? `$${text}$` : text;
  if (inline) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <span>{children}</span>,
        }}
      >
        {source}
      </ReactMarkdown>
    );
  }
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {source}
    </ReactMarkdown>
  );
}
