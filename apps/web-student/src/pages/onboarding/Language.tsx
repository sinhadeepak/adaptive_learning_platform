import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../lib/api";
import { OnboardingShell } from "./OnboardingShell";
import { Banner } from "../../components/dashboard";

type Language = "en" | "hi" | "hinglish";

const OPTIONS: Array<{ id: Language; label: string; sub: string; lang?: string }> = [
  { id: "en", label: "English", sub: "Default. All content available." },
  { id: "hi", label: "हिन्दी", sub: "Hindi content rolls out from Sprint 2.", lang: "hi" },
  { id: "hinglish", label: "Hinglish", sub: "Type either; we understand both." },
];

export function Language() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Language>("en");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onContinue(skip = false) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await auth.fetch("/api/v1/profile/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: skip ? "en" : selected }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      navigate("/onboarding/target-date", { replace: true });
    } catch {
      setError("We couldn't save your preference. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      step={2}
      title="What language do you want to learn in?"
      description="You can switch any time from settings."
      backTo="/onboarding/exam"
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      <div role="radiogroup" aria-label="Language" className="option-list">
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(opt.id)}
              className={`option-card ${isSelected ? "option-card-selected" : ""}`.trim()}
            >
              <div className="option-card-head">
                <span className="option-card-title" lang={opt.lang}>
                  {opt.label}
                </span>
                {isSelected ? <span className="option-check">✓</span> : null}
              </div>
              <p className="option-card-sub">{opt.sub}</p>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: "var(--sp-5)" }}
        disabled={submitting}
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
        Skip (defaults to English)
      </button>
    </OnboardingShell>
  );
}
