// RecoveryBanner — pending recovery proposal banner (P6 S57 UX-29).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S57
//
// Self-fetches /recovery/active on mount; renders nothing when no
// proposal is pending. Accept routes to /plan (where the catch-up
// payload now lives); Decline records the choice and hides the banner.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  acceptRecovery,
  declineRecovery,
  fetchActiveRecovery,
  type RecoveryProposal,
} from "../lib/recovery";

export function RecoveryBanner() {
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<RecoveryProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchActiveRecovery();
        if (cancelled) return;
        if (res.kind === "found") setProposal(res.proposal);
      } catch {
        /* swallow — banner is a soft surface */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden || !proposal) return null;

  async function handleAccept() {
    if (!proposal || busy) return;
    setBusy(true);
    setError(null);
    try {
      await acceptRecovery(proposal.id);
      navigate("/plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't accept recovery.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    if (!proposal || busy) return;
    setBusy(true);
    setError(null);
    try {
      await declineRecovery(proposal.id);
      setHidden(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't decline recovery.");
    } finally {
      setBusy(false);
    }
  }

  const missedCount = proposal.missedSessionIds.length;

  return (
    <section
      className="recovery-banner"
      role="status"
      aria-label="Recovery proposal"
    >
      <header className="recovery-head">
        <span className="recovery-glyph" aria-hidden>
          ↻
        </span>
        <div>
          <div className="recovery-eyebrow">Recovery mode</div>
          <h3 className="recovery-title">
            {missedCount} planned session{missedCount === 1 ? "" : "s"} missed —
            here's a catch-up
          </h3>
        </div>
      </header>
      <p className="recovery-rationale">{proposal.rationale}</p>
      <div className="recovery-meta">
        <span>~{proposal.expectedMinutes}m to catch up</span>
      </div>
      {error && (
        <div className="recovery-err" role="alert">
          {error}
        </div>
      )}
      <div className="recovery-actions">
        <button
          type="button"
          className="recovery-btn"
          onClick={handleDecline}
          disabled={busy}
        >
          Decline
        </button>
        <button
          type="button"
          className="recovery-btn recovery-btn-primary"
          onClick={handleAccept}
          disabled={busy}
        >
          {busy ? "Working…" : "Accept catch-up →"}
        </button>
      </div>
    </section>
  );
}
