// Sprint 23 (P4-S23) — exam-mode (MOCK_BLUEPRINT) player.
// Sprint 25 (P4-S25) — adds an OMR-style answer-sheet palette + per-section
// counts strip. Server-side section locks + 5-min disconnect recovery still
// defer (tracked as Phase 4 stabilisation carry-over).

import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";
import { QuestionRenderer } from "../components/renderers";
import {
  canNavigate,
  computeSectionTotals,
  firstIdxOfSection,
  markedReviewQueue,
  type MockExamSection,
} from "../lib/mock_state";
import {
  computePaletteState,
  paletteSectionCounts,
  type PaletteCell,
} from "../lib/mock_palette";

interface FromBlueprintResp {
  sessionId: string;
  blueprintId: string;
  blueprintName: string;
  mode: string;
  status: string;
  expiresAt: string;
  itemCount: number;
  totalMinutes: number;
  marksCorrect: number;
  marksNegative: number;
  short: boolean;
  interSectionNavigation: boolean;
  perSectionTimeLocked: boolean;
  sections: MockExamSection[];
}

interface NextItemResp {
  sessionId: string;
  status: string;
  done: boolean;
  item?: {
    itemIdx: number;
    questionId: string;
    stem: string;
    choices: string[];
  };
}

interface ItemView {
  itemIdx: number;
  questionId: string;
  stem: string;
  choices: string[];
  // Phase 5/7 — polymorphic types. When questionType is anything other
  // than MCQ_SINGLE (or absent), payload drives the typed renderer.
  questionType?: string;
  payload?: Record<string, unknown>;
  sectionId: string | null;
}

