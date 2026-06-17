import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  catalog,
  content,
  type CatalogExam,
  type CatalogSubject,
  type CatalogTopic,
  type Question,
} from "../lib/api";
import { useAuth, canAuthor, canReview } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows, type PillTone } from "../components/primitives";

type Scope = "mine" | "all";

const PAGE_SIZE = 25;

export function MyQuestions() {
  const { user } = useAuth();
  const isReviewer = canReview(user?.role);
  const [scope, setScope] = useState<Scope>("mine");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [page, setPage] = useState(0);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Catalog scope filters — cascading: pick exam → subjects load,
  // pick subject → topics load. Empty string means "any". The
  // backend accepts each independently.
  const [examId, setExamId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [topicId, setTopicId] = useState<string>("");
  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [topics, setTopics] = useState<CatalogTopic[]>([]);

  // Load exam list once on mount. Educators see only their assigned
  // exams (PLATFORM_ADMIN sees all) — same scope as the authoring flow.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await catalog.myExams();
        if (alive) setExams(list);
      } catch {
        /* swallow — filter just stays empty */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // When exam changes, reset subject/topic + reload subjects.
  useEffect(() => {
    setSubjectId("");
    setTopicId("");
    setSubjects([]);
    setTopics([]);
    if (!examId) return;
    let alive = true;
    (async () => {
      try {
        const list = await catalog.mySubjects(examId);
        if (alive) setSubjects(list);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      alive = false;
    };
  }, [examId]);

  // When subject changes, reset topic + reload topics.
  useEffect(() => {
    setTopicId("");
    setTopics([]);
    if (!subjectId) return;
    let alive = true;
    (async () => {
      try {
        const list = await catalog.topics(subjectId);
        if (alive) setTopics(list);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      alive = false;
    };
  }, [subjectId]);

  // refresh(): if `keepRowsWhilePending` is true, the existing list
  // stays on screen while the new fetch runs — avoids the "list
  // collapses, page scrolls to top" flash that happens whenever the
  // user submits a single question for review or pages forward.
  // First-mount and filter-changes still set null so the skeleton
  // shows.
  async function refresh(keepRowsWhilePending = false) {
    setError(null);
    if (!keepRowsWhilePending) setQuestions(null);
    try {
      const body = await content.listPaged({
        scope,
        type: typeFilter || undefined,
        q: search || undefined,
        examId: examId || undefined,
        subjectId: subjectId || undefined,
        topicId: topicId || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setQuestions(body.items);
      setTotal(body.total ?? body.items.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void refresh();
  }, [scope, typeFilter, search, page, examId, subjectId, topicId]);

  // Debounce: wait 350ms after the user stops typing before issuing
  // the search query — prevents a request per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // Reset pagination when any filter that changes the result set fires.
  useEffect(() => {
    setPage(0);
  }, [scope, typeFilter, examId, subjectId, topicId]);

  async function submitForReview(id: string) {
    setSubmittingId(id);
    try {
      const updated = await content.submit(id);
      // In-place patch: replace just the affected row in the existing
      // list, so the surrounding rows stay mounted, scroll position
      // is preserved, and the operator can keep working through a
      // long DRAFT review queue without re-finding their spot.
      setQuestions((prev) =>
        prev ? prev.map((q) => (q.id === id ? updated : q)) : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmittingId(null);
    }
  }

  // Bulk: submit every DRAFT visible on the current page in one go.
  // Throttled to 5 in-flight so a 25-row page doesn't slam the API.
  // Each row uses the same in-place patch as the single submit so
  // scroll position is preserved.
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  async function submitAllDrafts() {
    if (!questions) return;
    const drafts = questions.filter((q) => q.status === "DRAFT");
    if (drafts.length === 0) return;
    setBulkSubmitting(true);
    setError(null);
    const queue = drafts.map((q) => q.id);
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const id = queue[cursor++];
        try {
          const updated = await content.submit(id);
          setQuestions((prev) =>
            prev ? prev.map((q) => (q.id === id ? updated : q)) : prev,
          );
        } catch {
          /* swallow per-row; aggregate count shown in chips */
        }
      }
    }
    await Promise.all(Array.from({ length: 5 }, worker));
    setBulkSubmitting(false);
  }

  // Server filters now (type, search, pagination), so the UI just
  // surfaces what the backend returned. Status counts here describe
  // the current page only — kept in the chips for at-a-glance feedback.
  const counts = questions
    ? {
        draft: questions.filter((q) => q.status === "DRAFT").length,
        review: questions.filter((q) => q.status === "REVIEW").length,
        published: questions.filter((q) => q.status === "PUBLISHED").length,
        rejected: questions.filter((q) => q.status === "REJECTED").length,
      }
    : null;

  // Static catalogue of all 28 declared types (24 active + 4 gated)
  // so the type filter offers the full menu instead of only what
  // happened to land on the current page.
  const TYPE_OPTIONS_STATIC = [
    "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
    "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
    "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
    "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
    "ESSAY", "DESCRIPTIVE_LONG", "CASE_STUDY", "COMPREHENSION_LONG",
    "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
    "LISTENING_COMP", "VIDEO_QUESTION",
    "KBC_LIFELINE", "TIMED_REVEAL", "ADAPTIVE_DIFFICULTY",
  ];

  const filtered = questions;

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
          <div style={{ display: "flex", gap: 8 }}>
            {counts && counts.draft > 0 && (
              <button
                type="button"
                onClick={() => void submitAllDrafts()}
                disabled={bulkSubmitting}
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: 13 }}
                title="Submit every DRAFT on this page for review (throttled to 5 in parallel)"
              >
                {bulkSubmitting
                  ? "Submitting…"
                  : `Submit ${counts.draft} draft${counts.draft === 1 ? "" : "s"} →`}
              </button>
            )}
            <Link to="/questions/new" className="btn btn-primary">
              + New question
            </Link>
          </div>
        ) : null
      }
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {isReviewer && (
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
        )}

        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search question stems…"
          aria-label="Search question stems"
          style={{
            flex: 1,
            minWidth: 220,
            padding: "8px 12px",
            background: "var(--paper-2)",
            color: "var(--ink)",
            border: "1px solid var(--rule-2)",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "inherit",
          }}
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by question type"
          style={{
            padding: "8px 10px",
            background: "var(--paper-2)",
            color: "var(--ink)",
            border: "1px solid var(--rule-2)",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <option value="">All types</option>
          {TYPE_OPTIONS_STATIC.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
          aria-label="Filter by exam"
          style={selectStyle}
        >
          <option value="">All exams</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          aria-label="Filter by subject"
          disabled={!examId || subjects.length === 0}
          style={{
            ...selectStyle,
            opacity: !examId ? 0.5 : 1,
          }}
        >
          <option value="">{examId ? "All subjects" : "Pick an exam first"}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          aria-label="Filter by topic"
          disabled={!subjectId || topics.length === 0}
          style={{
            ...selectStyle,
            opacity: !subjectId ? 0.5 : 1,
          }}
        >
          <option value="">
            {subjectId ? "All topics" : "Pick a subject first"}
          </option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>

        {(examId || subjectId || topicId || typeFilter || search) && (
          <button
            type="button"
            onClick={() => {
              setExamId("");
              setSubjectId("");
              setTopicId("");
              setTypeFilter("");
              setSearchInput("");
            }}
            className="btn btn-ghost"
            style={{ padding: "6px 10px", fontSize: 12 }}
          >
            Clear filters
          </button>
        )}

        <span
          style={{
            color: "var(--ink-4, #7A8BAD)",
            fontSize: 12,
            marginLeft: 4,
          }}
        >
          {total.toLocaleString()} match{total === 1 ? "" : "es"}
        </span>
      </div>

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
                      <span style={{ color: "var(--ink-4, #7A8BAD)", marginRight: 6 }}>
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
                      <span style={{ color: "var(--ink-4, #7A8BAD)" }}>·</span>
                      <span>type: {q.questionType ?? "MCQ_SINGLE"}</span>
                      <span style={{ color: "var(--ink-4, #7A8BAD)" }}>·</span>
                      <span>lang: {q.language?.toUpperCase()}</span>
                      <span style={{ color: "var(--ink-4, #7A8BAD)" }}>·</span>
                      <span>diff b={q.difficultyB.toFixed(2)}</span>
                      <span style={{ color: "var(--ink-4, #7A8BAD)" }}>·</span>
                      <span>{q.choices.length} choices</span>
                      {q.reviewNotes ? (
                        <span style={{ color: "var(--bad)" }}>
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

      {questions !== null && total > PAGE_SIZE && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 16,
            color: "var(--ink-2, #B8C5E0)",
            fontSize: 13,
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Prev
          </button>
          <span>
            Page <strong>{page + 1}</strong> of{" "}
            <strong>{Math.max(1, Math.ceil(total / PAGE_SIZE))}</strong>{" "}
            <span style={{ color: "var(--ink-4, #7A8BAD)" }}>
              · showing {page * PAGE_SIZE + 1}–
              {Math.min(total, (page + 1) * PAGE_SIZE)} of{" "}
              {total.toLocaleString()}
            </span>
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * PAGE_SIZE >= total}
          >
            Next →
          </button>
        </div>
      )}
    </AppShell>
  );
}

const selectStyle = {
  padding: "8px 10px",
  background: "var(--paper-2)",
  color: "var(--ink)",
  border: "1px solid var(--rule-2)",
  borderRadius: 6,
  fontSize: 13,
  maxWidth: 200,
} as const;

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
        background: "var(--paper-2, #0C1422)",
        borderTop: "1px solid var(--rule, rgba(255,255,255,.07))",
        fontSize: 13,
        color: "var(--ink-2, #B8C5E0)",
      }}
    >
      {error && <Banner tone="danger">{error}</Banner>}
      {!detail && !error && <p style={{ opacity: 0.7 }}>Loading…</p>}
      {detail && (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <strong style={{ color: "var(--ink, #EEF2FF)" }}>Stem</strong>
            <p style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{detail.stem}</p>
          </div>

          {detail.choices.length > 1 && (
            <div>
              <strong style={{ color: "var(--ink, #EEF2FF)" }}>
                Choices
              </strong>
              <ol style={{ marginTop: 4, paddingLeft: 20 }}>
                {detail.choices.map((c, i) => (
                  <li
                    key={i}
                    style={{
                      color:
                        i === detail.correctIdx
                          ? "var(--good, #10C47A)"
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
              <strong style={{ color: "var(--ink, #EEF2FF)" }}>
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
              borderTop: "1px solid var(--rule, rgba(255,255,255,.07))",
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
          color: "var(--ink-4, #7A8BAD)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: mono ? "var(--font-mono, monospace)" : "inherit",
          color: "var(--ink, #EEF2FF)",
          fontSize: mono ? 11 : 13,
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}