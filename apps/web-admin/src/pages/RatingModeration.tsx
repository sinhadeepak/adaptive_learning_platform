// Sprint 20 (P3-S5) — Rating moderation UI.
//
// Admin pastes a tutor or course id, sees recent ratings, can hide each.
// Hidden ratings disappear from public aggregates immediately.

import { useState } from "react";

import { ratingModeration } from "../lib/api";

interface Rating {
  id: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  studentUserId: string;
}

export function RatingModeration() {
  const [kind, setKind] = useState<"session" | "course">("course");
  const [targetId, setTargetId] = useState("");
  const [aggregate, setAggregate] = useState<{
    averageStars: number;
    count: number;
    recent: Rating[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setAggregate(null);
    try {
      const data =
        kind === "course"
          ? await ratingModeration.listForCourse(targetId)
          : await ratingModeration.listForTutor(targetId);
      setAggregate({
        averageStars: data.averageStars,
        count: data.count,
        recent: data.recent,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function hide(r: Rating) {
    const reason = window.prompt(
      "Reason for hiding (logged to audit):",
      "Inappropriate content",
    );
    if (!reason) return;
    try {
      await ratingModeration.hide(kind, r.id, reason);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function unhide(r: Rating) {
    if (!confirm("Restore this rating to public visibility?")) return;
    try {
      await ratingModeration.unhide(kind, r.id);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 800 }}>
      <h1>Rating moderation</h1>
      <p style={{ color: "var(--ink-3)" }}>
        Hidden ratings are excluded from the public aggregate but kept in
        the database. The hide action is logged in the admin-actions
        audit table.
      </p>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>Lookup</legend>
        <label>
          Kind:{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value as "session" | "course")}>
            <option value="course">Course</option>
            <option value="session">Tutor session</option>
          </select>
        </label>{" "}
        <input
          type="text"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          placeholder={kind === "course" ? "Course UUID" : "Tutor user UUID"}
          style={{ width: 320 }}
        />{" "}
        <button type="button" onClick={load} disabled={!targetId}>
          Load ratings
        </button>
      </fieldset>

      {error && <p className="banner banner-error">{error}</p>}

      {aggregate && (
        <>
          <p>
            Aggregate: ⭐ {aggregate.averageStars.toFixed(2)} ({aggregate.count} visible)
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {aggregate.recent.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: 12,
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <strong>{"⭐".repeat(r.stars)}</strong>
                {r.comment && <p style={{ marginTop: 4 }}>{r.comment}</p>}
                <small style={{ color: "var(--ink-3)" }}>
                  by <code>{r.studentUserId.slice(0, 8)}…</code> ·{" "}
                  {new Date(r.createdAt).toLocaleString()}
                </small>
                <div style={{ marginTop: 8 }}>
                  <button type="button" onClick={() => hide(r)}>
                    Hide
                  </button>{" "}
                  <button type="button" onClick={() => unhide(r)}>
                    Unhide
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}