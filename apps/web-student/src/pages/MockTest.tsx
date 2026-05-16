import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";

// Full-screen mock test player. Mirrors the mobile flow exactly:
// /adaptive/mock/plan → render player with timer → /adaptive/mock/score on submit.
//
// The plan response contains questions but never correctIdx — the engine
// keeps that server-side keyed by mockId. Submission round-trips just the
// mockId + answers map; scoring lives in adaptive-engine.

interface MockSection {
  name: string;
  questionCount: number;
  fromIdx: number;
  toIdx: number;
}

interface MockQuestion {
  id: string;
  topicId: string;
  stem: string;
  choices: string[];
  difficultyB: number;
}

interface MockPlan {
  mockId: string;
  examCode: string;
  examName: string;
  durationMinutes: number;
  totalQuestions: number;
  marksCorrect: number;
  marksWrong: number;
  maxMarks: number;
  sections: MockSection[];
  questions: MockQuestion[];
  error?: string;
  message?: string;
}

export function MockTest() {
  const [params] = useSearchParams();
  const examCode = params.get("exam") || "NEET";
  const { user } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<MockPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Build the plan once on mount.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/adaptive/mock/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: user.id, examCode }),
        });
        if (!res.ok) {
          setError("Could not build mock test.");
          return;
        }
        const body = (await res.json()) as MockPlan;
        if (body.error) {
          setError(body.message ?? body.error);
          return;
        }
        setPlan(body);
        setRemaining(body.durationMinutes * 60);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    })();
  }, [user, examCode]);

  // Timer.
  useEffect(() => {
    if (!plan || remaining <= 0 || submittedRef.current) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          submit(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [plan, remaining]);

  const current = plan?.questions[idx];
  const sectionForIdx = useMemo(() => {
    if (!plan) return "";
    for (const s of plan.sections) {
      if (idx >= s.fromIdx && idx < s.toIdx) return s.name;
    }
    return "";
  }, [plan, idx]);

  function pick(choiceIdx: number) {
    if (!current) return;
    setAnswers((a) => ({ ...a, [current.id]: choiceIdx }));
  }

  function toggleFlag() {
    if (!current) return;
    setFlagged((s) => {
      const next = new Set(s);
      if (next.has(current.id)) next.delete(current.id);
      else next.add(current.id);
      return next;
    });
  }

  async function submit(autoFromTimer = false) {
    if (!plan || submittedRef.current) return;
    if (!autoFromTimer) {
      const answered = Object.keys(answers).length;
      const ok = window.confirm(
        `Submit mock?\nAnswered: ${answered} of ${plan.totalQuestions}\nFlagged: ${flagged.size}`,
      );
      if (!ok) return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await auth.fetch("/api/v1/adaptive/mock/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mockId: plan.mockId, answers }),
      });
      const body = await res.json();
      // Stash result for the result page; routing keeps it simple.
      sessionStorage.setItem("alp.mock.lastResult", JSON.stringify(body));
      navigate("/mock/result", { replace: true });
    } catch (e) {
      submittedRef.current = false;
      setSubmitting(false);
      window.alert(e instanceof Error ? e.message : "Submit failed");
    }
  }

  if (error) {
    return (
      <AppShell title="Mock Test">
        <div className="card" style={{ padding: 20, color: "var(--bad)" }}>{error}</div>
      </AppShell>
    );
  }
  if (!plan || !current) {
    return (
      <AppShell title="Mock Test">
        <div className="card" style={{ padding: 20, color: "var(--ink-3)" }}>
          Building your mock paper…
        </div>
      </AppShell>
    );
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timerStr = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  const timerLow = remaining < 60;

  return (
    <AppShell title={`${plan.examName} · ${sectionForIdx}`}>
      {/* Timer + progress */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          Q{idx + 1} / {plan.totalQuestions} · {sectionForIdx}
        </div>
        <div
          style={{
            background: timerLow ? "rgba(244,63,94,0.15)" : "rgba(34,212,238,0.12)",
            border: `1px solid ${timerLow ? "var(--bad)" : "var(--gold)"}`,
            color: timerLow ? "var(--bad)" : "var(--gold)",
            padding: "4px 10px",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 0.5,
          }}
        >
          ⏱ {timerStr}
        </div>
      </div>

      {/* Question navigator */}
      <div
        style={{
          display: "flex",
          gap: 4,
          overflowX: "auto",
          paddingBottom: 12,
          marginBottom: 12,
          borderBottom: "1px solid var(--rule)",
        }}
      >
        {plan.questions.map((q, i) => {
          const answered = q.id in answers;
          const isFlag = flagged.has(q.id);
          const active = i === idx;
          return (
            <button
              key={q.id}
              onClick={() => setIdx(i)}
              style={{
                width: 32,
                height: 32,
                background: answered
                  ? "var(--good)"
                  : isFlag
                    ? "var(--warn)"
                    : "var(--paper-2)",
                color: answered || isFlag ? "white" : "var(--ink-3)",
                border: active ? "2px solid var(--gold)" : "none",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Question card */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span className="pill pill-info">Q{idx + 1} · {sectionForIdx}</span>
          <button
            onClick={toggleFlag}
            className="btn btn-ghost"
            style={{
              fontSize: 11,
              color: flagged.has(current.id) ? "var(--warn)" : "var(--ink-3)",
              border: `1px solid ${flagged.has(current.id) ? "var(--warn)" : "var(--rule)"}`,
            }}
          >
            {flagged.has(current.id) ? "🔖 Flagged" : "🔖 Flag"}
          </button>
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: "var(--ink)", marginBottom: 18 }}>
          {current.stem}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {current.choices.map((c, i) => {
            const picked = answers[current.id] === i;
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                className="card"
                style={{
                  textAlign: "left",
                  padding: 12,
                  border: `1px solid ${picked ? "var(--info)" : "var(--rule)"}`,
                  background: picked ? "rgba(79,135,246,0.10)" : undefined,
                  cursor: "pointer",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 4,
                    background: picked ? "var(--info)" : "var(--paper-2)",
                    color: picked ? "white" : "var(--ink-3)",
                    fontWeight: 700,
                    fontSize: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span style={{ color: "var(--ink)", fontSize: 14 }}>{c}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", marginTop: 16, gap: 8 }}>
        <button
          className="btn btn-ghost"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          ← Prev
        </button>
        <div style={{ flex: 1 }} />
        {idx < plan.totalQuestions - 1 ? (
          <button className="btn btn-primary" onClick={() => setIdx((i) => i + 1)}>
            Next →
          </button>
        ) : (
          <button
            className="btn"
            onClick={() => submit(false)}
            disabled={submitting}
            style={{ background: "var(--good)", color: "white", fontWeight: 700 }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        )}
      </div>
    </AppShell>
  );
}