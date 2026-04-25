import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Input, tokens } from "@alp/design-system";
import { auth } from "../../lib/api";
import { OnboardingShell } from "./OnboardingShell";

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

  // Fetch the user's primary exam from profile.
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

  async function onContinue(skip: boolean) {
    setError(null);
    if (skip) return navigate("/onboarding/daily-goal", { replace: true });
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
      navigate("/onboarding/daily-goal", { replace: true });
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
        <div role="alert" style={styles.errorBanner}>
          <Badge tone="danger">Error</Badge>
          <span>{error}</span>
        </div>
      ) : null}

      <Input
        label="Target date"
        type="date"
        value={date}
        min={todayPlus(0)}
        onChange={(e) => setDate(e.target.value)}
      />

      <div style={styles.presetRow}>
        {[3, 6, 9, 12].map((months) => (
          <button
            key={months}
            type="button"
            onClick={() => setDate(todayPlus(months))}
            style={presetStyle(date === todayPlus(months))}
          >
            {months} mos
          </button>
        ))}
      </div>

      {daysRemaining !== null ? (
        <p style={styles.daysRemaining} aria-live="polite">
          {daysRemaining > 0 ? `Days remaining: ${daysRemaining}` : "That's in the past — pick a future date."}
        </p>
      ) : null}

      <Button
        size="lg"
        isLoading={submitting}
        disabled={!date || submitting || (daysRemaining !== null && daysRemaining < 0)}
        onClick={() => onContinue(false)}
        style={{ width: "100%", marginTop: tokens.spacing[5] }}
      >
        Continue
      </Button>
      <Button
        variant="ghost"
        size="lg"
        disabled={submitting}
        onClick={() => onContinue(true)}
        style={{ width: "100%", marginTop: tokens.spacing[2] }}
      >
        Not sure yet
      </Button>
    </OnboardingShell>
  );
}

function presetStyle(selected: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: `${tokens.spacing[2]}px ${tokens.spacing[3]}px`,
    border: `1px solid ${selected ? tokens.colors.brand.primary : tokens.colors.border.default}`,
    borderRadius: tokens.radius.button,
    background: selected ? tokens.colors.brand.tint : tokens.colors.surface.primary,
    color: selected ? tokens.colors.brand.primary : tokens.colors.text.secondary,
    fontFamily: tokens.typography.family.ui,
    fontSize: tokens.typography.scale.body.size,
    cursor: "pointer",
  };
}

const styles: Record<string, React.CSSProperties> = {
  presetRow: { display: "flex", gap: tokens.spacing[2], marginTop: tokens.spacing[3] },
  daysRemaining: {
    fontSize: tokens.typography.scale.body.size,
    color: tokens.colors.text.secondary,
    margin: `${tokens.spacing[3]}px 0 0 0`,
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.danger.bg,
    color: tokens.colors.semantic.danger.fg,
    marginBottom: tokens.spacing[4],
    fontSize: tokens.typography.scale.body.size,
  },
};
