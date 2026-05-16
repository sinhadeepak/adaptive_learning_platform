// Mocks — Vidya v1 redesign of the mock-test catalog.
//
// Spec: docs/02-design/design-system/04_components.md
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   ┌─ topbar: MOCK TESTS · {exam}  · exam chips · Take random ─┐
//   │  ┌─ Available (default) or Taken tab ────────────────────┐
//   │  │  available: grid of mock cards (name + minutes + Qs   │
//   │  │             + marking + Start primary)                │
//   │  │  taken:     list of past attempts (score, accuracy,   │
//   │  │             time taken, weakest section, View)        │
//   │  └────────────────────────────────────────────────────────┘
//
// examId comes from ?examId=… (set by the QuickActions card on
// the exam dashboard). Defaults to the first catalog exam so a
// direct visit to /mocks still works.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import {
  formatPct,
  summariseAttempt,
  type SectionBreakdown,
} from "../lib/mock_series";

interface BlueprintListItem {
  id: string;
  name: string;
  totalQuestions: number;
  totalMinutes: number;
  marksCorrect: number;
  marksNegative: number;
}

interface BlueprintListResp {
  examId: string;
  items?: BlueprintListItem[] | null;
}

interface SessionListItem {
  sessionId: string;
  topicId: string;
  mode: string;
  status: string;
  servedCount: number;
  correctCount: number;
  startedAt: string;
  submittedAt: string | null;
  blueprintId?: string;
}

interface SessionListResp {
  userId: string;
  items?: SessionListItem[] | null;
}

interface BreakdownResp {
  sessionId: string;
  sections?: SectionBreakdown[] | null;
}

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string;
}

