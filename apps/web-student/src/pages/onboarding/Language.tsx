import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, tokens } from "@alp/design-system";
import { auth } from "../../lib/api";
import { OnboardingShell } from "./OnboardingShell";

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
        <div role="alert" style={styles.errorBanner}>
          <Badge tone="danger">Error</Badge>
          <span>{error}</span>
        </div>
      ) : null}

      <div role="radiogroup" aria-label="Language" style={styles.list}>
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(opt.id)}
              style={cardStyle(isSelected)}
            >
              <div style={styles.cardHead}>
                <span style={styles.label} lang={opt.lang}>{opt.label}</span>
                {isSelected ? <span style={styles.checkMark}>✓</span> : null}
              </div>
              <p style={styles.sub}>{opt.sub}</p>
            </button>
          );
        })}
      </div>

      <Button size="lg" isLoading={submitting} onClick={() => onContinue(false)} style={{ width: "100%", marginTop: tokens.spacing[5] }}>
        Continue
      </Button>
      <Button variant="ghost" size="lg" disabled={submitting} onClick={() => onContinue(true)} style={{ width: "100%", marginTop: tokens.spacing[2] }}>
        Skip (defaults to English)
      </Button>
    </OnboardingShell>
  );
}

function cardStyle(selected: boolean): React.CSSProperties {
  return {
    width: "100%",
    textAlign: "left",
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
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: tokens.typography.scale.subheading.size, fontWeight: tokens.typography.scale.subheading.weight },
  sub: { margin: `${tokens.spacing[1]}px 0 0 0`, fontSize: tokens.typography.scale.hint.size, color: tokens.colors.text.secondary },
  checkMark: { color: tokens.colors.brand.primary, fontSize: 18, fontWeight: 600 },
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
