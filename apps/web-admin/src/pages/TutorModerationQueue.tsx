// Sprint 17 (P3-S2) — Tutor moderation queue.
//
// Lists tutors awaiting platform-admin approval (KYC_VERIFIED state).
// Admin clicks Approve → tutor flips to APPROVED. Reject opens a small
// form for the rejection reason.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type TutorQueueItem, marketplaceAdmin } from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

export function TutorModerationQueue() {
  const [items, setItems] = useState<TutorQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    setError(null);
    marketplaceAdmin
      .queue()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(refresh, []);

  async function approve(userId: string) {
    setBusyId(userId);
    try {
      await marketplaceAdmin.approve(userId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(userId: string) {
    const reason = window.prompt(
      "Rejection reason (will be persisted to the audit log):",
    );
    if (!reason) return;
    setBusyId(userId);
    try {
      await marketplaceAdmin.reject(userId, reason);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 960 }}>
      <h1>Tutor moderation queue</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Tutors who have completed KYC and are awaiting platform-admin
        approval. Decisions are logged to the audit table per ADR-0007.
      </p>

      {error && <p className="banner banner-error">{error}</p>}
      {items === null && !error && <p>Loading…</p>}
      {items !== null && items.length === 0 && (
        <p>The queue is empty — no tutors awaiting approval.</p>
      )}

      {items !== null && items.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Tutor</th>
              <th align="left">Rate</th>
              <th align="left">Applied</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.userId} style={{ borderTop: "1px solid var(--border-faint)" }}>
                <td style={{ padding: "8px 4px" }}>
                  <strong>{t.displayName}</strong>
                  <br />
                  <small style={{ color: "var(--text-muted)" }}>{t.headline}</small>
                  <br />
                  <Link to={`/tutors-admin/${t.userId}`}>View audit</Link>
                </td>
                <td style={{ padding: "8px 4px" }}>{paiseToRupees(t.hourlyRatePaise)}/hr</td>
                <td style={{ padding: "8px 4px" }}>
                  {new Date(t.appliedAt).toLocaleDateString()}
                </td>
                <td style={{ padding: "8px 4px" }}>
                  <button
                    type="button"
                    disabled={busyId === t.userId}
                    onClick={() => approve(t.userId)}
                    className="btn-primary"
                  >
                    Approve
                  </button>{" "}
                  <button
                    type="button"
                    disabled={busyId === t.userId}
                    onClick={() => reject(t.userId)}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
