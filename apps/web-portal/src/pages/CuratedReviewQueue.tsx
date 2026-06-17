// F6 — Curated Tests review queue (admin/moderator).
// URL: /curated/review
//
// Lists pending curated blueprints. Approve flips them to PUBLIC +
// PUBLISHED; Reject sets status='RETIRED'.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { auth } from "../lib/api";

interface PendingItem {
  id: string;
  name: string;
  examId: string;
  totalQuestions: number;
  totalMinutes: number;
  marksCorrect: number;
  marksNegative: number;
  sections: Array<{ section_id: string; name: string; n_questions: number; n_minutes: number; difficulty_band: string }>;
  createdAt: string | null;
  createdByUserId: string | null;
}

export function CuratedReviewQueue() {
  const [items, setItems] = useState<PendingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/curated/pending`);
      if (r.status === 403) {
        setError("You don't have permission to view this queue.");
        setItems([]);
        return;
      }
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        return;
      }
      const body = (await r.json()) as { items: PendingItem[] };
      setItems(body.items);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, verb: "approve" | "reject") {
    setBusy(id + ":" + verb);
    try {
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/curated/${id}/${verb}`, {
        method: "POST",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body?.detail?.message ?? `HTTP ${r.status}`);
        return;
      }
      await load();
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell
      title="Curated tests — review queue"
      subtitle="Approve to publish to the student Library, or reject to send back to the author."
      actions={
        <Link to="/curated/new" className="btn btn-ghost">
          New test →
        </Link>
      }
    >
      <div className="dash-section" style={{ maxWidth: 1080 }}>
        {error && (
          <div style={{ padding: 12, marginBottom: 12, background: "var(--bad-soft-soft)", color: "var(--bad)", borderRadius: 8 }}>
            {error}
          </div>
        )}

        {items === null && <div>Loading…</div>}
        {items !== null && items.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", border: "1px dashed var(--rule)", borderRadius: 8, color: "var(--ink-3)" }}>
            No tests pending review. 🎉
          </div>
        )}
        {items !== null && items.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Shape</th>
                <th>Marking</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {it.sections.length} section{it.sections.length === 1 ? "" : "s"} —{" "}
                      {it.sections.map((s) => `${s.n_questions}Q ${s.difficulty_band}`).join(" · ")}
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {it.totalQuestions} Q · {it.totalMinutes} min
                  </td>
                  <td style={{ fontSize: 13 }}>
                    +{it.marksCorrect} / −{it.marksNegative}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {it.createdAt ? new Date(it.createdAt).toLocaleString() : "?"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => act(it.id, "approve")}
                      disabled={busy === it.id + ":approve"}
                      className="btn btn-primary"
                      style={{ marginRight: 6 }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => act(it.id, "reject")}
                      disabled={busy === it.id + ":reject"}
                      className="btn btn-ghost"
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}