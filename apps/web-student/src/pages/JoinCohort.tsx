// Sprint 11 S11-A — Cohort invite landing.
//
// Reachable from a shared link `/join/:token`. The student lands here,
// confirms they want to join the cohort, and we POST the claim. On
// success we redirect to /assignments where they'll see whatever the
// educator has already published.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
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
      <AppShell title="Join Cohort">
        <main className="page" style={{ padding: 24 }}>
          <p>Missing invite token in the URL.</p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell title="Join Cohort">
      <main className="page" style={{ padding: 24, maxWidth: 480 }}>
        <h1>Join your class</h1>
        {phase === "confirm" && (
          <>
            <p>
              Your educator has invited you to join their class on the
              platform. Tap to confirm — your assignments will appear right
              after.
            </p>
            <button className="btn-primary" onClick={claim} disabled={!user}>
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
          <p className="banner banner-success">
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
            <p className="banner banner-error">
              {error || "Could not redeem invite."}
            </p>
            <button className="btn-secondary" onClick={() => setPhase("confirm")}>
              Try again
            </button>
          </>
        )}
      </main>
    </AppShell>
  );
}
