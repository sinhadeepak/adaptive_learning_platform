import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../lib/api";
import { useAuth } from "../../lib/auth-provider";
import { OnboardingShell } from "./OnboardingShell";
import { Banner } from "../../components/dashboard";

const OPTIONS = [
  { minutes: 15, label: "Chill — 15 min/day" },
  { minutes: 30, label: "Regular — 30 min/day" },
  { minutes: 60, label: "Serious — 60 min/day" },
  { minutes: 120, label: "Intense — 120 min/day" },
] as const;

export function DailyGoal() {
  const navigate = useNavigate();
  const { setUser, user } = useAuth();
  const [selected, setSelected] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onStart() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await auth.fetch("/api/v1/profile/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dailyGoalMinutes: selected }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const profile = (await res.json()) as { user: { onboardingState: string } };
      if (user)
        setUser({
          ...user,
          onboardingState: profile.user.onboardingState as typeof user.onboardingState,
        });
      navigate("/home", { replace: true });
    } catch {
      setError("We couldn't save your goal. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      step={4}
      title="Set your daily goal"
      description="Consistency beats intensity. Pick a goal you can stick to."
      backTo="/onboarding/target-date"
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      <div role="radiogroup" aria-label="Daily goal" className="option-list">
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.minutes;
          return (
            <button
              key={opt.minutes}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(opt.minutes)}
              className={`option-card ${isSelected ? "option-card-selected" : ""}`.trim()}
            >
              <div className="option-card-head">
                <span className="option-card-title">{opt.label}</span>
                {isSelected ? <span className="option-check">✓</span> : null}
              </div>
            </button>
          );
        })}
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--ink-3)",
          margin: "var(--sp-3) 0 0",
          textAlign: "center",
        }}
      >
        You'll get a streak for hitting this 4 days/week.
      </p>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: "var(--sp-5)" }}
        disabled={submitting}
        onClick={onStart}
      >
        {submitting ? "Setting up…" : "Start learning"}
      </button>
    </OnboardingShell>
  );
}