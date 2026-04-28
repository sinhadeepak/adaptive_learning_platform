// Sprint 17 (P3-S2) — Per-tutor admin audit log.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

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
    <main className="page" style={{ padding: 24, maxWidth: 760 }}>
      <Link to="/tutors-admin">← Back to queue</Link>
      <h1>
        Tutor audit · <code>{userId?.slice(0, 8)}…</code>
      </h1>

      {error && <p className="banner banner-error">{error}</p>}
      {actions === null && !error && <p>Loading…</p>}
      {actions !== null && actions.length === 0 && (
        <p>No admin actions logged for this tutor.</p>
      )}

      {actions !== null && actions.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {actions.map((a) => (
            <li
              key={a.id}
              style={{
                padding: 12,
                border: "1px solid var(--border-faint)",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{a.action}</strong>
                <small style={{ color: "var(--text-muted)" }}>
                  {new Date(a.createdAt).toLocaleString()}
                </small>
              </div>
              {a.reason && <p style={{ marginTop: 4 }}>{a.reason}</p>}
              <small style={{ color: "var(--text-muted)" }}>
                by admin <code>{a.adminUserId.slice(0, 8)}…</code>
              </small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
