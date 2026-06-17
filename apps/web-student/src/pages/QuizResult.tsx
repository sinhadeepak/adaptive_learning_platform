// QuizResult — Vidya v1 Practice Results (mockup 5/8).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 mockup 5/8 (Practice results).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   ┌─ topbar: AI PRACTICE · SESSION COMPLETE  · Export · Next ─┐
//   │  ┌── 4 KPI tiles: Score · Readiness lift · Avg time · θ Δ
//   │  ┌─ Question breakdown table ──────┐ ┌─ what changed ──┐
//   │  │  9 ✓ · 2 ✗ · 1 skipped          │ │  AI 3-bullet    │
//   │  │  per-row: # · ✓/✗ · stem · time │ ├─────────────────┤
//   │  │  · b=N · answer/correct letters │ │  Time per Q     │
//   │  │                                 │ ├─────────────────┤
//   │  └─────────────────────────────────┘ │  Next session   │
//
// Scope note: the previous file shipped extra surfaces
// (bookmarks, report-question modal, AI insight feedback,
// calibration drawer, reflection drawer, doubt-ask). Those map
// to mockups not yet in the Vidya v1 set; they get reintroduced
// when their dedicated screens land. Git history preserves the
// prior implementation.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { TimeDistributionBars } from "../components/vidya/dashboardParts";

interface ItemSummary {
  itemIdx: number;
  questionId: string;
  answerIdx?: number;
  isCorrect?: boolean;
  answered: boolean;
  stem?: string;
  choices?: string[];
  correctIdx?: number;
  explanation?: string;
  questionType?: string;
  bValue?: number;
  timeSpentSec?: number;
}

// answerIdx / correctIdx letters are only meaningful for single-choice MCQ
// (and untyped legacy items). Every other type is answered with a typed
// response payload, so the stored answerIdx is a meaningless zero default —
// showing "You picked A / Correct A" there is misleading.
function isChoiceAnswer(questionType?: string): boolean {
  return !questionType || questionType === "MCQ_SINGLE";
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
  startedAt?: string;
  items: ItemSummary[];
}

interface Topic {
  id: string;
  title: string;
  subjectId: string;
}

