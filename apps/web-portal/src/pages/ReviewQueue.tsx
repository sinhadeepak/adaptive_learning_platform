import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { content, type Question } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/primitives";
import { StatusPill } from "./MyQuestions";

export function ReviewQueue() {
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
    <AppShell
      title="Review queue"
      chips={items ? [{ label: `${items.length} pending` }] : []}
      actions={
        <Link to="/questions" className="btn btn-ghost">
          ← My questions
        </Link>
      }
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {items === null ? (
        <SkeletonRows count={2} />
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">All clear</div>
          <p>Nothing in review right now. Approved questions land in the catalog.</p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((q) => (
            <li key={q.id} className="card review-card">
              <header className="review-card-header">
                <h2 className="review-card-stem">{q.stem}</h2>
                <StatusPill status={q.status} />
              </header>

              <ol className="review-choices">
                {q.choices.map((c, i) => (
                  <li
                    key={i}
                    className={`review-choice ${i === q.correctIdx ? "review-choice-correct" : ""}`}
                  >
                    <span className="quiz-choice-letter">{String.fromCharCode(65 + i)}</span>
                    <span className="quiz-choice-text">{c}</span>
                    {i === q.correctIdx ? (
                      <span style={{ color: "var(--color-green)", fontWeight: 600, fontSize: 11 }}>
                        ✓ correct
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>

              <p className="row-link-meta">
                Author <code>{q.createdBy.slice(0, 8)}…</code> · b={q.difficultyB.toFixed(2)} ·{" "}
                {q.language.toUpperCase()}
              </p>

              <textarea
                placeholder="Optional review notes (shown to the author if rejected)"
                rows={2}
                value={notesById[q.id] ?? ""}
                onChange={(e) =>
                  setNotesById((cur) => ({ ...cur, [q.id]: e.target.value }))
                }
                className="form-input"
                style={{ marginTop: "var(--sp-3)" }}
              />

              <div style={{ display: "flex", gap: 8, marginTop: "var(--sp-3)" }}>
                <button
                  type="button"
                  onClick={() => void decide(q.id, true)}
                  disabled={actingId === q.id}
                  className="btn btn-primary"
                >
                  {actingId === q.id ? "Working…" : "Approve & publish"}
                </button>
                <button
                  type="button"
                  onClick={() => void decide(q.id, false)}
                  disabled={actingId === q.id}
                  className="btn btn-ghost"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