export function Mocks() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<string | null>(
    params.get("examId") ?? null,
  );
  const [tab, setTab] = useState<"available" | "taken">("available");
  const [blueprints, setBlueprints] = useState<BlueprintListItem[]>([]);
  const [taken, setTaken] = useState<SessionListItem[]>([]);
  const [breakdowns, setBreakdowns] = useState<Record<string, SectionBreakdown[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Catalog
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (!r.ok || !alive) return;
        const body = (await r.json()) as Exam[] | { exams?: Exam[] | null };
        const list = Array.isArray(body)
          ? body
          : Array.isArray(body.exams)
            ? body.exams
            : [];
        if (alive) {
          setExams(list);
          if (!examId && list[0]) setExamId(list[0].id);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Available blueprints for the chosen exam
  useEffect(() => {
    if (!examId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exam-blueprints?examId=${examId}`);
        if (!alive) return;
        if (!r.ok) {
          setError("Could not load blueprints.");
          setBlueprints([]);
          return;
        }
        const body = (await r.json()) as BlueprintListResp;
        setBlueprints(Array.isArray(body.items) ? body.items : []);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [examId]);

  // Taken sessions
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/quiz/sessions?userId=${user.id}&mode=MOCK_BLUEPRINT&limit=50`,
        );
        if (!r.ok || !alive) return;
        const body = (await r.json()) as SessionListResp;
        const items = Array.isArray(body.items) ? body.items : [];
        if (alive) setTaken(items);
        const submitted = items.filter((it) => it.status === "SUBMITTED");
        await Promise.all(
          submitted.map(async (it) => {
            try {
              const br = await auth.fetch(
                `/api/v1/analytics/sessions/${it.sessionId}/breakdown`,
              );
              if (!br.ok) return;
              const bbody = (await br.json()) as BreakdownResp;
              const sec = Array.isArray(bbody.sections) ? bbody.sections : [];
              if (alive) {
                setBreakdowns((prev) => ({ ...prev, [it.sessionId]: sec }));
              }
            } catch { /* per-row failure non-fatal */ }
          }),
        );
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [user]);

  const blueprintById = useMemo(() => {
    const map: Record<string, BlueprintListItem> = {};
    for (const b of blueprints) map[b.id] = b;
    return map;
  }, [blueprints]);

  const activeExam = exams.find((e) => e.id === examId);

  function changeExam(nextExamId: string) {
    setExamId(nextExamId);
    const next = new URLSearchParams(params);
    next.set("examId", nextExamId);
    setParams(next, { replace: true });
  }

  async function startMock(blueprintId: string) {
    if (!user) return;
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/mock-from-blueprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprintId, userId: user.id }),
      });
      if (!r.ok) {
        setError(`Could not start mock (HTTP ${r.status}).`);
        return;
      }
      const body = (await r.json()) as { sessionId: string };
      navigate(`/quiz/${body.sessionId}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <VidyaShell
      crumbs={`Mock tests · ${activeExam?.code ?? "—"}`}
      title="Mock tests"
      subtitle="Real-pattern timed exams. Each blueprint follows the actual paper's section budgets, marking scheme, and OMR-style answer sheet."
      chips={
        <>
          {exams.map((e) => (
            <button
              key={e.id}
              className={`vidya-shell__chip${e.id === examId ? " vidya-shell__chip--on" : ""}`}
              onClick={() => changeExam(e.id)}
            >
              {e.code}
            </button>
          ))}
        </>
      }
      actions={
        blueprints.length > 0 ? (
          <button
            className="vidya-shell__primary"
            onClick={() => {
              const first = blueprints[0];
              if (first) void startMock(first.id);
            }}
          >
            ▶ Start latest mock
          </button>
        ) : undefined
      }
    >
      <div className="vidya-mocks-tabs">
        <button
          className={`vidya-mocks-tabs__tab${tab === "available" ? " vidya-mocks-tabs__tab--on" : ""}`}
          onClick={() => setTab("available")}
        >
          Available
          {blueprints.length > 0 ? (
            <span className="vidya-mocks-tabs__count">{blueprints.length}</span>
          ) : null}
        </button>
        <button
          className={`vidya-mocks-tabs__tab${tab === "taken" ? " vidya-mocks-tabs__tab--on" : ""}`}
          onClick={() => setTab("taken")}
        >
          Taken
          {taken.length > 0 ? (
            <span className="vidya-mocks-tabs__count">{taken.length}</span>
          ) : null}
        </button>
      </div>

      {error ? (
        <div className="vidya-auth__error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {tab === "available" ? (
        loading ? (
          <p style={{ color: "var(--ink-3)", padding: "var(--sp-6) 0" }}>
            Loading blueprints…
          </p>
        ) : blueprints.length === 0 ? (
          <EmptyState
            title="No mocks available yet"
            body={`Blueprints for ${activeExam?.name ?? "this exam"} haven't been published. Pick another exam from the chips above.`}
          />
        ) : (
          <div className="vidya-mock-grid">
            {blueprints.map((b) => (
              <BlueprintCard
                key={b.id}
                bp={b}
                onStart={() => void startMock(b.id)}
              />
            ))}
          </div>
        )
      ) : taken.length === 0 ? (
        <EmptyState
          title="No mocks taken yet"
          body="Once you finish a mock its scorecard lands here with the weakest section + per-blueprint history."
        />
      ) : (
        <section className="vidya-attempts">
          <div className="vidya-attempts__head">
            <span className="vidya-attempts__title">Recent attempts</span>
          </div>
          <table className="vidya-attempts__table">
            <thead>
              <tr>
                <th>Mock</th>
                <th style={{ textAlign: "right" }}>Score</th>
                <th style={{ textAlign: "right" }}>Accuracy</th>
                <th>Weakest section</th>
                <th style={{ textAlign: "right" }}>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {taken.map((it) => {
                const summary = summariseAttempt(
                  {
                    sessionId: it.sessionId,
                    blueprintId: it.blueprintId ?? "",
                    status: it.status,
                    startedAt: it.startedAt,
                    submittedAt: it.submittedAt,
                    servedCount: it.servedCount,
                    correctCount: it.correctCount,
                  },
                  breakdowns[it.sessionId],
                );
                const bp = it.blueprintId
                  ? blueprintById[it.blueprintId]
                  : null;
                return (
                  <tr key={it.sessionId}>
                    <td>
                      <div className="vidya-attempts__name">
                        {bp?.name ?? "Mock"}
                      </div>
                      <div className="vidya-attempts__meta">
                        Started {new Date(it.startedAt).toLocaleString()}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="vidya-attempts__score">
                        {summary.correctCount}
                      </span>
                      <span className="vidya-attempts__score-sep">/</span>
                      <span>{summary.servedCount || "—"}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span
                        className={`vidya-attempts__pct vidya-attempts__pct--${pctTone(summary.accuracy)}`}
                      >
                        {formatPct(summary.accuracy)}
                      </span>
                    </td>
                    <td>
                      {summary.weakestSection ? (
                        <span className="vidya-attempts__weak">
                          {summary.weakestSection.sectionId} ·{" "}
                          {formatPct(summary.weakestSection.accuracy)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span
                        className={`vidya-attempts__status vidya-attempts__status--${it.status === "SUBMITTED" ? "done" : "open"}`}
                      >
                        {it.status === "SUBMITTED" ? "Submitted" : "In progress"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        to={
                          it.status === "SUBMITTED"
                            ? `/quiz/${it.sessionId}/result`
                            : `/quiz/${it.sessionId}`
                        }
                        className="vidya-attempts__view"
                      >
                        {it.status === "SUBMITTED" ? "View →" : "Resume →"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </VidyaShell>
  );
}

/* ── Blueprint card ──────────────────────────────────────── */

function BlueprintCard({
  bp,
  onStart,
}: {
  bp: BlueprintListItem;
  onStart: () => void;
}) {
  return (
    <section className="vidya-mock-bp">
      <header className="vidya-mock-bp__head">
        <span className="vidya-mock-bp__eyebrow">Blueprint</span>
        <h3 className="vidya-mock-bp__name">{bp.name}</h3>
      </header>

      <dl className="vidya-mock-bp__stats">
        <div>
          <dt>Questions</dt>
          <dd>{bp.totalQuestions}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>
            {bp.totalMinutes}
            <span className="vidya-mock-bp__unit">min</span>
          </dd>
        </div>
        <div>
          <dt>Marking</dt>
          <dd>
            +{bp.marksCorrect}
            <span className="vidya-mock-bp__unit"> / </span>
            {bp.marksNegative ? `-${bp.marksNegative}` : "0"}
          </dd>
        </div>
      </dl>

      <button className="vidya-shell__primary vidya-mock-bp__cta" onClick={onStart}>
        ▶ Start mock
      </button>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="vidya-mock-empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function pctTone(acc: number): "good" | "warn" | "bad" | "mute" {
  if (!Number.isFinite(acc) || acc <= 0) return "mute";
  if (acc >= 0.7) return "good";
  if (acc >= 0.45) return "warn";
  return "bad";
}
