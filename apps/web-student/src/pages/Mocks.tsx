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

const JEE_MAIN_ID = "11111111-0000-0000-0000-000000000001";

export function Mocks() {
  const [params] = useSearchParams();
  const examId = params.get("examId") ?? JEE_MAIN_ID;
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"available" | "taken">("available");
  const [blueprints, setBlueprints] = useState<BlueprintListItem[]>([]);
  const [taken, setTaken] = useState<SessionListItem[]>([]);
  const [breakdowns, setBreakdowns] = useState<Record<string, SectionBreakdown[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Available blueprints.
  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exam-blueprints?examId=${examId}`);
        if (!r.ok) {
          setError("Could not load blueprints.");
          return;
        }
        const body = (await r.json()) as BlueprintListResp;
        setBlueprints(body.items);
      } catch (e) {
        setError((e as Error).message);
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
        if (!r.ok) return; // soft-fail; the page still shows "Available"
        const body = (await r.json()) as SessionListResp;
        setTaken(body.items);
        // Fan-out per-session breakdown for SUBMITTED rows only.
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

  if (error) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p className="banner banner-error">{error}</p>
      </main>
    );
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 1080 }}>
      <h1>Mock Tests</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Take a real-pattern timed exam. Each mock follows a blueprint with
        section-wise time budgets, marking scheme, and an OMR-style answer
        sheet matching the actual exam.
      </p>

      <nav style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {(["available", "taken"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid var(--border-faint)",
              background: tab === t ? "var(--bg-elevated, #eef)" : "transparent",
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === "available" ? "Available" : `Taken (${taken.length})`}
          </button>
        ))}
      </nav>

      {tab === "available" && (
        <section style={{ marginTop: 16 }}>
          {blueprints.length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>
              No blueprints available yet for this exam.
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {blueprints.map((bp) => (
              <li
                key={bp.id}
                style={{
                  background: "var(--bg-surface-1, #fff)",
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{bp.name}</strong>
                  <p style={{ margin: "4px 0", color: "var(--text-muted)", fontSize: 14 }}>
                    {bp.totalQuestions} questions · {bp.totalMinutes} min · +
                    {bp.marksCorrect} / {bp.marksNegative} marks
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate(`/mock-exam?blueprintId=${bp.id}`)}
                >
                  Start mock
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "taken" && (
        <section style={{ marginTop: 16 }}>
          {taken.length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>
              No mock attempts yet — take one from the Available tab to see it
              here.
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0 }}>
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
                    background: "var(--bg-surface-1, #fff)",
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{bp?.name ?? "Mock attempt"}</strong>
                    <span
                      className="pill"
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        background:
                          s.status === "SUBMITTED"
                            ? "var(--color-green, #10C47A)"
                            : "var(--color-amber, #F5A623)",
                        color: "#fff",
                      }}
                    >
                      {s.status}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0", color: "var(--text-muted)", fontSize: 14 }}>
                    {new Date(s.startedAt).toLocaleString()} ·{" "}
                    {summary.servedCount} answered · accuracy{" "}
                    <strong>{formatPct(summary.accuracy)}</strong>
                    {summary.weakestSection && (
                      <>
                        {" "}
                        · weakest: <strong>{summary.weakestSection.sectionId}</strong> (
                        {formatPct(summary.weakestSection.accuracy)})
                      </>
                    )}
                  </p>
                  <Link to={`/quiz/${s.sessionId}/result`}>View result →</Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
