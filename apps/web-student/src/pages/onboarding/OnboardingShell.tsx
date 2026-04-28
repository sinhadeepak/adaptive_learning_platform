import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "@alp/design-system/shell.css";

interface OnboardingShellProps {
  step: 1 | 2 | 3 | 4;
  title: string;
  description?: string;
  children: ReactNode;
  backTo?: string;
}

const STEPS = ["Exam", "Language", "Target", "Goal"] as const;

export function OnboardingShell({
  step,
  title,
  description,
  children,
  backTo,
}: OnboardingShellProps) {
  return (
    <div className="auth-page">
      <main className="auth-card">
        {backTo ? (
          <Link to={backTo} className="auth-back" aria-label="Back">
            ‹ Back
          </Link>
        ) : null}

        <div className="stepper" aria-label={`Step ${step} of 4`}>
          {STEPS.map((label, i) => {
            const idx = (i + 1) as 1 | 2 | 3 | 4;
            const state: "complete" | "active" | "pending" =
              idx < step ? "complete" : idx === step ? "active" : "pending";
            const dotClass =
              state === "complete"
                ? "stepper-dot stepper-dot-complete"
                : state === "active"
                  ? "stepper-dot stepper-dot-active"
                  : "stepper-dot";
            return (
              <div key={label} className="stepper-row">
                <div className={dotClass} aria-current={state === "active" ? "step" : undefined}>
                  {state === "complete" ? "✓" : idx}
                </div>
                {i < 3 ? (
                  <div
                    className={`stepper-connector ${idx < step ? "stepper-connector-complete" : ""}`.trim()}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="stepper-caption">
          Step {step} of 4 — {STEPS[step - 1]}
        </p>

        <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
          {title}
        </h1>
        {description ? <p className="page-subhead">{description}</p> : null}

        {children}
      </main>
    </div>
  );
}
