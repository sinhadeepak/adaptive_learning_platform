// Vidya v1 redesign — Diagnostic placement (F2a).
//
// Post-auth wrapper of the existing /screening/* flow. ~12 items spanning
// the student's exam. On reveal, calls /screening/{token}/persist which
// writes both a screening_attempts row AND a user_theta_prior row that
// the adaptive engine reads at session start to seed EAP estimation.
//
// Endpoints used (all already shipped before this feature):
//   POST /api/v1/screening/start
//   GET  /api/v1/screening/{token}/next
//   POST /api/v1/screening/{token}/answer
//   GET  /api/v1/screening/{token}/reveal
//   POST /api/v1/screening/{token}/persist  (the F2a wiring lives here)

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { auth } from "../lib/api";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface NextResponse {
  itemIdx: number;
  total: number;
  stem: string;
  choices: string[];
}

interface RevealResponse {
  scorePct: number;
  correct: number;
  total: number;
  readinessSeed: number;
  topicBreakdown: Array<{ topicId: string; correct: number; total: number }>;
}

type Phase = "intro" | "playing" | "reveal" | "done" | "error";

export function DiagnosticPlacement() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const examCode = params.get("exam") ?? "JEE-MAIN";

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [target, setTarget] = useState<number>(0);
  const [current, setCurrent] = useState<NextResponse | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reveal, setReveal] = useState<RevealResponse | null>(null);
  const [persisting, setPersisting] = useState(false);

  async function startSession() {
    setError(null);
    try {
      const r = await auth.fetch(`/api/v1/screening/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exam_code: examCode, language: "en" }),
      });
      if (!r.ok) {
        if (r.status === 503) {
          setError(
            "Not enough published questions to seed a diagnostic for this exam yet. Try practice instead.",
          );
        } else {
          setError(`Couldn't start diagnostic (HTTP ${r.status}).`);
        }
        setPhase("error");
        return;
      }
      const body = (await r.json()) as {
        token: string;
        target_count: number;
        exam_code: string;
      };
      setToken(body.token);
      setTarget(body.target_count);
      setPhase("playing");
      await loadNext(body.token);
    } catch {
      setError("Network error starting diagnostic.");
      setPhase("error");
    }
  }

  async function loadNext(t: string) {
    try {
      const r = await auth.fetch(`/api/v1/screening/${t}/next`);
      if (r.status === 409) {
        await loadReveal(t);
        return;
      }
      if (!r.ok) {
        setError(`Couldn't load next question (HTTP ${r.status}).`);
        setPhase("error");
        return;
      }
      const body = (await r.json()) as {
        item_idx: number;
        total: number;
        stem: string;
        choices: string[];
      };
      setCurrent({
        itemIdx: body.item_idx,
        total: body.total,
        stem: body.stem,
        choices: body.choices,
      });
      setPicked(null);
    } catch {
      setError("Network error loading next question.");
      setPhase("error");
    }
  }

  async function submitAnswer() {
    if (!current || picked === null || !token) return;
    setSubmitting(true);
    try {
      const r = await auth.fetch(`/api/v1/screening/${token}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_idx: current.itemIdx,
          answer_idx: picked,
        }),
      });
      if (!r.ok) {
        setError(`Couldn't submit answer (HTTP ${r.status}).`);
        return;
      }
      await loadNext(token);
    } catch {
      setError("Network error submitting answer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadReveal(t: string) {
    try {
      const r = await auth.fetch(`/api/v1/screening/${t}/reveal`);
      if (!r.ok) {
        setError(`Couldn't reveal score (HTTP ${r.status}).`);
        setPhase("error");
        return;
      }
      const body = (await r.json()) as {
        score_pct: number;
        correct: number;
        total: number;
        readiness_seed: number;
        topic_breakdown: Array<{
          topic_id: string;
          correct: number;
          total: number;
        }>;
      };
      setReveal({
        scorePct: body.score_pct,
        correct: body.correct,
        total: body.total,
        readinessSeed: body.readiness_seed,
        topicBreakdown: body.topic_breakdown.map((t) => ({
          topicId: t.topic_id,
          correct: t.correct,
          total: t.total,
        })),
      });
      setPhase("reveal");
      await persistResult(t);
    } catch {
      setError("Network error revealing score.");
      setPhase("error");
    }
  }

  async function persistResult(t: string) {
    setPersisting(true);
    try {
      const r = await auth.fetch(`/api/v1/screening/${t}/persist`, {
        method: "POST",
      });
      if (!r.ok) {
        // Non-fatal — reveal still shown; user just doesn't get the prior seeded.
        return;
      }
      // F2b — mark the diagnostic as complete on the profile FSM.
      // Idempotent + non-fatal: even if the user is already past
      // EXAM_SELECTED the call no-ops; if the call fails we still let
      // the student see the reveal screen.
      try {
        await auth.fetch(`/api/v1/profile/me/diagnostic-complete`, {
          method: "POST",
        });
      } catch {
        /* swallow */
      }
    } catch {
      /* swallow */
    } finally {
      setPersisting(false);
    }
  }

  const progress = useMemo(() => {
    if (!current || !target) return 0;
    return Math.round((current.itemIdx / target) * 100);
  }, [current, target]);

  useEffect(() => {
    // Note: we don't auto-start — the intro screen explains the deal first.
  }, []);

  const backAction = (
    <Link to="/practice" className="vidya-shell__chip">
      ← Practice
    </Link>
  );

  if (phase === "intro") {
    return (
      <VidyaShell
        crumbs="PRACTICE · DIAGNOSTIC"
        title="Calibrate in 10 minutes"
        subtitle={`A quick ${target || "~12"}-question diagnostic spread across your exam's topics. We use the result to seed our IRT engine — so the very first practice session you run is already tuned to your level, not a generic θ=0 starting point. You can skip and start practising right away if you'd rather calibrate as you go.`}
        actions={backAction}
      >
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <h3 className="vidya-card-block__title">What's in the diagnostic</h3>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 1.7,
            }}
          >
            <li>
              ~12 questions, mixed difficulty, drawn from
              <strong> {examCode}</strong>'s topic blueprint.
            </li>
            <li>No time limit. Take it slow — accuracy matters more than speed.</li>
            <li>
              Result: a calibrated θ prior for adaptive sessions, plus
              a per-topic snapshot you can revisit any time.
            </li>
          </ul>
        </section>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <Link to="/practice" className="vidya-shell__chip">
            Skip — start practice
          </Link>
          <button
            type="button"
            className="vidya-shell__primary"
            onClick={startSession}
          >
            Start diagnostic →
          </button>
        </div>
      </VidyaShell>
    );
  }

  if (phase === "playing" && current) {
    return (
      <VidyaShell
        crumbs="PRACTICE · DIAGNOSTIC · IN PROGRESS"
        title={`Question ${current.itemIdx + 1} of ${current.total}`}
        subtitle="A short calibration test so the AI can target your weak spots."
        actions={backAction}
      >
        <div
          style={{
            marginBottom: "var(--sp-4)",
            height: 4,
            background: "var(--paper-2)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background:
                "linear-gradient(90deg, var(--gold), var(--info))",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: "var(--sp-3) var(--sp-4)",
              marginBottom: "var(--sp-4)",
              background: "var(--bad)",
              color: "var(--paper)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <section className="vidya-card-block">
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--ink)",
              margin: "0 0 18px",
            }}
          >
            {current.stem}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {current.choices.map((c, idx) => {
              const on = picked === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPicked(idx)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    background: on
                      ? "rgba(47,93,203,0.12)"
                      : "var(--paper-2)",
                    border: `1px solid ${on ? "var(--info)" : "var(--rule)"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    color: "var(--ink)",
                    fontSize: 14,
                    fontFamily: "inherit",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: on
                        ? "var(--info)"
                        : "var(--ink-3)",
                      minWidth: 18,
                    }}
                  >
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <span style={{ flex: 1 }}>{c}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="vidya-shell__primary"
            onClick={submitAnswer}
            disabled={picked === null || submitting}
          >
            {submitting
              ? "Submitting…"
              : current.itemIdx + 1 === current.total
                ? "Submit & reveal →"
                : "Next →"}
          </button>
        </div>
      </VidyaShell>
    );
  }

  if (phase === "reveal" && reveal) {
    return (
      <VidyaShell
        crumbs="PRACTICE · DIAGNOSTIC · DONE"
        title={`You're calibrated${persisting ? " — saving…" : " ✓"}`}
        subtitle="Adaptive sessions now start from your real level. You can revisit this score any time on your Profile page."
        actions={backAction}
      >
        <div className="vidya-grid-3">
          <section className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h3 className="vidya-card-block__title">Score</h3>
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--good)",
                lineHeight: 1.1,
              }}
            >
              {Math.round(reveal.scorePct)}%
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              {reveal.correct} of {reveal.total} correct
            </div>
          </section>
          <section className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h3 className="vidya-card-block__title">Readiness seed</h3>
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--info)",
                lineHeight: 1.1,
              }}
            >
              {reveal.readinessSeed.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              drives IRT prior
            </div>
          </section>
          <section className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h3 className="vidya-card-block__title">Topics tested</h3>
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--accent)",
                lineHeight: 1.1,
              }}
            >
              {reveal.topicBreakdown.length}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              across the blueprint
            </div>
          </section>
        </div>

        <div
          style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: "var(--sp-4)" }}
        >
          <button
            type="button"
            className="vidya-shell__primary"
            onClick={() => nav("/practice")}
          >
            Start practice →
          </button>
        </div>
      </VidyaShell>
    );
  }

  return (
    <VidyaShell
      crumbs="PRACTICE · DIAGNOSTIC"
      title="Diagnostic placement"
      subtitle="Something went wrong."
      actions={backAction}
    >
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "48px 24px",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 32 }}>⚠</div>
        <h2 style={{ margin: 0, fontSize: 18, color: "var(--ink)" }}>
          Something went wrong
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>{error}</p>
        <Link to="/practice" className="vidya-shell__primary">
          Back to practice
        </Link>
      </section>
    </VidyaShell>
  );
}
