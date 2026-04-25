import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, tokens } from "@alp/design-system";
import { auth } from "../../lib/api";
import { useAuth } from "../../lib/auth-provider";
import { OnboardingShell } from "./OnboardingShell";

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
      if (user) setUser({ ...user, onboardingState: profile.user.onboardingState as typeof user.onboardingState });
      // Profile FSM: EXAM_SELECTED + dailyGoal → ONBOARDED
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
        <div role="alert" style={styles.errorBanner}>
          <Badge tone="danger">Error</Badge>
          <span>{error}</span>
        </div>
      ) : null}

      <div role="radiogroup" aria-label="Daily goal" style={styles.list}>
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.minutes;
          return (
            <button
              key={opt.minutes}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(opt.minutes)}
              style={cardStyle(isSelected)}
            >
              <span style={styles.label}>{opt.label}</span>
              {isSelected ? <span style={styles.checkMark}>✓</span> : null}
            </button>
          );
        })}
      </div>

      <p style={styles.note}>You'll get a streak for hitting this 4 days/week.</p>

      <Button size="lg" isLoading={submitting} onClick={onStart} style={{ width: "100%", marginTop: tokens.spacing[5] }}>
        {submitting ? "Setting up…" : "Start learning"}
      </Button>
    </OnboardingShell>
  );
}

function cardStyle(selected: boolean): React.CSSProperties {
  return {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacing[4],
    border: `${selected ? 2 : 1}px solid ${selected ? tokens.colors.brand.primary : tokens.colors.border.default}`,
    borderRadius: tokens.radius.card,
    background: selected ? tokens.colors.brand.tint : tokens.colors.surface.primary,
    cursor: "pointer",
    fontFamily: tokens.typography.family.ui,
    color: tokens.colors.text.primary,
  };
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: "flex", flexDirection: "column", gap: tokens.spacing[3] },
  label: { fontSize: tokens.typography.scale.subheading.size, fontWeight: tokens.typography.scale.subheading.weight },
  checkMark: { color: tokens.colors.brand.primary, fontSize: 18, fontWeight: 600 },
  note: {
    fontSize: tokens.typography.scale.hint.size,
    color: tokens.colors.text.muted,
    margin: `${tokens.spacing[3]}px 0 0 0`,
    textAlign: "center",
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
