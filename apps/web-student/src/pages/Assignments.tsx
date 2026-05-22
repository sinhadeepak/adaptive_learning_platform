// Assignments — Vidya v1 redesign.
//
// Sprint 9 F-1 — Student Assignments inbox.
//
// Renders the list returned by GET /content/assignments?mine=true.
// Each row links to /assignments/{id} for the detail view.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
import {
  formatDueAt,
  listMyAssignments,
  progressBucket,
  type Assignment,
} from "../lib/assignments";

const bucketStyle: Record<
  ReturnType<typeof progressBucket>,
  { label: string; className: string }
> = {
  completed: { label: "Completed", className: "pill-success" },
  overdue: { label: "Overdue", className: "pill-danger" },
  "due-soon": { label: "Due soon", className: "pill-warn" },
  open: { label: "Open", className: "pill-neutral" },
};

export function Assignments() {
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyAssignments()
      .then((rows) => !cancelled && setItems(rows))
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <VidyaShell
      crumbs="LEARN · ASSIGNMENTS"
      title="Assignments"
      subtitle="Tasks set by your tutors and clans."
    >
      <main className="assignments-page">
        {error && (
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
            {error}
          </p>
        )}
        {items === null && <p>Loading…</p>}
        {items !== null && items.length === 0 && (
          <p className="empty-state">
            No assignments yet — your educator will post here when they're ready.
          </p>
        )}
        {items !== null && items.length > 0 && (
          <ul className="assignments-list">
            {items.map((a) => {
              const bucket = progressBucket(a);
              const meta = bucketStyle[bucket];
              return (
                <li key={a.id} className="assignment-row">
                  <Link to={`/assignments/${a.id}`} className="assignment-link">
                    <div className="assignment-head">
                      <span className="assignment-title">{a.title}</span>
                      <span className={`pill ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    {a.description && (
                      <p className="assignment-desc">{a.description}</p>
                    )}
                    <div className="assignment-meta">
                      {formatDueAt(a) && <span>{formatDueAt(a)}</span>}
                      {a.myCompletedAt &&
                        a.myTotalCount != null &&
                        a.myCorrectCount != null && (
                          <span>
                            Score: {a.myCorrectCount}/{a.myTotalCount}
                          </span>
                        )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </VidyaShell>
  );
}
