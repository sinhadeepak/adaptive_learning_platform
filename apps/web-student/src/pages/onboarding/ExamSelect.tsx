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

interface PoolMember {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

interface SubjectPool {
  id: string;
  examId: string;
  code: string;
  name: string;
  description?: string | null;
  pickMin: number;
  pickMax: number;
  members: PoolMember[];
}

export function ExamSelect() {
  const navigate = useNavigate();
  const { setUser, user } = useAuth();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Phase 7 — pool picks. After the user clicks an exam, we fetch its
  // pools; if any exist, we reveal the picker step before allowing
  // Continue. Empty array means "no pools, skip to continue".
  const [pools, setPools] = useState<SubjectPool[] | null>(null);
  const [poolPicks, setPoolPicks] = useState<Record<string, string[]>>({});
  const [loadingPools, setLoadingPools] = useState(false);

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

  // Whenever the exam selection changes, (re)load its pools.
  useEffect(() => {
    setPools(null);
    setPoolPicks({});
    if (!selected) return;
    let alive = true;
    setLoadingPools(true);
    (async () => {
      try {
        const res = await auth.fetch(
          `/api/v1/catalog/exams/${encodeURIComponent(selected)}/pools`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()) as SubjectPool[];
        if (alive) setPools(list);
      } catch {
        if (alive) setPools([]);
      } finally {
        if (alive) setLoadingPools(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected]);

  function togglePick(pool: SubjectPool, memberId: string) {
    setPoolPicks((prev) => {
      const current = prev[pool.code] ?? [];
      const has = current.includes(memberId);
      let next: string[];
      if (has) {
        next = current.filter((m) => m !== memberId);
      } else if (current.length < pool.pickMax) {
        next = [...current, memberId];
      } else if (pool.pickMax === 1) {
        // Single-pick pool — replace.
        next = [memberId];
      } else {
        return prev; // at cap, no-op
      }
      return { ...prev, [pool.code]: next };
    });
  }

  // All pool constraints satisfied?
  const poolsValid =
    pools === null ||
    pools.every((p) => {
      const picked = poolPicks[p.code]?.length ?? 0;
      return picked >= p.pickMin && picked <= p.pickMax;
    });

  async function onContinue() {
    if (!selected || !poolsValid) return;
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

      // If pools exist, persist the picks via PATCH.
      if (pools && pools.length > 0) {
        const patchRes = await auth.fetch(
          `/api/v1/profile/exams/${encodeURIComponent(selected)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ options: poolPicks }),
          },
        );
        if (!patchRes.ok) throw new Error(`HTTP ${patchRes.status}`);
      }

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
        <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No exams available yet.</p>
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

      {/* Pool picker — revealed once an exam is selected and its
          /pools call returns non-empty. Each pool is a "pick N of M"
          group: UPSC Mains qualifying paper (pick 1 of 22 Indian
          languages), UPSC optional subject (pick 1 of 26), CBSE 11
          stream (pick 3 of 5), etc. */}
      {selected && loadingPools && (
        <p style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 16 }}>
          Loading exam structure…
        </p>
      )}
      {selected && pools && pools.length > 0 && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Pick your optional subjects
          </div>
          {pools.map((pool) => {
            const picked = poolPicks[pool.code] ?? [];
            const valid = picked.length >= pool.pickMin && picked.length <= pool.pickMax;
            const constraint =
              pool.pickMin === pool.pickMax
                ? `Pick ${pool.pickMin} of ${pool.members.length}`
                : `Pick ${pool.pickMin}–${pool.pickMax} of ${pool.members.length}`;
            return (
              <div
                key={pool.id}
                style={{
                  padding: 14,
                  background: "var(--card)",
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{pool.name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: valid ? "var(--good)" : "var(--ink-3)",
                    }}
                  >
                    {picked.length} / {pool.pickMax}
                    {valid ? " ✓" : ""}
                  </span>
                </div>
                {pool.description && (
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8 }}>
                    {pool.description}
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginBottom: 8 }}>
                  {constraint}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 6,
                  }}
                >
                  {pool.members.map((m) => {
                    const isOn = picked.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => togglePick(pool, m.id)}
                        style={{
                          padding: "8px 10px",
                          background: isOn ? "var(--info)" : "var(--paper-2)",
                          color: isOn ? "#fff" : "var(--ink)",
                          border: `1px solid ${isOn ? "var(--info)" : "var(--rule-2)"}`,
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12,
                          textAlign: "left",
                          appearance: "none",
                          WebkitAppearance: "none",
                        }}
                        aria-pressed={isOn}
                        title={m.description ?? m.name}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: "var(--sp-5)" }}
        disabled={!selected || submitting || !poolsValid}
        onClick={onContinue}
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
    </OnboardingShell>
  );
}