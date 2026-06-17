// Sprint 17 (P3-S2) — Tutor moderation queue.
//
// Lists tutors awaiting platform-admin approval (KYC_VERIFIED state).
// Admin clicks Approve → tutor flips to APPROVED. Reject opens a small
// form for the rejection reason.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AdminShell } from "../components/AdminShell";
import { Banner, SkeletonRows } from "../components/primitives";
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
    <AdminShell
      crumbs="Quality · Tutor moderation"
      title="Tutor moderation"
      subtitle="Tutors who have completed KYC and are awaiting platform-admin approval. Decisions are logged to the audit table per ADR-0007."
    >
      {error && <Banner tone="danger">{error}</Banner>}
      {items === null && !error && <SkeletonRows count={4} />}
      {items !== null && items.length === 0 && (
        <Banner tone="info">The queue is empty — no tutors awaiting approval.</Banner>
      )}

      {items !== null && items.length > 0 && (
        <table className="data-table">
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
              <tr key={t.userId} style={{ borderTop: "1px solid var(--rule)" }}>
                <td>
                  <strong>{t.displayName}</strong>
                  <br />
                  <small style={{ color: "var(--ink-3)" }}>{t.headline}</small>
                  <br />
                  <Link to={`/tutors-admin/${t.userId}`}>View audit</Link>
                </td>
                <td>{paiseToRupees(t.hourlyRatePaise)}/hr</td>
                <td>{new Date(t.appliedAt).toLocaleDateString()}</td>
                <td>
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
    </AdminShell>
  );
}
