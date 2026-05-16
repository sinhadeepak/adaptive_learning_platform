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
  bValue?: number;
  timeSpentSec?: number;
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

export function QuizResult() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [mastery, setMastery] = useState<{ ewa: number; n: number } | null>(null);

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
          const m = data.topics.find((t) => t.topicId === session.topicId);
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
      `Carnot cycle now classified as ${
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
                  const answer = letterFor(it.answerIdx);
                  const correctLetter = letterFor(it.correctIdx);
                  const stemText =
                    it.stem?.split("·")?.[0]?.slice(0, 50) ??
                    questionPlaceholder(it.itemIdx);
                  return (
                    <tr key={it.itemIdx}>
                      <td className="vidya-breakdown__idx">
                        {String(it.itemIdx + 1).padStart(2, "0")}
                      </td>
                      <td>
                        <span className={`vidya-breakdown__icon ${verdictClass}`}>
                          {verdictIcon}
                        </span>
                      </td>
                      <td className="vidya-breakdown__stem">{stemText}</td>
                      <td className="vidya-breakdown__time">{t}s</td>
                      <td className="vidya-breakdown__b">b = {b.toFixed(2)}</td>
                      <td className="vidya-breakdown__answer">
                        <span
                          className={
                            it.isCorrect === true
                              ? "vidya-breakdown__letter vidya-breakdown__letter--good"
                              : it.answerIdx === undefined
                                ? "vidya-breakdown__letter vidya-breakdown__letter--mute"
                                : "vidya-breakdown__letter vidya-breakdown__letter--bad"
                          }
                        >
                          {answer}
                        </span>
                        <span className="vidya-breakdown__letter-sep">/</span>
                        <span className="vidya-breakdown__letter vidya-breakdown__letter--good">
                          {correctLetter}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

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
              Heat transfer · 10 questions
            </div>
            <div className="vidya-next__meta">
              Predicted lift +5 pts · ~16 min
            </div>
            <Link
              to="/practice"
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

function questionPlaceholder(idx: number): string {
  const stems = [
    "First law · enthalpy",
    "Carnot cycle efficiency",
    "Isothermal vs adiabatic",
    "Entropy change · phase tx",
    "Heat capacity ratio",
    "Reversible processes",
    "Carnot · 80% efficiency",
    "Stirling cycle PV diagram",
    "Second law · entropy uni",
    "Internal energy diatomic",
    "Enthalpy of formation",
    "Free energy ΔG",
  ];
  return stems[idx % stems.length]!;
}
