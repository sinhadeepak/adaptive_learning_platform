import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { content, type Question } from "../lib/api";
import { useAuth, canAuthor, canReview } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows, type PillTone } from "../components/primitives";

type Scope = "mine" | "all";

export function MyQuestions() {
  const { user } = useAuth();
  const isReviewer = canReview(user?.role);
  const [scope, setScope] = useState<Scope>("mine");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setQuestions(null);
    try {
      const list = scope === "all" ? await content.listAll() : await content.listMine();
      setQuestions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void refresh();
  }, [scope]);

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

  const filtered = questions
    ? typeFilter
      ? questions.filter((q) => q.questionType === typeFilter)
      : questions
    : null;

  const counts = filtered
    ? {
        draft: filtered.filter((q) => q.status === "DRAFT").length,
        review: filtered.filter((q) => q.status === "REVIEW").length,
        published: filtered.filter((q) => q.status === "PUBLISHED").length,
        rejected: filtered.filter((q) => q.status === "REJECTED").length,
      }
    : null;

  // Distinct question_type values present in the loaded list — drives
  // the type-filter dropdown so it only offers types the operator can
  // actually click into. Sorted alphabetically.
  const typeOptions = questions
    ? Array.from(
        new Set(
          questions
            .map((q) => q.questionType)
            .filter((t): t is string => !!t),
        ),
      ).sort()
    : [];

  return (
    <AppShell
      title={scope === "all" ? "Question bank" : "My questions"}
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

      {isReviewer && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div role="tablist" style={{ display: "inline-flex", gap: 4 }}>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "mine"}
              onClick={() => setScope("mine")}
              className={scope === "mine" ? "btn btn-primary" : "btn btn-ghost"}
              style={{ padding: "6px 14px" }}
            >
              Mine
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "all"}
              onClick={() => setScope("all")}
              className={scope === "all" ? "btn btn-primary" : "btn btn-ghost"}
              style={{ padding: "6px 14px" }}
            >
              All authors
            </button>
          </div>
          {scope === "all" && typeOptions.length > 1 && (
            <>
              <span style={{ color: "var(--text-faint, #7A8BAD)", fontSize: 12 }}>
                Filter by type:
              </span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  padding: "6px 10px",
                  background: "var(--bg-surface3)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <option value="">All types ({questions?.length ?? 0})</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t} (
                    {questions?.filter((q) => q.questionType === t).length ?? 0}
                    )
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {questions === null ? (
        <SkeletonRows count={3} />
      ) : (filtered ?? []).length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">
            {scope === "all"
              ? typeFilter
                ? `No ${typeFilter} questions found.`
                : "No questions found."
              : "No questions yet"}
          </div>
          <p>
            {scope === "all" ? (
              "Try a different filter, or seed the bank via 'make seed-upsc'."
            ) : (
              <>
                You haven't authored any questions.{" "}
                {canAuthor(user?.role) ? (
                  <Link to="/questions/new">Start a draft.</Link>
                ) : (
                  "Authoring is open to TEACHER and above."
                )}
              </>
            )}
          </p>
        </div>
      ) : (
        <ul className="row-list">
          {(filtered ?? []).map((q) => (
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
                {q.questionType && q.questionType !== "MCQ_SINGLE" && (
                  <Pill tone="info">{q.questionType}</Pill>
                )}
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
