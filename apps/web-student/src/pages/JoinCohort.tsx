// JoinCohort — Vidya v1 redesign.
//
// Sprint 11 S11-A — Cohort invite landing.
//
// Reachable from a shared link `/join/:token`. The student lands here,
// confirms they want to join the cohort, and we POST the claim. On
// success we redirect to /assignments where they'll see whatever the
// educator has already published.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
import { useAuth } from "../lib/auth-provider";
import { api } from "../lib/api";

type Phase = "confirm" | "claiming" | "joined" | "error";

export function JoinCohort() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [cohortId, setCohortId] = useState<string | null>(null);

  // Auto-redirect once joined to give the user a moment to read the toast.
  useEffect(() => {
    if (phase !== "joined") return;
    const t = window.setTimeout(() => navigate("/assignments"), 1200);
    return () => window.clearTimeout(t);
  }, [phase, navigate]);

  async function claim() {
    if (!token || !user) return;
    setPhase("claiming");
    setError(null);
    try {
      const result = await api.post<{ cohortId: string }>(
        `/institution/cohorts/invites/${encodeURIComponent(token)}/claim`,
        { userId: user.id },
      );
      setCohortId(result.cohortId);
      setPhase("joined");
    } catch (err) {
      setError((err as Error).message || "Could not claim invite");
      setPhase("error");
    }
  }

  if (!token) {
    return (
      <VidyaShell
        crumbs="JOIN COHORT"
        title="Join cohort"
        subtitle="Missing invite token."
      >
        <main style={{ maxWidth: 480 }}>
          <p>Missing invite token in the URL.</p>
        </main>
      </VidyaShell>
    );
  }

  const subtitle = cohortId
    ? `Cohort ${cohortId.slice(0, 8)}… — your educator has invited you to join their class.`
    : "Your educator has invited you to join their class on the platform.";

  return (
    <VidyaShell
      crumbs="JOIN COHORT"
      title="Join cohort"
      subtitle={subtitle}
    >
      <main style={{ maxWidth: 480 }}>
        <h1 style={{ marginTop: 0 }}>Join your class</h1>
        {phase === "confirm" && (
          <>
            <p>
              Your educator has invited you to join their class on the
              platform. Tap to confirm — your assignments will appear right
              after.
            </p>
            <button
              type="button"
              className="vidya-shell__chip vidya-shell__chip--on"
              onClick={claim}
              disabled={!user}
            >
              Join cohort
            </button>
            {!user && (
              <p className="hint">
                You need to be logged in. <a href="/login">Sign in</a> first.
              </p>
            )}
          </>
        )}
        {phase === "claiming" && <p>Joining…</p>}
        {phase === "joined" && (
          <p
            role="status"
            style={{
              padding: "var(--sp-3) var(--sp-4)",
              background: "var(--good-soft, var(--good))",
              color: "var(--paper)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            You're in! Redirecting to your assignments…
            {cohortId && (
              <span className="hint" style={{ display: "block" }}>
                Cohort: <code>{cohortId.slice(0, 8)}…</code>
              </span>
            )}
          </p>
        )}
        {phase === "error" && (
          <>
            <p
              role="alert"
              style={{
                padding: "var(--sp-3) var(--sp-4)",
                background: "var(--bad)",
                color: "var(--paper)",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {error || "Could not redeem invite."}
            </p>
            <button
              type="button"
              className="vidya-shell__chip"
              onClick={() => setPhase("confirm")}
            >
              Try again
            </button>
          </>
        )}
      </main>
    </VidyaShell>
  );
}
