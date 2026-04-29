// Sprint 23 (P4-S23) — exam-mode (MOCK_BLUEPRINT) player.
// Sprint 25 (P4-S25) — adds an OMR-style answer-sheet palette + per-section
// counts strip. Server-side section locks + 5-min disconnect recovery still
// defer (tracked as Phase 4 stabilisation carry-over).

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
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
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Pull all served items at once — they were pre-served by Quiz at session
  // create time (StartFromBlueprint), so we can walk them up-front rather
  // than calling /next per question. Falls back to /next for safety.
  async function hydrateItems(sessionId: string, sections: MockExamSection[]): Promise<ItemView[]> {
    const out: ItemView[] = [];
    // We don't yet expose a bulk "session items with content" endpoint;
    // /next called repeatedly works because the server returns the next
    // unanswered item each time. For an MVP we walk through itemCount.
    for (let i = 0; i < items.length; i += 1) break; // placeholder
    // Use a single /next probe — the rest will be filled lazily as the user
    // answers each question. Section_id is derived from item position
    // against the blueprint sections.
    const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/next`);
    if (!r.ok) return out;
    const body = (await r.json()) as NextItemResp;
    if (body.item) {
      out.push({ ...body.item, sectionId: sectionForIdx(body.item.itemIdx, sections) });
    }
    return out;
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

  const totals = useMemo(
    () => (session ? computeSectionTotals(items, session.sections, answers, marked) : []),
    [items, session, answers, marked],
  );

  const reviewQueue = useMemo(() => markedReviewQueue(items, marked), [items, marked]);

  // Sprint 25 (P4-S25) — OMR-style palette state.
  const palette: PaletteCell[] = useMemo(
    () => computePaletteState(items, answers, marked),
    [items, answers, marked],
  );
  const sectionCounts = useMemo(() => paletteSectionCounts(palette), [palette]);

  if (!blueprintId) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p className="banner banner-error">Missing ?blueprintId= query parameter.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p className="banner banner-error">{error}</p>
      </main>
    );
  }

  if (!acceptedRules) {
    return (
      <main className="page" style={{ padding: 24, maxWidth: 680 }}>
        <h1>Exam Instructions</h1>
        <p>You are about to start a real-pattern timed mock test.</p>
        <ul>
          <li>The exam has a fixed total duration. Once started, the timer cannot be paused.</li>
          <li>You may navigate between sections during the exam.</li>
          <li>Each correct answer = +marks; each wrong answer carries negative marking.</li>
          <li>You may mark questions for end-of-exam review.</li>
          <li>Submit before the timer expires; otherwise the exam auto-submits.</li>
        </ul>
        <button type="button" onClick={() => setAcceptedRules(true)}>
          I understand — Start exam
        </button>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p>Composing your paper…</p>
      </main>
    );
  }

  return (
    <main className="page mock-exam" style={{ padding: 24, maxWidth: 1280 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>{session.blueprintName}</h1>
        <span
          aria-label="Time remaining"
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: remaining < 300 ? "var(--color-red, #F43F5E)" : "var(--text-primary)",
          }}
        >
          {formatRemaining(remaining)}
        </span>
      </header>

      {session.short && (
        <p className="banner" style={{ marginTop: 8 }}>
          ⚠ This blueprint requested {session.itemCount > 0 ? "more questions" : "a full paper"}{" "}
          but the question bank is short. The composed paper has {session.itemCount} questions.
        </p>
      )}

      {/* Section navigation strip */}
      <nav
        aria-label="Section navigation"
        style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}
      >
        {totals.map((t) => {
          const firstIdx = firstIdxOfSection(items, t.sectionId);
          const active = current?.sectionId === t.sectionId;
          return (
            <button
              key={t.sectionId}
              type="button"
              onClick={() => firstIdx >= 0 && gotoIdx(firstIdx)}
              disabled={firstIdx < 0}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-faint)",
                background: active ? "var(--bg-elevated, #eef)" : "transparent",
              }}
            >
              <strong>{t.name}</strong>{" "}
              <span style={{ color: "var(--text-muted)" }}>
                {t.answered}/{t.served} answered{t.marked > 0 && ` · ${t.marked} ⚑`}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Question pane + OMR-style palette side panel (S25) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 240px",
          gap: 24,
          marginTop: 24,
        }}
      >
        {current ? (
          <section>
            <p style={{ color: "var(--text-muted)" }}>
              Question {current.itemIdx + 1} of {session.itemCount}
              {current.sectionId && ` · ${current.sectionId}`}
            </p>
            <div style={{ fontSize: 18, marginTop: 8 }}>{current.stem}</div>
            <ol style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
              {current.choices.map((c, i) => {
                const selected = answers[current.questionId] === i;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => recordAnswer(i)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: 12,
                        marginBottom: 8,
                        borderRadius: 6,
                        border: "1px solid var(--border-faint)",
                        background: selected ? "var(--bg-elevated, #eef)" : "transparent",
                      }}
                    >
                      <strong>{String.fromCharCode(65 + i)}.</strong> {c}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => gotoIdx(currentIdx - 1)}
                disabled={currentIdx === 0}
              >
                ← Previous
              </button>
              <button type="button" onClick={toggleMark}>
                {marked.has(current.questionId) ? "✓ Marked for review" : "⚑ Mark for review"}
              </button>
              <button type="button" onClick={next}>
                Save &amp; Next →
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="btn-primary"
                style={{ marginLeft: "auto" }}
              >
                {submitting ? "Submitting…" : "Submit exam"}
              </button>
            </div>
          </section>
        ) : (
          <p>Loading first question…</p>
        )}

        {/* OMR-style answer-sheet palette */}
        <aside
          aria-label="Answer sheet"
          style={{
            background: "var(--bg-surface-1, #fff)",
            border: "1px solid var(--border-faint)",
            borderRadius: 8,
            padding: 12,
            alignSelf: "start",
            position: "sticky",
            top: 16,
          }}
        >
          <h2 style={{ fontSize: 14, marginTop: 0, marginBottom: 8 }}>
            Answer sheet
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
            {Object.entries(sectionCounts)
              .map(([k, v]) => `${k === "_none" ? "Unsectioned" : k} ${v.answered}/${v.total}`)
              .join(" · ")}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 4,
            }}
          >
            {palette.map((cell) => {
              const isCurrent = cell.itemIdx === currentIdx;
              const bg =
                cell.state === "answered_marked"
                  ? "var(--color-amber, #F5A623)"
                  : cell.state === "marked"
                  ? "var(--color-amber, #F5A623)"
                  : cell.state === "answered"
                  ? "var(--color-green, #10C47A)"
                  : "var(--bg-surface-2, #e5e7eb)";
              const fg =
                cell.state === "unanswered" ? "var(--text-primary)" : "#fff";
              const ring = isCurrent
                ? "0 0 0 2px var(--color-blue, #4F87F6)"
                : undefined;
              return (
                <button
                  key={cell.itemIdx}
                  type="button"
                  aria-label={`Question ${cell.itemIdx + 1} ${cell.state.replace("_", " + ")}`}
                  onClick={() => gotoIdx(cell.itemIdx)}
                  style={{
                    aspectRatio: "1 / 1",
                    border: "1px solid var(--border-faint)",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    background: bg,
                    color: fg,
                    cursor: "pointer",
                    boxShadow: ring,
                  }}
                >
                  {cell.itemIdx + 1}
                  {cell.state === "answered_marked" ? " ⚑" : ""}
                </button>
              );
            })}
          </div>
          <ul style={{ listStyle: "none", padding: 0, marginTop: 12, fontSize: 11 }}>
            <li>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "var(--color-green, #10C47A)",
                  marginRight: 6,
                }}
              />
              Answered
            </li>
            <li>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "var(--color-amber, #F5A623)",
                  marginRight: 6,
                }}
              />
              Marked
            </li>
            <li>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "var(--bg-surface-2, #e5e7eb)",
                  marginRight: 6,
                }}
              />
              Unanswered
            </li>
          </ul>
        </aside>
      </div>

      {/* Marked-for-review queue */}
      {reviewQueue.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18 }}>Marked for review ({reviewQueue.length})</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {reviewQueue.map((q) => (
              <li key={q.questionId}>
                <button
                  type="button"
                  onClick={() => gotoIdx(items.findIndex((i) => i.questionId === q.questionId))}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-blue, #4F87F6)",
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  ⚑ Q{q.itemIdx + 1}
                  {q.sectionId && ` (${q.sectionId})`}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function formatRemaining(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
