// F6 — Curated Tests review queue (admin/moderator).
// URL: /curated/review
//
// Lists pending curated blueprints. Approve flips them to PUBLIC +
// PUBLISHED; Reject sets status='RETIRED'.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Curated tests — review queue</h1>
          <p style={{ marginTop: 4, color: "var(--ink-3)", fontSize: 13 }}>
            Approve to publish to the student Library, or reject to send
            back to the author.
          </p>
        </div>
        <Link to="/curated/new" style={{ fontSize: 13 }}>
          New test →
        </Link>
      </div>

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
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--rule)" }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Shape</th>
              <th style={{ padding: 8 }}>Marking</th>
              <th style={{ padding: 8 }}>Submitted</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                <td style={{ padding: 8 }}>
                  <div style={{ fontWeight: 600 }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {it.sections.length} section{it.sections.length === 1 ? "" : "s"} —{" "}
                    {it.sections.map((s) => `${s.n_questions}Q ${s.difficulty_band}`).join(" · ")}
                  </div>
                </td>
                <td style={{ padding: 8, fontSize: 13 }}>
                  {it.totalQuestions} Q · {it.totalMinutes} min
                </td>
                <td style={{ padding: 8, fontSize: 13 }}>
                  +{it.marksCorrect} / −{it.marksNegative}
                </td>
                <td style={{ padding: 8, fontSize: 12, color: "var(--ink-3)" }}>
                  {it.createdAt ? new Date(it.createdAt).toLocaleString() : "?"}
                </td>
                <td style={{ padding: 8 }}>
                  <button
                    type="button"
                    onClick={() => act(it.id, "approve")}
                    disabled={busy === it.id + ":approve"}
                    style={{ padding: "4px 10px", background: "var(--good)", color: "#fff", borderRadius: 6, marginRight: 6 }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => act(it.id, "reject")}
                    disabled={busy === it.id + ":reject"}
                    style={{ padding: "4px 10px", background: "var(--bad)", color: "#fff", borderRadius: 6 }}
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
  );
}