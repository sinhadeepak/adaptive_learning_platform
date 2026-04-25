import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, tokens } from "@alp/design-system";
import { auth } from "../../lib/api";
import { useAuth } from "../../lib/auth-provider";
import { OnboardingShell } from "./OnboardingShell";

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
  iconKey?: string | null;
}

export function ExamSelect() {
  const navigate = useNavigate();
  const { setUser, user } = useAuth();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/catalog/exams");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setExams((await res.json()) as Exam[]);
      } catch {
        setError("We couldn't load the exam list. Try again.");
      }
    })();
  }, []);

  async function onContinue() {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await auth.fetch("/api/v1/profile/exams", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ examId: selected }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const profile = (await res.json()) as { user: { onboardingState: string } };
      if (user) setUser({ ...user, onboardingState: profile.user.onboardingState as typeof user.onboardingState });
      navigate("/onboarding/language", { replace: true });
    } catch {
      setError("We couldn't save your selection. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell step={1} title="Which exam are you preparing for?" description="Pick one to get started. You can add more later.">
      {error ? (
        <div role="alert" style={styles.errorBanner}>
          <Badge tone="danger">Error</Badge>
          <span>{error}</span>
        </div>
      ) : null}

      {exams === null ? (
        <ExamSkeleton />
      ) : exams.length === 0 ? (
        <p style={{ color: tokens.colors.text.muted }}>No exams available yet.</p>
      ) : (
        <div role="radiogroup" aria-labelledby="exam-q" style={styles.list}>
          {exams.map((exam) => {
            const isSelected = selected === exam.id;
            return (
              <button
                key={exam.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(exam.id)}
                style={cardStyle(isSelected)}
              >
                <div style={styles.cardHead}>
                  <span style={styles.examName}>{exam.name}</span>
                  {isSelected ? <span style={styles.checkMark}>✓</span> : null}
                </div>
                {exam.subtitle ? <p style={styles.examSubtitle}>{exam.subtitle}</p> : null}
              </button>
            );
          })}
        </div>
      )}

      <Button
        size="lg"
        disabled={!selected || submitting}
        isLoading={submitting}
        onClick={onContinue}
        style={{ width: "100%", marginTop: tokens.spacing[5] }}
      >
        Continue
      </Button>
    </OnboardingShell>
  );
}

function ExamSkeleton() {
  return (
    <div style={styles.list}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ ...cardStyle(false), height: 64, opacity: 0.5 }} />
      ))}
    </div>
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
  examName: { fontSize: tokens.typography.scale.subheading.size, fontWeight: tokens.typography.scale.subheading.weight },
  examSubtitle: {
    margin: `${tokens.spacing[1]}px 0 0 0`,
    fontSize: tokens.typography.scale.hint.size,
    color: tokens.colors.text.secondary,
  },
  checkMark: {
    color: tokens.colors.brand.primary,
    fontSize: 18,
    fontWeight: 600,
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
