// F2b — In-onboarding diagnostic step.
//
// Wraps the screening flow inside the onboarding chrome. Rendered as a
// 5th step (between Target and Goal) when the user's tenant has
// `require_onboarding_diagnostic = true` — set via the educator portal
// at /tenant/settings.
//
// Consumer users typically reach this screen only if they navigate
// directly; for them the lazy modal on /practice (F2a) is the primary
// surface. Both paths share the same backend: /screening/* + the
// /profile/me/diagnostic-complete FSM advance.

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import "@alp/design-system/shell.css";

import { auth } from "../../lib/api";
import { Banner } from "../../components/dashboard";

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
}

type Phase = "intro" | "playing" | "reveal" | "error";

const STEPS = ["Exam", "Language", "Target", "Calibrate", "Goal"] as const;

export function Diagnostic() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const examCode = params.get("exam") ?? "JEE-MAIN";

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [current, setCurrent] = useState<NextResponse | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reveal, setReveal] = useState<RevealResponse | null>(null);

  async function start() {
    setError(null);
    try {
      const r = await auth.fetch(`/api/v1/screening/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exam_code: examCode, language: "en" }),
      });
      if (!r.ok) {
        setError(
          r.status === 503
            ? "Not enough published questions to seed this diagnostic. Skip for now."
            : `Couldn't start diagnostic (HTTP ${r.status}).`,
        );
        setPhase("error");
        return;
      }
      const body = (await r.json()) as { token: string };
      setToken(body.token);
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
      };
      setReveal({
        scorePct: body.score_pct,
        correct: body.correct,
        total: body.total,
        readinessSeed: body.readiness_seed,
      });
      setPhase("reveal");
      // Persist + advance FSM (idempotent).
      try {
        await auth.fetch(`/api/v1/screening/${t}/persist`, { method: "POST" });
        await auth.fetch(`/api/v1/profile/me/diagnostic-complete`, {
          method: "POST",
        });
      } catch {
        /* swallow */
      }
    } catch {
      setError("Network error revealing score.");
      setPhase("error");
    }
  }

  function continueToGoal() {
    nav("/onboarding/daily-goal", { replace: true });
  }

  const stepIdx = 4; // 4-of-5 — "Calibrate"

  return (
    <div className="auth-page">
      <main className="auth-card">
        <Link to="/onboarding/target-date" className="auth-back" aria-label="Back">
          ‹ Back
        </Link>

        {/* Five-step stepper (mirrors OnboardingShell's design but with
            the inserted Calibrate step). */}
        <div
          className="stepper"
          aria-label={`Step ${stepIdx} of ${STEPS.length}`}
        >
          {STEPS.map((label, i) => {
            const idx = i + 1;
            const state: "complete" | "active" | "pending" =
              idx < stepIdx ? "complete" : idx === stepIdx ? "active" : "pending";
            const dotClass =
              state === "complete"
                ? "stepper-dot stepper-dot-complete"
                : state === "active"
                  ? "stepper-dot stepper-dot-active"
                  : "stepper-dot";
            return (
              <div key={label} className="stepper-row">
                <div
                  className={dotClass}
                  aria-current={state === "active" ? "step" : undefined}
                >
                  {state === "complete" ? "✓" : idx}
                </div>
                {i < STEPS.length - 1 ? (
                  <div
                    className={`stepper-connector ${idx < stepIdx ? "stepper-connector-complete" : ""}`.trim()}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="stepper-caption">
          Step {stepIdx} of {STEPS.length} — {STEPS[stepIdx - 1]}
        </p>

        {phase === "intro" && (
          <>
            <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
              Quick calibration
            </h1>
            <p className="page-subhead">
              Your institution has enabled a 10-minute diagnostic so your
              practice plan starts at the right level. About 12 questions
              spanning your exam.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={start}
              style={{ marginTop: "var(--sp-4)" }}
            >
              Start diagnostic →
            </button>
          </>
        )}

        {phase === "playing" && current && (
          <>
            <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
              Q{current.itemIdx + 1} of {current.total}
            </h1>
            <div
              style={{
                height: 4,
                background: "var(--bg-surface3)",
                borderRadius: 2,
                overflow: "hidden",
                margin: "8px 0 16px",
              }}
            >
              <div
                style={{
                  width: `${Math.round((current.itemIdx / current.total) * 100)}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, var(--color-ai), var(--color-blue))",
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {error && <Banner tone="danger">{error}</Banner>}

            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: "var(--text-primary)",
                margin: "0 0 14px",
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
                        : "var(--bg-surface3)",
                      border: `1px solid ${on ? "var(--color-blue)" : "var(--border)"}`,
                      borderRadius: 6,
                      cursor: "pointer",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      fontFamily: "inherit",
                      display: "flex",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: on
                          ? "var(--color-blue)"
                          : "var(--text-muted)",
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

            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: "var(--sp-4)" }}
              disabled={picked === null || submitting}
              onClick={submitAnswer}
            >
              {submitting
                ? "Submitting…"
                : current.itemIdx + 1 === current.total
                  ? "Submit & reveal →"
                  : "Next →"}
            </button>
          </>
        )}

        {phase === "reveal" && reveal && (
          <>
            <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
              You're calibrated ✓
            </h1>
            <p className="page-subhead">
              {Math.round(reveal.scorePct)}% on the diagnostic. The adaptive
              engine will start sessions at your real level.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: "var(--sp-4)" }}
              onClick={continueToGoal}
            >
              Continue to daily goal →
            </button>
          </>
        )}

        {phase === "error" && (
          <>
            <h1 className="page-greeting">Couldn't run the diagnostic</h1>
            <p className="page-subhead">
              {error ?? "Something went wrong. You can continue without it."}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: "var(--sp-4)" }}
              onClick={continueToGoal}
            >
              Continue without diagnostic →
            </button>
          </>
        )}
      </main>
    </div>
  );
}
