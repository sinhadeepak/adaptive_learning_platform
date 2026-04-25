import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { content, type Question } from "../lib/api";
import { useAuth, canAuthor, canReview } from "../lib/auth-provider";

export function MyQuestions() {
  const { user, logout } = useAuth();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      setQuestions(await content.listMine());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submitForReview(id: string) {
    setSubmittingId(id);
    try {
      await content.submit(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <main style={{ maxWidth: 920, margin: "2rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>My questions</h1>
        <nav style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14 }}>
          <span style={{ color: "#666" }}>
            {user?.firstName} ({user?.role})
          </span>
          {canAuthor(user?.role) && <Link to="/questions/new">+ New question</Link>}
          {canReview(user?.role) && <Link to="/review">Review queue</Link>}
          <button onClick={() => void logout()} style={{ fontSize: 13 }}>
            Sign out
          </button>
        </nav>
      </header>

      {!canAuthor(user?.role) && (
        <p style={{ color: "#a51c30", fontSize: 14 }}>
          Your role ({user?.role}) can't author content. Authoring is open to TEACHER and above.
        </p>
      )}

      {error && (
        <div role="alert" style={{ color: "#a51c30", fontSize: 13, margin: "1rem 0" }}>
          {error}
        </div>
      )}

      {questions === null ? (
        <p>Loading…</p>
      ) : questions.length === 0 ? (
        <p style={{ color: "#666" }}>
          You haven't authored any questions yet.{" "}
          {canAuthor(user?.role) && <Link to="/questions/new">Start a draft.</Link>}
        </p>
      ) : (
        <table style={{ width: "100%", marginTop: 16, fontSize: 14, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "8px 4px" }}>Stem</th>
              <th style={{ padding: "8px 4px" }}>Status</th>
              <th style={{ padding: "8px 4px" }}>Created</th>
              <th style={{ padding: "8px 4px" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 4px" }}>{q.stem.slice(0, 80)}</td>
                <td style={{ padding: "8px 4px" }}>
                  <StatusBadge status={q.status} />
                </td>
                <td style={{ padding: "8px 4px", color: "#666" }}>
                  {new Date(q.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: "8px 4px" }}>
                  {q.status === "DRAFT" && (
                    <button
                      onClick={() => void submitForReview(q.id)}
                      disabled={submittingId === q.id}
                    >
                      {submittingId === q.id ? "Submitting…" : "Submit for review"}
                    </button>
                  )}
                  {q.status === "REJECTED" && q.reviewNotes && (
                    <span style={{ color: "#a51c30" }}>{q.reviewNotes}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

export function StatusBadge({ status }: { status: Question["status"] }) {
  const tone: Record<Question["status"], string> = {
    DRAFT: "#888",
    REVIEW: "#7a5e00",
    PUBLISHED: "#2a7a2a",
    REJECTED: "#a51c30",
    RETIRED: "#888",
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 10,
        background: "#f3f3f3",
        color: tone[status],
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}
