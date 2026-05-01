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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          {(filtered ?? []).map((q) => {
            const expanded = expandedId === q.id;
            return (
              <li
                key={q.id}
                className="row-link"
                style={{
                  cursor: "pointer",
                  display: "block",
                  padding: 0,
                }}
              >
                <div
                  onClick={() => setExpandedId(expanded ? null : q.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${expanded ? "Collapse" : "Expand"} question details`}
                  aria-expanded={expanded}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expanded ? null : q.id);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 16px",
                  }}
                >
                  <div className="row-link-body" style={{ flex: 1, minWidth: 0 }}>
                    <p className="row-link-title">
                      <span style={{ color: "var(--text-faint, #7A8BAD)", marginRight: 6 }}>
                        {expanded ? "▾" : "▸"}
                      </span>
                      {q.stem.slice(0, 120)}
                      {q.stem.length > 120 ? "…" : ""}
                    </p>
                    <p
                      className="row-link-meta"
                      style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                    >
                      <span>{new Date(q.createdAt).toLocaleDateString()}</span>
                      <span style={{ color: "var(--text-faint, #7A8BAD)" }}>·</span>
                      <span>type: {q.questionType ?? "MCQ_SINGLE"}</span>
                      <span style={{ color: "var(--text-faint, #7A8BAD)" }}>·</span>
                      <span>lang: {q.language?.toUpperCase()}</span>
                      <span style={{ color: "var(--text-faint, #7A8BAD)" }}>·</span>
                      <span>diff b={q.difficultyB.toFixed(2)}</span>
                      <span style={{ color: "var(--text-faint, #7A8BAD)" }}>·</span>
                      <span>{q.choices.length} choices</span>
                      {q.reviewNotes ? (
                        <span style={{ color: "var(--color-red)" }}>
                          · {q.reviewNotes}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div
                    className="row-link-trail"
                    style={{ display: "flex", gap: 6, alignItems: "center" }}
                    onClick={(e) => e.stopPropagation()}
                  >
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
                        {submittingId === q.id
                          ? "Submitting…"
                          : "Submit for review"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {expanded && <QuestionDetailPanel questionId={q.id} />}
              </li>
            );
          })}
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

// ─────────────────────────────────────────────────────────────────────
// QuestionDetailPanel — expanded view shown beneath a question row
// when the operator clicks. Lazily fetches the full QuestionDetail
// (which carries explanation, payload, ai_origin, etc. that the
// list endpoint omits) and renders a compact two-column read-only
// summary. Lives inside MyQuestions.tsx because it's the only call
// site; promote to its own component if more pages adopt it.
// ─────────────────────────────────────────────────────────────────────
function QuestionDetailPanel({ questionId }: { questionId: string }) {
  const [detail, setDetail] = useState<Question | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    (async () => {
      try {
        const q = await content.get(questionId);
        if (!cancelled) setDetail(q);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't load question.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  return (
    <div
      style={{
        padding: "12px 20px 16px 36px",
        background: "var(--bg-surface1, #0C1422)",
        borderTop: "1px solid var(--border, rgba(255,255,255,.07))",
        fontSize: 13,
        color: "var(--text-secondary, #B8C5E0)",
      }}
    >
      {error && <Banner tone="danger">{error}</Banner>}
      {!detail && !error && <p style={{ opacity: 0.7 }}>Loading…</p>}
      {detail && (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <strong style={{ color: "var(--text-primary, #EEF2FF)" }}>Stem</strong>
            <p style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{detail.stem}</p>
          </div>

          {detail.choices.length > 1 && (
            <div>
              <strong style={{ color: "var(--text-primary, #EEF2FF)" }}>
                Choices
              </strong>
              <ol style={{ marginTop: 4, paddingLeft: 20 }}>
                {detail.choices.map((c, i) => (
                  <li
                    key={i}
                    style={{
                      color:
                        i === detail.correctIdx
                          ? "var(--color-green, #10C47A)"
                          : "inherit",
                      fontWeight: i === detail.correctIdx ? 600 : 400,
                    }}
                  >
                    {c}
                    {i === detail.correctIdx && (
                      <span style={{ marginLeft: 8 }}>✓ correct</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {detail.explanation && (
            <div>
              <strong style={{ color: "var(--text-primary, #EEF2FF)" }}>
                Explanation
              </strong>
              <p style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                {detail.explanation}
              </p>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              fontSize: 12,
              borderTop: "1px solid var(--border, rgba(255,255,255,.07))",
              paddingTop: 10,
            }}
          >
            <Meta label="ID" value={detail.id} mono />
            <Meta label="Topic ID" value={detail.topicId} mono />
            <Meta label="Type" value={detail.questionType ?? "MCQ_SINGLE"} />
            <Meta label="Difficulty (b)" value={detail.difficultyB.toFixed(2)} />
            <Meta
              label="Discrimination (a)"
              value={detail.discriminationA.toFixed(2)}
            />
            <Meta label="Guessing (c)" value={detail.guessingC.toFixed(2)} />
            <Meta label="Language" value={detail.language.toUpperCase()} />
            <Meta label="Status" value={detail.status} />
            <Meta
              label="Created"
              value={new Date(detail.createdAt).toLocaleString()}
            />
            {detail.submittedAt && (
              <Meta
                label="Submitted"
                value={new Date(detail.submittedAt).toLocaleString()}
              />
            )}
            {detail.reviewedAt && (
              <Meta
                label="Reviewed"
                value={new Date(detail.reviewedAt).toLocaleString()}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "var(--text-faint, #7A8BAD)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: mono ? "var(--font-mono, monospace)" : "inherit",
          color: "var(--text-primary, #EEF2FF)",
          fontSize: mono ? 11 : 13,
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}
