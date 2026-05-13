// Sprint 25 (P4-S25) — Mocks series view.
//
// Two tabs: Available (every blueprint for the focus exam) and Taken (the
// user's MOCK_BLUEPRINT sessions joined with blueprint metadata client-side).
// Available cards link to /mock-exam?blueprintId=...; Taken rows link to
// the existing /quiz/:sessionId/result page from S5/S20.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import {
  formatPct,
  summariseAttempt,
  type SectionBreakdown,
  type SessionRow,
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
  items: BlueprintListItem[];
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
  items: SessionListItem[];
}

interface BreakdownResp {
  sessionId: string;
  sections: SectionBreakdown[];
}

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string;
}

const JEE_MAIN_ID = "11111111-0000-0000-0000-000000000001";

export function Mocks() {
  const [params, setParams] = useSearchParams();
  const examId = params.get("examId") ?? JEE_MAIN_ID;
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exams, setExams] = useState<Exam[]>([]);
  const [tab, setTab] = useState<"available" | "taken">("available");
  const [blueprints, setBlueprints] = useState<BlueprintListItem[]>([]);
  const [taken, setTaken] = useState<SessionListItem[]>([]);
  const [breakdowns, setBreakdowns] = useState<Record<string, SectionBreakdown[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Exam catalogue — drives the exam selector.
  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exams`);
        if (!r.ok) return;
        setExams((await r.json()) as Exam[]);
      } catch {
        /* exam selector hides if the catalogue is unreachable */
      }
    })();
  }, []);

  // Available blueprints for the chosen exam.
  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exam-blueprints?examId=${examId}`);
        if (!r.ok) {
          setError("Could not load blueprints.");
          setBlueprints([]);
          return;
        }
        const body = (await r.json()) as BlueprintListResp;
        setBlueprints(body.items);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  // Taken sessions (mock-mode).
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/quiz/sessions?userId=${user.id}&mode=MOCK_BLUEPRINT&limit=50`,
        );
        if (!r.ok) return;
        const body = (await r.json()) as SessionListResp;
        setTaken(body.items);
        const submitted = body.items.filter((it) => it.status === "SUBMITTED");
        await Promise.all(
          submitted.map(async (it) => {
            try {
              const br = await auth.fetch(
                `/api/v1/analytics/sessions/${it.sessionId}/breakdown`,
              );
              if (!br.ok) return;
              const bbody = (await br.json()) as BreakdownResp;
              setBreakdowns((prev) => ({
                ...prev,
                [it.sessionId]: bbody.sections,
              }));
            } catch {
              /* per-row failure is non-fatal */
            }
          }),
        );
      } catch {
        /* taken-tab failure shouldn't block the available tab */
      }
    })();
  }, [user]);

  const blueprintById = useMemo(() => {
    const map: Record<string, BlueprintListItem> = {};
    for (const bp of blueprints) map[bp.id] = bp;
    return map;
  }, [blueprints]);

  const activeExam = exams.find((e) => e.id === examId);

  function changeExam(nextExamId: string): void {
    const next = new URLSearchParams(params);
    next.set("examId", nextExamId);
    setParams(next, { replace: true });
  }

  return (
    <main
      className="page"
      style={{
        padding: 24,
        maxWidth: 1080,
        color: "var(--text-primary)",
      }}
    >
      <h1 style={{ color: "var(--text-primary)", margin: "0 0 6px" }}>Mock Tests</h1>
      <p style={{ color: "var(--text-muted)", margin: "0 0 16px" }}>
        Take a real-pattern timed exam. Each mock follows a blueprint with
        section-wise time budgets, marking scheme, and an OMR-style answer
        sheet matching the actual exam.
      </p>

      {exams.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.04,
              marginBottom: 6,
            }}
          >
            Exam
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {exams.map((e) => {
              const on = e.id === examId;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => changeExam(e.id)}
                  style={{
                    padding: "6px 14px",
                    background: on ? "var(--color-blue, #4F87F6)" : "var(--bg-surface2)",
                    color: on ? "#fff" : "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
          {activeExam?.subtitle && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              {activeExam.subtitle}
            </div>
          )}
        </section>
      )}

      <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["available", "taken"] as const).map((t) => {
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: `1px solid ${on ? "var(--color-blue, #4F87F6)" : "var(--border)"}`,
                background: on ? "var(--color-blue, #4F87F6)" : "var(--bg-surface2)",
                color: on ? "#fff" : "var(--text-primary)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t === "available"
                ? `Available (${blueprints.length})`
                : `Taken (${taken.length})`}
            </button>
          );
        })}
      </nav>

      {error && (
        <p
          style={{
            padding: 12,
            background: "rgba(244,63,94,0.1)",
            border: "1px solid var(--color-red, #f43f5e)",
            color: "var(--color-red, #f43f5e)",
            borderRadius: 6,
          }}
        >
          {error}
        </p>
      )}

      {tab === "available" && (
        <section>
          {loading && (
            <p style={{ color: "var(--text-muted)" }}>Loading blueprints…</p>
          )}
          {!loading && blueprints.length === 0 && !error && (
            <p style={{ color: "var(--text-muted)" }}>
              No mock blueprints have been published for this exam yet.
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {blueprints.map((bp) => (
              <li
                key={bp.id}
                style={{
                  background: "var(--bg-surface2)",
                  border: "1px solid var(--border)",
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "var(--text-primary)",
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{bp.name}</div>
                  <p
                    style={{
                      margin: "6px 0 0",
                      color: "var(--text-secondary, #B8C5E0)",
                      fontSize: 13,
                    }}
                  >
                    {bp.totalQuestions} questions · {bp.totalMinutes} min · +
                    {bp.marksCorrect} / {bp.marksNegative} marks
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/mock-exam?blueprintId=${bp.id}`)}
                  style={{
                    padding: "8px 18px",
                    background: "var(--color-blue, #4F87F6)",
                    color: "#fff",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
                  Start mock →
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "taken" && (
        <section>
          {taken.length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>
              No mock attempts yet — take one from the Available tab to see it
              here.
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {taken.map((s) => {
              const bp = s.blueprintId ? blueprintById[s.blueprintId] : null;
              const session: SessionRow = {
                sessionId: s.sessionId,
                blueprintId: s.blueprintId ?? null,
                status: s.status,
                startedAt: s.startedAt,
                submittedAt: s.submittedAt,
                servedCount: s.servedCount,
                correctCount: s.correctCount,
              };
              const summary = summariseAttempt(session, breakdowns[s.sessionId]);
              return (
                <li
                  key={s.sessionId}
                  style={{
                    background: "var(--bg-surface2)",
                    border: "1px solid var(--border)",
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 12,
                    color: "var(--text-primary)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {bp?.name ?? "Mock attempt"}
                    </div>
                    <span
                      style={{
                        padding: "2px 10px",
                        borderRadius: 12,
                        background:
                          s.status === "SUBMITTED"
                            ? "rgba(16,196,122,0.18)"
                            : "rgba(245,166,35,0.18)",
                        color:
                          s.status === "SUBMITTED"
                            ? "var(--color-green, #10C47A)"
                            : "var(--color-amber, #F5A623)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.04,
                      }}
                    >
                      {s.status}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "6px 0",
                      color: "var(--text-secondary, #B8C5E0)",
                      fontSize: 13,
                    }}
                  >
                    {new Date(s.startedAt).toLocaleString()} ·{" "}
                    {summary.servedCount} answered · accuracy{" "}
                    <strong>{formatPct(summary.accuracy)}</strong>
                    {summary.weakestSection && (
                      <>
                        {" "}
                        · weakest:{" "}
                        <strong>{summary.weakestSection.sectionId}</strong> (
                        {formatPct(summary.weakestSection.accuracy)})
                      </>
                    )}
                  </p>
                  <Link
                    to={`/quiz/${s.sessionId}/result`}
                    style={{
                      color: "var(--color-blue, #4F87F6)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    View result →
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
