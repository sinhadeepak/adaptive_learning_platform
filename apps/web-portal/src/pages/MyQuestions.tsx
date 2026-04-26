import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { content, type Question } from "../lib/api";
import { useAuth, canAuthor } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows, type PillTone } from "../components/primitives";

export function MyQuestions() {
  const { user } = useAuth();
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

  const counts = questions
    ? {
        draft: questions.filter((q) => q.status === "DRAFT").length,
        review: questions.filter((q) => q.status === "REVIEW").length,
        published: questions.filter((q) => q.status === "PUBLISHED").length,
        rejected: questions.filter((q) => q.status === "REJECTED").length,
      }
    : null;

  return (
    <AppShell
      title="My questions"
      chips={
        counts
          ? [
              { label: `${counts.draft} draft` },
              { label: `${counts.review} in review` },
              { label: `${counts.published} published` },
            ]
          : []
      }
      actions={
        canAuthor(user?.role) ? (
          <Link to="/questions/new" className="btn btn-primary">
            + New question
          </Link>
        ) : null
      }
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {questions === null ? (
        <SkeletonRows count={3} />
      ) : questions.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">No questions yet</div>
          <p>
            You haven't authored any questions.{" "}
            {canAuthor(user?.role) ? (
              <Link to="/questions/new">Start a draft.</Link>
            ) : (
              "Authoring is open to TEACHER and above."
            )}
          </p>
        </div>
      ) : (
        <ul className="row-list">
          {questions.map((q) => (
            <li key={q.id} className="row-link" style={{ cursor: "default" }}>
              <div className="row-link-body">
                <p className="row-link-title">{q.stem.slice(0, 120)}{q.stem.length > 120 ? "…" : ""}</p>
                <p className="row-link-meta">
                  {new Date(q.createdAt).toLocaleDateString()}
                  {q.reviewNotes ? (
                    <span style={{ color: "var(--color-red)" }}> · {q.reviewNotes}</span>
                  ) : null}
                </p>
              </div>
              <div className="row-link-trail">
                <StatusPill status={q.status} />
                {q.status === "DRAFT" ? (
                  <button
                    type="button"
                    onClick={() => void submitForReview(q.id)}
                    disabled={submittingId === q.id}
                    className="btn btn-ghost"
                  >
                    {submittingId === q.id ? "Submitting…" : "Submit for review"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

const STATUS_TONE: Record<Question["status"], PillTone> = {
  DRAFT: "muted",
  REVIEW: "warning",
  PUBLISHED: "success",
  REJECTED: "danger",
  RETIRED: "muted",
};

export function StatusPill({ status }: { status: Question["status"] }) {
  return <Pill tone={STATUS_TONE[status]}>{status}</Pill>;
}
