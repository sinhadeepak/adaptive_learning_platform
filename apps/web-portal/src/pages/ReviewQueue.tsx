import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { content, type Question } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { StatusBadge } from "./MyQuestions";

export function ReviewQueue() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  async function refresh() {
    setError(null);
    try {
      setItems(await content.listAll("REVIEW"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function decide(id: string, approve: boolean) {
    setActingId(id);
    try {
      await content.review(id, approve, notesById[id]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setActingId(null);
    }
  }

  return (
    <main style={{ maxWidth: 920, margin: "2rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>Review queue</h1>
        <nav style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14 }}>
          <span style={{ color: "#666" }}>
            {user?.firstName} ({user?.role})
          </span>
          <Link to="/questions">My questions</Link>
          <button onClick={() => void logout()} style={{ fontSize: 13 }}>
            Sign out
          </button>
        </nav>
      </header>

      {error && (
        <div role="alert" style={{ color: "#a51c30", fontSize: 13, margin: "1rem 0" }}>
          {error}
        </div>
      )}

      {items === null ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "#666" }}>Nothing in review right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
          {items.map((q) => (
            <li
              key={q.id}
              style={{ border: "1px solid #ddd", padding: 16, borderRadius: 6, marginBottom: 12 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 14 }}>{q.stem}</strong>
                <StatusBadge status={q.status} />
              </div>
              <ol type="A" style={{ marginTop: 8, fontSize: 14, paddingLeft: 18 }}>
                {q.choices.map((c, i) => (
                  <li
                    key={i}
                    style={{ color: i === q.correctIdx ? "#2a7a2a" : "#222", marginBottom: 4 }}
                  >
                    {c} {i === q.correctIdx && <strong>(correct)</strong>}
                  </li>
                ))}
              </ol>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Author: {q.createdBy.slice(0, 8)}… · Difficulty b={q.difficultyB.toFixed(2)} ·{" "}
                {q.language.toUpperCase()}
              </div>
              <textarea
                placeholder="Optional review notes (shown to the author if rejected)"
                rows={2}
                value={notesById[q.id] ?? ""}
                onChange={(e) =>
                  setNotesById((cur) => ({ ...cur, [q.id]: e.target.value }))
                }
                style={{ width: "100%", marginTop: 8, padding: 6, fontSize: 13 }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => void decide(q.id, true)}
                  disabled={actingId === q.id}
                  style={{ padding: "8px 12px", fontSize: 13 }}
                >
                  {actingId === q.id ? "…" : "Approve & Publish"}
                </button>
                <button
                  onClick={() => void decide(q.id, false)}
                  disabled={actingId === q.id}
                  style={{ padding: "8px 12px", fontSize: 13 }}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