export function MockExam() {
  const [params] = useSearchParams();
  const blueprintId = params.get("blueprintId") ?? "";
  const { user } = useAuth();
  const navigate = useNavigate();

  const [acceptedRules, setAcceptedRules] = useState(false);
  const [session, setSession] = useState<FromBlueprintResp | null>(null);
  const [items, setItems] = useState<ItemView[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  // Phase 5/7 — payload-based responses for non-MCQ types. Keyed by
  // questionId. Presence here counts as "answered" for the palette
  // alongside the legacy `answers` Record.
  const [payloadAnswers, setPayloadAnswers] = useState<Record<string, unknown>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Pull every pre-served item in one round-trip via /items. Quiz Go
  // ships all 30 (or N) items at session-create time for MOCK_BLUEPRINT
  // so we don't need to walk /next per question — the student can
  // navigate freely via the palette.
  async function hydrateItems(sessionId: string, sections: MockExamSection[]): Promise<ItemView[]> {
    const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/items`);
    if (!r.ok) {
      // Older Quiz builds didn't expose /items — fall back to /next.
      const nr = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/next`);
      if (!nr.ok) return [];
      const body = (await nr.json()) as NextItemResp;
      return body.item
        ? [{ ...body.item, sectionId: sectionForIdx(body.item.itemIdx, sections) }]
        : [];
    }
    const body = (await r.json()) as {
      sessionId: string;
      items: Array<{
        itemIdx: number;
        questionId: string;
        stem: string;
        choices: string[];
        questionType?: string;
        payload?: Record<string, unknown>;
      }>;
    };
    return body.items.map((it) => ({
      ...it,
      sectionId: sectionForIdx(it.itemIdx, sections),
    }));
  }

  function sectionForIdx(itemIdx: number, sections: MockExamSection[]): string | null {
    let cum = 0;
    for (const s of sections) {
      if (itemIdx < cum + s.nComposed) return s.sectionId;
      cum += s.nComposed;
    }
    return null;
  }

  // Build session on mount.
  useEffect(() => {
    if (!user || !blueprintId || !acceptedRules) return;
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/quiz/sessions/from-blueprint", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blueprintId, userId: user.id }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.detail?.message || body?.message || "Could not start mock.");
          return;
        }
        const body = (await res.json()) as FromBlueprintResp;
        setSession(body);
        setRemaining(body.totalMinutes * 60);
        const initial = await hydrateItems(body.sessionId, body.sections);
        setItems(initial);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [user, blueprintId, acceptedRules]);

  // Tick the global timer.
  useEffect(() => {
    if (!session || submittedRef.current) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          void submit();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [session]);

  const current = items[currentIdx];

  async function loadNext() {
    if (!session) return;
    const r = await auth.fetch(`/api/v1/quiz/sessions/${session.sessionId}/next`);
    if (!r.ok) return;
    const body = (await r.json()) as NextItemResp;
    if (body.item) {
      const view: ItemView = {
        ...body.item,
        sectionId: sectionForIdx(body.item.itemIdx, session.sections),
      };
      setItems((prev) => {
        if (prev.find((p) => p.itemIdx === view.itemIdx)) return prev;
        return [...prev, view].sort((a, b) => a.itemIdx - b.itemIdx);
      });
      setCurrentIdx((prev) => Math.max(prev, view.itemIdx));
    }
  }

  async function recordAnswer(choice: number) {
    if (!session || !current) return;
    setAnswers((a) => ({ ...a, [current.questionId]: choice }));
    try {
      await auth.fetch(`/api/v1/quiz/sessions/${session.sessionId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemIdx: current.itemIdx,
          questionId: current.questionId,
          answerIdx: choice,
        }),
      });
    } catch (e) {
      // soft-fail: the answer is in the local state and will retry next nav
    }
  }

  // Phase 5/7 — payload-based answer recording for non-MCQ types
  // (DIAGRAM_LABEL, ESSAY, MATCH_THE_FOLLOWING, …). The renderer owns
  // the input UX; this just persists whatever it emits via onChange.
  async function recordPayloadAnswer(payload: unknown) {
    if (!session || !current) return;
    setPayloadAnswers((m) => ({ ...m, [current.questionId]: payload }));
    try {
      await auth.fetch(`/api/v1/quiz/sessions/${session.sessionId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemIdx: current.itemIdx,
          responsePayload: payload,
        }),
      });
    } catch (e) {
      // soft-fail: payload is in local state; submit fans out everything
    }
  }

  function toggleMark() {
    if (!current) return;
    setMarked((s) => {
      const next = new Set(s);
      if (next.has(current.questionId)) next.delete(current.questionId);
      else next.add(current.questionId);
      return next;
    });
  }

  function gotoIdx(targetIdx: number) {
    if (!session) return;
    if (!canNavigate(items, currentIdx, targetIdx, session.interSectionNavigation)) return;
    setCurrentIdx(targetIdx);
  }

  async function next() {
    if (!session) return;
    if (currentIdx + 1 < items.length) {
      gotoIdx(currentIdx + 1);
      return;
    }
    await loadNext();
  }

  async function submit() {
    if (!session || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await auth.fetch(`/api/v1/quiz/sessions/${session.sessionId}/submit`, {
        method: "POST",
      });
      navigate(`/quiz/${session.sessionId}/result`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
      submittedRef.current = false;
    }
  }

  // Unified "is this question answered?" map — MCQ choice indices +
  // non-MCQ payload responses. Used by both the section totals and the
  // palette so a DIAGRAM_LABEL with a saved payload shows green like an
  // answered MCQ does.
  const unifiedAnswers: Record<string, number> = useMemo(() => {
    const merged: Record<string, number> = { ...answers };
    for (const qid of Object.keys(payloadAnswers)) {
      if (merged[qid] === undefined) merged[qid] = 0; // sentinel; palette only checks defined-ness
    }
    return merged;
  }, [answers, payloadAnswers]);

  const totals = useMemo(
    () => (session ? computeSectionTotals(items, session.sections, unifiedAnswers, marked) : []),
    [items, session, unifiedAnswers, marked],
  );

  const reviewQueue = useMemo(() => markedReviewQueue(items, marked), [items, marked]);

  // Sprint 25 (P4-S25) — OMR-style palette state.
  const palette: PaletteCell[] = useMemo(
    () => computePaletteState(items, unifiedAnswers, marked),
    [items, unifiedAnswers, marked],
  );
  // sectionCounts: still computed inline by `totals` for the tab row.
  void paletteSectionCounts; // kept import for future per-section badge work

  if (!blueprintId) {
    return (
      <AppShell title="Mock exam">
        <div className="pg-shell" style={{ maxWidth: 720 }}>
          <Banner tone="danger">Missing ?blueprintId= query parameter.</Banner>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Mock exam">
        <div className="pg-shell" style={{ maxWidth: 720 }}>
          <Banner tone="danger">{error}</Banner>
        </div>
      </AppShell>
    );
  }

  if (!acceptedRules) {
    const instructions = [
      {
        icon: "⏱",
        title: "Fixed total duration",
        body: "The timer starts when you begin and cannot be paused. The exam auto-submits when it runs out.",
      },
      {
        icon: "🧭",
        title: "Navigate freely",
        body: "Move between sections and questions at any time during the exam. Use the palette on the right to jump to any item.",
      },
      {
        icon: "🎯",
        title: "Negative marking",
        body: "Each correct answer = +marks; each wrong answer carries a penalty. Skipping is safer than guessing on hard items.",
      },
      {
        icon: "🚩",
        title: "Mark for review",
        body: "Flag questions you want to revisit before submitting. They show up in a dedicated review pane.",
      },
      {
        icon: "✅",
        title: "Submit before time",
        body: "You can submit at any time. If you don't, the system submits whatever's there when the clock hits zero.",
      },
    ];
    return (
      <AppShell title="Mock exam">
        <div className="pg-shell" style={{ maxWidth: 820 }}>
          <header className="pg-header">
            <div className="pg-header-main">
              <h1 className="pg-header-title">You're about to start a timed mock</h1>
              <p className="pg-header-sub">
                Read the rules below, then tap Start when you're ready. The
                clock starts the moment you accept.
              </p>
            </div>
          </header>

          <section className="pg-section">
            <h2 className="pg-section-title">Before you begin</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {instructions.map((it) => (
                <div
                  key={it.title}
                  style={{
                    padding: 16,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    display: "flex",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 24, lineHeight: 1 }}>{it.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                      {it.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      {it.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              padding: "0 4px 8px",
            }}
          >
            <button
              type="button"
              className="pg-btn pg-btn-ghost"
              onClick={() => window.history.back()}
            >
              ← Back
            </button>
            <button
              type="button"
              className="pg-btn pg-btn-primary"
              onClick={() => setAcceptedRules(true)}
              style={{ minWidth: 220 }}
            >
              I understand — Start exam
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell title="Mock exam">
        <div className="pg-shell" style={{ maxWidth: 720 }}>
          <div
            className="pg-section"
            style={{ minHeight: 200, opacity: 0.7, textAlign: "center" }}
          >
            Composing your paper…
          </div>
        </div>
      </AppShell>
    );
  }

  const timerDanger = remaining < 300; // last 5 minutes
  const answeredCount =
    Object.keys(answers).length + Object.keys(payloadAnswers).length;
  const totalCount = items.length || session.itemCount;
  const currentIsMCQ =
    !current?.questionType || current.questionType === "MCQ_SINGLE";

  return (
    <AppShell title={session.blueprintName}>
      <div className="pg-shell" style={{ maxWidth: 1280 }}>
        {/* Sticky timer + progress bar */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "var(--bg-base)",
            padding: "8px 4px 12px",
            marginBottom: 12,
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>
              Progress
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {answeredCount} of {totalCount} answered
              {marked.size > 0 && (
                <span style={{ color: "var(--color-amber, #F5A623)", marginLeft: 10 }}>
                  · {marked.size} flagged
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>
              Time remaining
            </div>
            <div
              aria-label="Time remaining"
              style={{
                fontSize: 28,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                color: timerDanger ? "var(--color-danger, #F43F5E)" : "var(--text-primary)",
                transition: "color 250ms",
              }}
            >
              {formatRemaining(remaining)}
            </div>
          </div>
        </div>

        {session.short && (
          <Banner tone="warning">
            ⚠ The question bank is short for this blueprint. Your paper has{" "}
            {session.itemCount} questions instead of the requested length.
          </Banner>
        )}

        {/* Section tabs */}
        <div className="pg-tabs" role="tablist" style={{ marginBottom: 16, overflowX: "auto" }}>
          {totals.map((t) => {
            const firstIdx = firstIdxOfSection(items, t.sectionId);
            const active = current?.sectionId === t.sectionId;
            return (
              <button
                key={t.sectionId}
                type="button"
                className={"pg-tab" + (active ? " pg-tab-active" : "")}
                onClick={() => firstIdx >= 0 && gotoIdx(firstIdx)}
                disabled={firstIdx < 0}
                style={{ whiteSpace: "nowrap" }}
              >
                {t.name}
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontWeight: 500,
                  }}
                >
                  {t.answered}/{t.served}
                  {t.marked > 0 ? ` · ${t.marked} ⚑` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* Two-column: question on left, palette on right */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 260px",
            gap: 20,
            alignItems: "start",
          }}
        >
          {current ? (
            <section className="pg-section">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>
                    Question {current.itemIdx + 1} of {totalCount}
                    {current.sectionId && ` · ${current.sectionId}`}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    +{session.marksCorrect} for correct, −{session.marksNegative} for wrong
                  </div>
                </div>
                <button
                  type="button"
                  className="pg-btn pg-btn-ghost"
                  onClick={toggleMark}
                  style={{
                    color: marked.has(current.questionId)
                      ? "var(--color-amber, #F5A623)"
                      : undefined,
                  }}
                >
                  {marked.has(current.questionId) ? "🚩 Flagged" : "🚩 Flag for review"}
                </button>
              </div>

              <div
                style={{
                  fontSize: 17,
                  lineHeight: 1.6,
                  marginBottom: 24,
                  whiteSpace: "pre-wrap",
                }}
              >
                {current.stem}
              </div>

              {currentIsMCQ ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {current.choices.map((c, i) => {
                    const selected = answers[current.questionId] === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => recordAnswer(i)}
                        style={{
                          textAlign: "left",
                          padding: "14px 18px",
                          borderRadius: 10,
                          border: selected
                            ? "2px solid var(--color-blue, #2F5DCB)"
                            : "1px solid var(--border-subtle)",
                          background: selected
                            ? "rgba(47,93,203,0.08)"
                            : "var(--bg-elevated)",
                          cursor: "pointer",
                          fontSize: 15,
                          lineHeight: 1.5,
                          color: "inherit",
                          transition: "border-color 150ms, background 150ms",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 28,
                            height: 28,
                            marginRight: 12,
                            borderRadius: "50%",
                            background: selected
                              ? "var(--color-blue, #2F5DCB)"
                              : "var(--bg-base)",
                            color: selected ? "#fff" : "var(--text-primary)",
                            fontWeight: 700,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        {c}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: 14,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                  }}
                >
                  <RendererErrorBoundary questionId={current.questionId}>
                    <QuestionRenderer
                      typeId={current.questionType ?? "MCQ_SINGLE"}
                      payload={current.payload ?? {}}
                      value={payloadAnswers[current.questionId] ?? null}
                      onChange={(v) => recordPayloadAnswer(v)}
                      language="en"
                      sessionId={session.sessionId}
                      questionId={current.questionId}
                    />
                  </RendererErrorBoundary>
                </div>
              )}

              {/* Bottom action bar */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border-subtle)",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="pg-btn pg-btn-ghost"
                  onClick={() => gotoIdx(currentIdx - 1)}
                  disabled={currentIdx === 0}
                >
                  ← Previous
                </button>
                <button type="button" className="pg-btn pg-btn-primary" onClick={next}>
                  Save & Next →
                </button>
                <button
                  type="button"
                  className="pg-btn pg-btn-primary"
                  onClick={submit}
                  disabled={submitting}
                  style={{ marginLeft: "auto", background: "var(--color-success, #10C47A)" }}
                >
                  {submitting ? "Submitting…" : "Submit exam"}
                </button>
              </div>
            </section>
          ) : (
            <section
              className="pg-section"
              style={{ minHeight: 300, opacity: 0.6, textAlign: "center", paddingTop: 80 }}
            >
              Loading first question…
            </section>
          )}

          {/* Palette */}
          <aside
            aria-label="Answer sheet"
            style={{
              padding: 14,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 10,
              position: "sticky",
              top: 100,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              Answer sheet
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 6,
              }}
            >
              {palette.map((cell) => {
                const isCurrent = cell.itemIdx === currentIdx;
                const isAnsweredMarked = cell.state === "answered_marked";
                const isMarked = cell.state === "marked";
                const isAnswered = cell.state === "answered";
                const bg = isAnsweredMarked
                  ? "var(--color-amber, #F5A623)"
                  : isMarked
                    ? "var(--color-amber, #F5A623)"
                    : isAnswered
                      ? "var(--color-success, #10C47A)"
                      : "var(--bg-base)";
                const fg = !isAnswered && !isMarked && !isAnsweredMarked
                  ? "var(--text-primary)"
                  : "#fff";
                return (
                  <button
                    key={cell.itemIdx}
                    type="button"
                    aria-label={`Question ${cell.itemIdx + 1}`}
                    onClick={() => gotoIdx(cell.itemIdx)}
                    style={{
                      aspectRatio: "1 / 1",
                      border: isCurrent
                        ? "2px solid var(--color-blue, #2F5DCB)"
                        : "1px solid var(--border-subtle)",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      background: bg,
                      color: fg,
                      cursor: "pointer",
                      padding: 0,
                      position: "relative",
                    }}
                  >
                    {cell.itemIdx + 1}
                    {isAnsweredMarked && (
                      <span
                        style={{
                          position: "absolute",
                          top: 1,
                          right: 2,
                          fontSize: 9,
                        }}
                      >
                        🚩
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gap: 6,
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              <LegendDot color="var(--color-success, #10C47A)" label="Answered" />
              <LegendDot color="var(--color-amber, #F5A623)" label="Flagged" />
              <LegendDot color="var(--bg-base)" label="Not answered" />
            </div>
          </aside>
        </div>

        {/* Flagged queue (only when something's flagged) */}
        {reviewQueue.length > 0 && (
          <section className="pg-section">
            <h2 className="pg-section-title">
              Flagged for review
              <span className="pg-section-title-sub">{reviewQueue.length}</span>
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {reviewQueue.map((q) => (
                <button
                  key={q.questionId}
                  type="button"
                  className="pg-chip"
                  onClick={() => gotoIdx(items.findIndex((i) => i.questionId === q.questionId))}
                >
                  🚩 Q{q.itemIdx + 1}
                  {q.sectionId && ` · ${q.sectionId}`}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

// Per-question error boundary — isolates a malformed payload so the
// rest of the exam keeps working. Re-keyed by questionId so a fresh
// instance mounts for every navigation; otherwise React would
// remember the error state for the next question too.
class RendererErrorBoundary extends Component<
  { children: ReactNode; questionId: string },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidUpdate(prev: { questionId: string }) {
    if (prev.questionId !== this.props.questionId && this.state.err) {
      this.setState({ err: null });
    }
  }
  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            padding: 16,
            background: "var(--bg-danger-soft, #fff5f5)",
            border: "1px solid var(--color-danger, #f43f5e)",
            borderRadius: 8,
            color: "var(--color-danger, #f43f5e)",
            fontSize: 13,
          }}
        >
          <strong>This question couldn't render.</strong>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            {this.state.err.message}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            Use Save & Next to skip to the next question — it'll be marked unanswered.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          background: color,
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
        }}
      />
      {label}
    </div>
  );
}

function formatRemaining(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
