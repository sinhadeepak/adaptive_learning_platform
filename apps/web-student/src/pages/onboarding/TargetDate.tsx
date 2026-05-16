import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../lib/api";
import { OnboardingShell } from "./OnboardingShell";
import { Banner } from "../../components/dashboard";

interface ProfileExam {
  examId: string;
  targetDate: string | null;
}

interface ProfileResponse {
  exams: ProfileExam[];
}

function todayPlus(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function TargetDate() {
  const navigate = useNavigate();
  const [examId, setExamId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/profile/me");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const profile = (await res.json()) as ProfileResponse;
        const first = profile.exams[0];
        if (first) {
          setExamId(first.examId);
          if (first.targetDate) setDate(first.targetDate);
        }
      } catch {
        setError("We couldn't load your exam. Go back and pick one.");
      }
    })();
  }, []);

  const daysRemaining = useMemo(() => {
    if (!date) return null;
    const target = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, [date]);

  // F2b — Resolve the next onboarding step from the routing endpoint.
  // Institutional tenants with `require_onboarding_diagnostic = true`
  // route through /onboarding/diagnostic before /onboarding/daily-goal;
  // consumer users skip straight to the goal step.
  async function nextOnboardingPath(): Promise<string> {
    try {
      const r = await auth.fetch("/api/v1/profile/me/onboarding-routing");
      if (!r.ok) return "/onboarding/daily-goal";
      const body = (await r.json()) as { requiresDiagnostic: boolean };
      return body.requiresDiagnostic
        ? "/onboarding/diagnostic"
        : "/onboarding/daily-goal";
    } catch {
      return "/onboarding/daily-goal";
    }
  }

  async function onContinue(skip: boolean) {
    setError(null);
    if (skip) {
      const next = await nextOnboardingPath();
      return navigate(next, { replace: true });
    }
    if (!examId) {
      setError("No exam selected — go back to step 1.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await auth.fetch(`/api/v1/profile/exams/${examId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetDate: date }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = await nextOnboardingPath();
      navigate(next, { replace: true });
    } catch {
      setError("We couldn't save your target date. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      step={3}
      title="When is your exam?"
      description="We'll build a study plan that ramps up toward this date."
      backTo="/onboarding/language"
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      <label className="form-field">
        <span className="form-label">Target date</span>
        <input
          type="date"
          value={date}
          min={todayPlus(0)}
          onChange={(e) => setDate(e.target.value)}
          className="form-input"
        />
      </label>

      <div className="preset-row">
        {[3, 6, 9, 12].map((months) => {
          const isSelected = date === todayPlus(months);
          return (
            <button
              key={months}
              type="button"
              onClick={() => setDate(todayPlus(months))}
              className={`preset-chip ${isSelected ? "preset-chip-selected" : ""}`.trim()}
            >
              {months} mos
            </button>
          );
        })}
      </div>

      {daysRemaining !== null ? (
        <p
          aria-live="polite"
          style={{
            fontSize: 13,
            color: "var(--ink-2)",
            margin: "var(--sp-3) 0 0",
          }}
        >
          {daysRemaining > 0
            ? `Days remaining: ${daysRemaining}`
            : "That's in the past — pick a future date."}
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: "var(--sp-5)" }}
        disabled={!date || submitting || (daysRemaining !== null && daysRemaining < 0)}
        onClick={() => onContinue(false)}
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginTop: "var(--sp-2)" }}
        disabled={submitting}
        onClick={() => onContinue(true)}
      >
        Not sure yet
      </button>
    </OnboardingShell>
  );
}