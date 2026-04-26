import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../lib/api";
import { useAuth } from "../../lib/auth-provider";
import { OnboardingShell } from "./OnboardingShell";
import { Banner, SkeletonRows } from "../../components/dashboard";

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
      if (user)
        setUser({
          ...user,
          onboardingState: profile.user.onboardingState as typeof user.onboardingState,
        });
      navigate("/onboarding/language", { replace: true });
    } catch {
      setError("We couldn't save your selection. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      step={1}
      title="Which exam are you preparing for?"
      description="Pick one to get started. You can add more later."
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {exams === null ? (
        <SkeletonRows count={4} />
      ) : exams.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No exams available yet.</p>
      ) : (
        <div role="radiogroup" aria-label="Exam" className="option-list">
          {exams.map((exam) => {
            const isSelected = selected === exam.id;
            return (
              <button
                key={exam.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(exam.id)}
                className={`option-card ${isSelected ? "option-card-selected" : ""}`.trim()}
              >
                <div className="option-card-head">
                  <span className="option-card-title">{exam.name}</span>
                  {isSelected ? <span className="option-check">✓</span> : null}
                </div>
                {exam.subtitle ? <p className="option-card-sub">{exam.subtitle}</p> : null}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: "var(--sp-5)" }}
        disabled={!selected || submitting}
        onClick={onContinue}
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
    </OnboardingShell>
  );
}