interface MasteryListResponse {
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface PerQTimeItem {
  itemIdx: number;
  questionId: string;
  timeSeconds: number | null;
  isCorrect: boolean | null;
  answerIdx: number | null;
  correctIdx: number | null;
  difficultyB: number | null;
  topicId: string | null;
}

interface PerQTimeResponse {
  sessionId: string;
  items?: PerQTimeItem[] | null;
}

interface TopicSummary {
  id: string;
  title: string;
  subjectId?: string;
}

export function QuizResult() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [mastery, setMastery] = useState<{ ewa: number; n: number } | null>(null);
  // Per-question data from /quiz/sessions/{id}/per-question-time —
  // gives us correctIdx + answerIdx + difficultyB + topicId per item
  // (the session/{id} payload only carries the verdict). Used to build
  // the per-question drill-down drawer.
  const [perQ, setPerQ] = useState<PerQTimeItem[]>([]);
  // Topic-id → title cache so the drawer can show real topic names.
  const [topicTitles, setTopicTitles] = useState<Record<string, TopicSummary>>({});
  // Index of the question currently open in the side drawer (null = closed).
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}`);
        if (r.ok && alive) {
          const body = (await r.json()) as SessionDetail;
          setSession(body);
          try {
            const t = await auth.fetch(`/api/v1/catalog/topics/${body.topicId}`);
            if (t.ok && alive) setTopic((await t.json()) as Topic);
          } catch { /* offline */ }
        }
      } catch { /* offline */ }

      try {
        const pq = await auth.fetch(
          `/api/v1/quiz/sessions/${sessionId}/per-question-time`,
        );
        if (pq.ok && alive) {
          const body = (await pq.json()) as PerQTimeResponse;
          const items = Array.isArray(body.items) ? body.items : [];
          setPerQ(items);
          // Pre-fetch any topic titles we don't already have so the
          // drawer can show "Thermodynamics" instead of a UUID.
          const uniqueTopicIds = Array.from(
            new Set(items.map((it) => it.topicId).filter((id): id is string => !!id)),
          );
          await Promise.all(
            uniqueTopicIds.map(async (id) => {
              try {
                const r = await auth.fetch(`/api/v1/catalog/topics/${id}`);
                if (r.ok && alive) {
                  const data = (await r.json()) as TopicSummary;
                  setTopicTitles((cur) => ({ ...cur, [id]: data }));
                }
              } catch { /* per-topic failure non-fatal */ }
            }),
          );
        }
      } catch { /* offline — drawer still works with what session/{id} has */ }
    })();
    return () => { alive = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!user?.id || !session?.topicId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (r.ok && alive) {
          const data = (await r.json()) as MasteryListResponse;
          const ts = Array.isArray(data.topics) ? data.topics : [];
          const m = ts.find((t) => t.topicId === session.topicId);
          if (m) setMastery({ ewa: m.ewa, n: m.n });
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [user?.id, session?.topicId]);

  /* ── Derived ──────────────────────────────────────────────── */

  const items = session?.items ?? [];
  const correct = items.filter((it) => it.isCorrect === true).length;
  const wrong = items.filter((it) => it.answered && it.isCorrect === false).length;
  const skipped = items.filter((it) => it.answered && it.answerIdx === undefined).length;
  const total = session?.targetCount ?? items.length;
  const durationSec = useMemo(() => {
    if (!session?.startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000));
  }, [session?.startedAt]);
  const avgTime = items.length
    ? Math.round(items.reduce((acc, it) => acc + (it.timeSpentSec ?? Math.max(20, durationSec / items.length)), 0) / items.length)
    : 0;
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const readinessLift = Math.max(0, Math.round((correct / Math.max(1, total)) * 8));
  const thetaChange = +((correct - wrong) * 0.04).toFixed(2);

  // Time distribution bins
  const timeBins = useMemo(() => {
    const bins = { under30: 0, r30to60: 0, r60to90: 0, over90: 0 };
    for (const it of items) {
      const t = it.timeSpentSec ?? Math.max(20, Math.round(durationSec / Math.max(1, items.length)));
      if (t < 30) bins.under30++;
      else if (t < 60) bins.r30to60++;
      else if (t < 90) bins.r60to90++;
      else bins.over90++;
    }
    return bins;
  }, [items, durationSec]);

  // Synthetic "what changed" — replace with the live insight endpoint
  // once it ships. Each bullet is shaped against the same vocabulary
  // the live endpoint will use.
  const changedBullets = useMemo(() => {
    const masteryPct = mastery ? Math.round(mastery.ewa * 100) : null;
    return [
      `Mastery on ${topic?.title ?? "this topic"} ↑ ${Math.max(5, readinessLift * 2)}% → ${
        masteryPct ?? "—"
      }% — ${masteryPct && masteryPct >= 70 ? "approaching strong" : "still weak; another session recommended."}`,
      `${topic?.title ?? "This chapter"} now classified as ${
        correct / Math.max(1, total) >= 0.7 ? "strong (≥70%)" : "developing"
      }.`,
      `Your θ for this chapter moved from ${(
        (mastery?.ewa ?? 0.5) * 2 - 1 - thetaChange
      ).toFixed(2)} to ${((mastery?.ewa ?? 0.5) * 2 - 1).toFixed(2)}.`,
    ];
  }, [topic, mastery, correct, total, readinessLift, thetaChange]);

  return (
    <VidyaShell
      crumbs="AI practice · Session complete"
      title="Session results"
      subtitle={`${topic?.title ?? "Topic"} · ${total} questions · ${minutes} min ${seconds} s`}
      actions={
        <>
          <button className="vidya-shell__chip">⬇ Export PDF</button>
          <Link to="/practice" className="vidya-shell__primary" style={{ background: "var(--ink)" }}>
            ▶ Next session
          </Link>
        </>
      }
    >
      {/* 4 KPI tiles */}
      <div className="vidya-grid-4">
        <KpiTile
          label="Score"
          value={`${correct}`}
          unit={`/ ${total}`}
          delta={`+${readinessLift} pts vs. last`}
          deltaTone="good"
        />
        <KpiTile
          label="Readiness lift"
          value={`+${readinessLift}`}
          unit="pts"
          valueColor="var(--gold-2)"
        />
        <KpiTile
          label="Avg time"
          value={`${avgTime}`}
          unit="s/Q"
        />
        <KpiTile
          label="θ change"
          value={`${thetaChange >= 0 ? "+" : ""}${thetaChange.toFixed(2)}`}
          valueColor="var(--info)"
        />
      </div>

      <div className="vidya-grid-2">
        {/* Question breakdown */}
        <section className="vidya-breakdown">
          <div className="vidya-breakdown__head">
            <div>
              <div className="vidya-breakdown__eyebrow">Question breakdown</div>
              <div className="vidya-breakdown__title">Review all {total}</div>
            </div>
            <div className="vidya-breakdown__pills">
              <span className="vidya-breakdown__pill vidya-breakdown__pill--good">
                {correct} ✓
              </span>
              <span className="vidya-breakdown__pill vidya-breakdown__pill--bad">
                {wrong} ✗
              </span>
              <span className="vidya-breakdown__pill vidya-breakdown__pill--mute">
                {skipped} skipped
              </span>
            </div>
          </div>
          <table className="vidya-breakdown__table">
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td style={{ color: "var(--ink-3)", padding: "var(--sp-6)", textAlign: "center" }}>
                    Loading session items…
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const t = it.timeSpentSec ?? avgTime;
                  const b = it.bValue ?? 0.5 + (it.itemIdx % 5) * 0.08;
                  const verdictIcon =
                    it.isCorrect === true ? "✓" : it.isCorrect === false ? "✗" : "—";
                  const verdictClass =
                    it.isCorrect === true
                      ? "vidya-breakdown__icon--good"
                      : it.isCorrect === false
                        ? "vidya-breakdown__icon--bad"
                        : "vidya-breakdown__icon--mute";
                  // /per-question-time gives us real correctIdx +
                  // answerIdx + difficultyB + topicId + timeSeconds —
                  // prefer them over the fallback values we previously
                  // synthesized from the itemIdx hash.
                  const pq = perQ.find((p) => p.itemIdx === it.itemIdx);
                  const realAnswerIdx = pq?.answerIdx ?? it.answerIdx;
                  const realCorrectIdx = pq?.correctIdx ?? it.correctIdx;
                  const realB = pq?.difficultyB ?? it.bValue ?? b;
                  const realTime = pq?.timeSeconds ?? it.timeSpentSec ?? t;
                  const answerLetter = letterFor(realAnswerIdx ?? undefined);
                  const correctLetterReal = letterFor(realCorrectIdx ?? undefined);
                  const stemText = it.stem
                    ? it.stem.length > 64
                      ? `${it.stem.slice(0, 64)}…`
                      : it.stem
                    : `Question ${it.itemIdx + 1}`;
                  return (
                    <tr
                      key={it.itemIdx}
                      className="vidya-breakdown__row"
                      onClick={() => setOpenIdx(it.itemIdx)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open detail for question ${it.itemIdx + 1}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenIdx(it.itemIdx);
                        }
                      }}
                    >
                      <td className="vidya-breakdown__idx">
                        {String(it.itemIdx + 1).padStart(2, "0")}
                      </td>
                      <td>
                        <span className={`vidya-breakdown__icon ${verdictClass}`}>
                          {verdictIcon}
                        </span>
                      </td>
                      <td className="vidya-breakdown__stem">{stemText}</td>
                      <td className="vidya-breakdown__time">{realTime}s</td>
                      <td className="vidya-breakdown__b">b = {realB.toFixed(2)}</td>
                      <td className="vidya-breakdown__answer">
                        {isChoiceAnswer(it.questionType) ? (
                          <>
                            <span
                              className={
                                it.isCorrect === true
                                  ? "vidya-breakdown__letter vidya-breakdown__letter--good"
                                  : realAnswerIdx === undefined || realAnswerIdx === null
                                    ? "vidya-breakdown__letter vidya-breakdown__letter--mute"
                                    : "vidya-breakdown__letter vidya-breakdown__letter--bad"
                              }
                            >
                              {answerLetter}
                            </span>
                            <span className="vidya-breakdown__letter-sep">/</span>
                            <span className="vidya-breakdown__letter vidya-breakdown__letter--good">
                              {correctLetterReal}
                            </span>
                          </>
                        ) : (
                          // Typed-answer question (map / numeric / fill-in /
                          // matching …) — letters don't apply; the ✓/✗ column
                          // already carries the verdict.
                          <span className="vidya-breakdown__letter vidya-breakdown__letter--mute">
                            —
                          </span>
                        )}
                      </td>
                      <td className="vidya-breakdown__chev" aria-hidden>›</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        {/* Per-question deep-dive drawer */}
        {openIdx !== null ? (
          <QuestionDrawer
            onClose={() => setOpenIdx(null)}
            item={items.find((it) => it.itemIdx === openIdx)!}
            perQ={perQ.find((p) => p.itemIdx === openIdx)}
            sessionTopic={topic}
            sessionTopicMastery={mastery}
            topicTitles={topicTitles}
          />
        ) : null}

        {/* Right rail */}
        <div className="vidya-quiz-rail">
          <section className="vidya-changed">
            <div className="vidya-changed__eyebrow">What changed</div>
            <ul className="vidya-changed__list">
              {changedBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </section>

          <TimeDistributionBars bins={timeBins} />

          <section className="vidya-next">
            <div className="vidya-next__eyebrow">Next session</div>
            <div className="vidya-next__title">
              More {topic?.title ?? "practice"} · {total} questions
            </div>
            <div className="vidya-next__meta">
              Keep the momentum on this chapter
            </div>
            <Link
              to={session?.topicId ? `/catalog/topic/${session.topicId}` : "/practice"}
              className="vidya-shell__primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Continue →
            </Link>
          </section>
        </div>
      </div>
    </VidyaShell>
  );
}

/* ── KPI tile (Vidya editorial-style) ──────────────────────── */

interface KpiTileProps {
  label: string;
  value: string;
  unit?: string;
  valueColor?: string;
  delta?: string;
  deltaTone?: "good" | "bad" | "neutral";
}

function KpiTile({ label, value, unit, valueColor, delta, deltaTone = "good" }: KpiTileProps) {
  return (
    <section className="vidya-stat">
      <div className="vidya-stat__head">
        <span className="vidya-stat__label">{label}</span>
      </div>
      <div
        className="vidya-stat__number"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
        {unit ? <span className="vidya-stat__unit">{unit}</span> : null}
      </div>
      {delta ? (
        <div className={`vidya-stat__delta vidya-stat__delta--${deltaTone === "bad" ? "down" : "up"}`}>
          {delta}
        </div>
      ) : null}
    </section>
  );
}

function letterFor(idx: number | undefined): string {
  if (idx === undefined) return "—";
  return String.fromCharCode(65 + idx);
}

/* ── QuestionDrawer ───────────────────────────────────────────
   Slide-in right rail showing the deep-dive for a single
   question. Backend doesn't expose the question stem to
   students (the /content/questions/{id} authoring endpoint is
   moderator-gated), so the drawer focuses on what we have:
   verdict + difficulty + time spent + topic context + AI
   feedback synthesized from the per-question data + actionable
   links (open the topic in Study Map, practice 5 similar). */

interface QuestionDrawerProps {
  onClose: () => void;
  item: ItemSummary;
  perQ?: PerQTimeItem;
  sessionTopic: Topic | null;
  sessionTopicMastery: { ewa: number; n: number } | null;
  topicTitles: Record<string, TopicSummary>;
}

function QuestionDrawer({
  onClose,
  item,
  perQ,
  sessionTopic,
  sessionTopicMastery,
  topicTitles,
}: QuestionDrawerProps) {
  const answerIdx = perQ?.answerIdx ?? item.answerIdx;
  const correctIdx = perQ?.correctIdx ?? item.correctIdx;
  const b = perQ?.difficultyB ?? item.bValue ?? 0;
  const time = perQ?.timeSeconds ?? item.timeSpentSec ?? null;
  const topicId = perQ?.topicId ?? sessionTopic?.id ?? null;
  const topicTitle = (topicId && topicTitles[topicId]?.title) ?? sessionTopic?.title ?? "this topic";
  const subjectId = (topicId && topicTitles[topicId]?.subjectId) ?? sessionTopic?.subjectId ?? null;
  const verdict: "correct" | "wrong" | "skipped" =
    item.isCorrect === true ? "correct" : item.isCorrect === false ? "wrong" : "skipped";
  const choiceAnswer = isChoiceAnswer(item.questionType);

  return (
    <>
      <div className="vidya-drawer__scrim" onClick={onClose} aria-hidden />
      <aside
        className="vidya-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Question ${item.itemIdx + 1} detail`}
      >
        <header className="vidya-drawer__head">
          <div>
            <p className="vidya-drawer__crumb">
              Question {String(item.itemIdx + 1).padStart(2, "0")} ·{" "}
              {topicTitle.toUpperCase()}
            </p>
            <h2 className="vidya-drawer__title">
              {verdict === "correct"
                ? "Nailed it."
                : verdict === "wrong"
                  ? "Worth a closer look."
                  : "You skipped this one."}
            </h2>
          </div>
          <button
            type="button"
            className="vidya-drawer__close"
            onClick={onClose}
            aria-label="Close detail"
          >
            ✕
          </button>
        </header>

        {/* Verdict pills */}
        <div className="vidya-drawer__pills">
          <span className={`vidya-drawer__pill vidya-drawer__pill--${verdict}`}>
            {verdict === "correct" ? "✓ Correct" : verdict === "wrong" ? "✗ Wrong" : "— Skipped"}
          </span>
          <span className="vidya-drawer__pill vidya-drawer__pill--mute">
            b = {b.toFixed(2)} · difficulty
          </span>
          {time !== null ? (
            <span className="vidya-drawer__pill vidya-drawer__pill--mute">
              {time}s on this question
            </span>
          ) : null}
        </div>

        {/* The actual question stem (hydrated for answered items). */}
        {item.stem ? (
          <section className="vidya-drawer__section">
            <h3 className="vidya-drawer__h3">Question</h3>
            <p style={{ fontSize: 15, lineHeight: 1.55, margin: 0 }}>{item.stem}</p>
            {item.choices && item.choices.length > 0 ? (
              <ol
                style={{
                  margin: "10px 0 0",
                  paddingLeft: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {item.choices.map((choice, i) => {
                  const isCorrect = correctIdx === i;
                  // Only mark "picked" for choice questions — for typed
                  // answers answerIdx is a meaningless zero default.
                  const isPicked = choiceAnswer && answerIdx === i;
                  return (
                    <li
                      key={i}
                      style={{
                        fontSize: 14,
                        color: isCorrect
                          ? "var(--good)"
                          : isPicked
                            ? "var(--bad)"
                            : "var(--ink-2)",
                        fontWeight: isCorrect || isPicked ? 600 : 400,
                      }}
                    >
                      {letterFor(i)}. {choice}
                      {isCorrect ? " ✓" : isPicked ? " ✗" : ""}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
        ) : null}

        {/* Your answer vs correct — letters only make sense for single-
            choice MCQ. Typed-answer types (map / numeric / fill-in / …)
            convey the result via the verdict pill + the highlighted
            answer in the Question block above. */}
        {choiceAnswer ? (
          <section className="vidya-drawer__section">
            <h3 className="vidya-drawer__h3">Your answer</h3>
            <div className="vidya-drawer__answers">
              <div className="vidya-drawer__answer-row">
                <span className="vidya-drawer__answer-label">You picked</span>
                <span
                  className={`vidya-drawer__answer-letter vidya-drawer__answer-letter--${verdict === "correct" ? "good" : verdict === "skipped" ? "mute" : "bad"}`}
                >
                  {answerIdx !== undefined && answerIdx !== null
                    ? letterFor(answerIdx)
                    : "—"}
                </span>
              </div>
              <div className="vidya-drawer__answer-row">
                <span className="vidya-drawer__answer-label">Correct</span>
                <span className="vidya-drawer__answer-letter vidya-drawer__answer-letter--good">
                  {correctIdx !== undefined && correctIdx !== null
                    ? letterFor(correctIdx)
                    : "—"}
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {/* AI feedback — synthesized from the data we have */}
        <section className="vidya-drawer__feedback">
          <div className="vidya-drawer__feedback-eyebrow">◆ Vidya AI feedback</div>
          {item.explanation ? (
            <p style={{ marginTop: 0 }}>{item.explanation}</p>
          ) : null}
          <p>{buildFeedback({ verdict, b, time, topicTitle, topicMastery: sessionTopicMastery })}</p>
          <p className="vidya-drawer__feedback-meta">
            Backed by your θ on {topicTitle}{" "}
            {sessionTopicMastery
              ? `(mastery ${Math.round(sessionTopicMastery.ewa * 100)}% · ${sessionTopicMastery.n} answered)`
              : ""}.
          </p>
        </section>

        {/* Connected content */}
        <section className="vidya-drawer__section">
          <h3 className="vidya-drawer__h3">Review this</h3>
          <div className="vidya-drawer__links">
            {topicId ? (
              <Link
                to={`/catalog/topic/${encodeURIComponent(topicId)}`}
                className="vidya-drawer__link"
                onClick={onClose}
              >
                <span className="vidya-drawer__link-icon" aria-hidden>⚡</span>
                <span>
                  <strong>Practice 5 similar questions on {topicTitle}</strong>
                  <span>θ-tuned, same b ± 0.15 — should take ~8 min.</span>
                </span>
              </Link>
            ) : null}
            <Link
              to="/experts"
              className="vidya-drawer__link"
              onClick={onClose}
            >
              <span className="vidya-drawer__link-icon" aria-hidden>✦</span>
              <span>
                <strong>Ask Vidya about this question</strong>
                <span>Drop a screenshot — AI drafts, an expert verifies.</span>
              </span>
            </Link>
            {subjectId ? (
              <span className="vidya-drawer__link-meta">
                Subject: <code>{subjectId.slice(0, 8)}…</code> ·
                {" "}Open the study map from the sidebar to see chapter context.
              </span>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  );
}

interface FeedbackInputs {
  verdict: "correct" | "wrong" | "skipped";
  b: number;
  time: number | null;
  topicTitle: string;
  topicMastery: { ewa: number; n: number } | null;
}

function buildFeedback({ verdict, b, time, topicTitle, topicMastery }: FeedbackInputs): string {
  const masteryPct = topicMastery ? Math.round(topicMastery.ewa * 100) : null;
  const diff = b >= 0.7 ? "hard" : b >= 0.4 ? "mid-band" : "easy";
  if (verdict === "skipped") {
    return `You skipped this ${diff} question on ${topicTitle}. Skips don't hurt your θ, but they also don't move it — try answering even when unsure so the planner can calibrate.`;
  }
  if (verdict === "correct") {
    if (b >= 0.7) {
      return `Strong — you cleared a ${diff} (b = ${b.toFixed(2)}) item${time !== null ? ` in ${time}s` : ""}. Items at this band are what move your readiness number; keep them in your rotation.`;
    }
    return `Correct${time !== null ? ` (${time}s)` : ""}. This was a ${diff} item; the next session will step up to b ≈ ${(b + 0.12).toFixed(2)} on ${topicTitle}.`;
  }
  // Wrong
  const masteryClause = masteryPct !== null
    ? ` Your ${topicTitle} mastery is ${masteryPct}% — a ${diff} miss like this is the signal the planner uses to schedule another pass.`
    : "";
  if (time !== null && time < 20) {
    return `Wrong, and you answered in only ${time}s.${masteryClause} Reading-too-fast on ${diff} items is the #1 cause of avoidable losses; slow down on the next ${topicTitle} block.`;
  }
  return `Wrong on a ${diff} (b = ${b.toFixed(2)}) item${time !== null ? ` after ${time}s` : ""}.${masteryClause} Review the explanation, then practice 5 similar to lock it in.`;
}
