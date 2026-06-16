// Sprint 17 (P3-S2) — Per-tutor admin audit log.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AdminShell } from "../components/AdminShell";
import { Banner, SkeletonRows } from "../components/primitives";
import { type TutorAdminAction, marketplaceAdmin } from "../lib/api";

export function TutorAdminActions() {
  const { userId } = useParams<{ userId: string }>();
  const [actions, setActions] = useState<TutorAdminAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    marketplaceAdmin
      .actions(userId)
      .then(setActions)
      .catch((e) => setError((e as Error).message));
  }, [userId]);

  return (
    <AdminShell
      crumbs="Quality · Tutor moderation"
      title={
        <>
          Tutor audit · <code>{userId?.slice(0, 8)}…</code>
        </>
      }
      actions={
        <Link to="/tutors-admin" className="btn btn-ghost">
          ← Back to queue
        </Link>
      }
    >
      {error && <Banner tone="danger">{error}</Banner>}
      {actions === null && !error && <SkeletonRows count={3} />}
      {actions !== null && actions.length === 0 && (
        <Banner tone="info">No admin actions logged for this tutor.</Banner>
      )}

      {actions !== null && actions.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {actions.map((a) => (
            <li
              key={a.id}
              style={{
                padding: 12,
                border: "1px solid var(--rule)",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{a.action}</strong>
                <small style={{ color: "var(--ink-3)" }}>
                  {new Date(a.createdAt).toLocaleString()}
                </small>
              </div>
              {a.reason && <p style={{ marginTop: 4 }}>{a.reason}</p>}
              <small style={{ color: "var(--ink-3)" }}>
                by admin <code>{a.adminUserId.slice(0, 8)}…</code>
              </small>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
