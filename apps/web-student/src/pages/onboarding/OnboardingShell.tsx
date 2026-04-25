import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { tokens } from "@alp/design-system";

interface OnboardingShellProps {
  step: 1 | 2 | 3 | 4;
  title: string;
  description?: string;
  children: ReactNode;
  backTo?: string;
}

const STEPS = ["Exam", "Language", "Target", "Goal"] as const;

export function OnboardingShell({ step, title, description, children, backTo }: OnboardingShellProps) {
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {backTo ? (
          <Link to={backTo} style={styles.backLink} aria-label="Back">‹ Back</Link>
        ) : null}

        <div style={styles.stepper} aria-label={`Step ${step} of 4`}>
          {STEPS.map((label, i) => {
            const idx = (i + 1) as 1 | 2 | 3 | 4;
            const state: "complete" | "active" | "pending" =
              idx < step ? "complete" : idx === step ? "active" : "pending";
            return (
              <div key={label} style={styles.stepRow}>
                <div style={dotStyle(state)} aria-current={state === "active" ? "step" : undefined}>
                  {state === "complete" ? "✓" : idx}
                </div>
                {i < 3 ? <div style={connectorStyle(idx < step)} /> : null}
              </div>
            );
          })}
        </div>
        <p style={styles.stepCaption}>Step {step} of 4 — {STEPS[step - 1]}</p>

        <h1 style={styles.title}>{title}</h1>
        {description ? <p style={styles.description}>{description}</p> : null}

        {children}
      </div>
    </main>
  );
}

function dotStyle(state: "complete" | "active" | "pending"): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: tokens.typography.family.ui,
    flexShrink: 0,
  };
  if (state === "complete") {
    return { ...base, background: tokens.colors.semantic.success.bg, color: tokens.colors.semantic.success.fg };
  }
  if (state === "active") {
    return { ...base, background: tokens.colors.brand.primary, color: tokens.colors.surface.primary };
  }
  return { ...base, background: tokens.colors.surface.tertiary, color: tokens.colors.text.muted };
}

function connectorStyle(complete: boolean): React.CSSProperties {
  return {
    flex: 1,
    height: 2,
    background: complete ? tokens.colors.semantic.success.fg : tokens.colors.border.default,
    margin: `0 ${tokens.spacing[1]}px`,
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacing[4],
    background: tokens.colors.surface.secondary,
    fontFamily: tokens.typography.family.ui,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    background: tokens.colors.surface.primary,
    borderRadius: tokens.radius.card,
    border: `1px solid ${tokens.colors.border.default}`,
    padding: tokens.spacing[6],
  },
  backLink: {
    display: "inline-block",
    color: tokens.colors.text.secondary,
    textDecoration: "none",
    fontSize: tokens.typography.scale.body.size,
    marginBottom: tokens.spacing[3],
  },
  stepper: { display: "flex", alignItems: "center" },
  stepRow: { display: "flex", alignItems: "center", flex: 1 },
  stepCaption: {
    fontSize: tokens.typography.scale.hint.size,
    color: tokens.colors.text.muted,
    margin: `${tokens.spacing[2]}px 0 ${tokens.spacing[5]}px 0`,
  },
  title: {
    margin: 0,
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
  },
  description: {
    color: tokens.colors.text.secondary,
    fontSize: tokens.typography.scale.body.size,
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[5],
  },
};
