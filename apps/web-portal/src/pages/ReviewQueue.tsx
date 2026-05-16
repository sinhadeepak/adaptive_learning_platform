/**
 * ReviewQueue — full data-table approval surface.
 *
 * Per Phase-7 ask: a card-per-page review flow doesn't scale to a
 * 50-item bulk-AI batch. This implementation:
 *   - Lists pending REVIEW questions in a sortable / resizable /
 *     reorderable table with pagination.
 *   - Cascading Exam → Subject → Topic dropdown filters (server-side).
 *   - Stem-search across whatever's in the queue (debounced).
 *   - Per-row Approve button + checkbox for selection.
 *   - "Select all on page" + bulk Approve for the common 50-item case.
 *   - Detail modal opened by clicking a row's stem — shows full
 *     options, explanation, meta, and an inline Approve / Reject pair
 *     with a notes textarea (notes only used on reject today).
 *   - Self-authored questions filtered out client-side (the user
 *     can't approve their own).
 *   - Column order, widths, and page size persist to localStorage so
 *     reviewers' layout choices survive reloads.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";

import {
  catalog,
  content,
  type CatalogExam,
  type CatalogSubject,
  type CatalogTopic,
  type Question,
} from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/primitives";

// ── Types ────────────────────────────────────────────────────────────

type ColKey = "select" | "stem" | "type" | "lang" | "diff" | "author" | "actions";
type SortKey = "stem" | "type" | "diff" | "author" | "lang";

interface ColDef {
  key: ColKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  sortable: boolean;
  render: (q: Question, ctx: RenderCtx) => ReactNode;
  sortBy?: (q: Question) => string | number;
}

interface RenderCtx {
  selected: boolean;
  toggleSelect: () => void;
  onApprove: () => void;
  onOpen: () => void;
  acting: boolean;
}

const COLS: Record<ColKey, ColDef> = {
  select: {
    key: "select",
    label: "",
    defaultWidth: 40,
    minWidth: 36,
    sortable: false,
    render: (_q, ctx) => (
      <input
        type="checkbox"
        checked={ctx.selected}
        onChange={ctx.toggleSelect}
        aria-label="Select for bulk approve"
        onClick={(e) => e.stopPropagation()}
      />
    ),
  },
  stem: {
    key: "stem",
    label: "Question stem",
    defaultWidth: 520,
    minWidth: 200,
    sortable: true,
    sortBy: (q) => q.stem.toLowerCase(),
    render: (q, ctx) => (
      <button
        onClick={ctx.onOpen}
        style={{
          background: "transparent",
          border: 0,
          color: "var(--ink)",
          cursor: "pointer",
          fontSize: 13,
          padding: 0,
          textAlign: "left",
          width: "100%",
          appearance: "none",
        }}
        title="Click to view details"
      >
        {q.stem.length > 140 ? `${q.stem.slice(0, 140)}…` : q.stem}
      </button>
    ),
  },
  type: {
    key: "type",
    label: "Type",
    defaultWidth: 120,
    minWidth: 80,
    sortable: true,
    sortBy: (q) => q.questionType ?? "MCQ_SINGLE",
    render: (q) => (
      <code style={{ fontSize: 11, color: "var(--gold)" }}>
        {q.questionType ?? "MCQ_SINGLE"}
      </code>
    ),
  },
  lang: {
    key: "lang",
    label: "Lang",
    defaultWidth: 70,
    minWidth: 60,
    sortable: true,
    sortBy: (q) => q.language,
    render: (q) => (
      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {q.language.toUpperCase()}
      </span>
    ),
  },
  diff: {
    key: "diff",
    label: "Diff (b)",
    defaultWidth: 80,
    minWidth: 60,
    sortable: true,
    sortBy: (q) => q.difficultyB,
    render: (q) => (
      <span
        style={{
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          color: "var(--ink-2)",
        }}
      >
        {q.difficultyB.toFixed(2)}
      </span>
    ),
  },
  author: {
    key: "author",
    label: "Author",
    defaultWidth: 110,
    minWidth: 80,
    sortable: true,
    sortBy: (q) => q.createdBy,
    render: (q) => (
      <code style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {q.createdBy.slice(0, 8)}…
      </code>
    ),
  },
  actions: {
    key: "actions",
    label: "Actions",
    defaultWidth: 160,
    minWidth: 120,
    sortable: false,
    render: (_q, ctx) => (
      <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "4px 10px", fontSize: 11 }}
          onClick={ctx.onApprove}
          disabled={ctx.acting}
        >
          {ctx.acting ? "…" : "✓ Approve"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "4px 10px", fontSize: 11 }}
          onClick={ctx.onOpen}
        >
          View
        </button>
      </div>
    ),
  },
};

const DEFAULT_ORDER: ColKey[] = ["select", "stem", "type", "lang", "diff", "author", "actions"];
const STORAGE_KEY = "alp.review-queue.prefs";

interface PersistedPrefs {
  order?: ColKey[];
  widths?: Partial<Record<ColKey, number>>;
  pageSize?: number;
}

function loadPrefs(): PersistedPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedPrefs) : {};
  } catch {
    return {};
  }
}

function savePrefs(p: PersistedPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* localStorage unavailable */
  }
}

// ── Page ─────────────────────────────────────────────────────────────

export function ReviewQueue() {
  const { user } = useAuth();
  const initialPrefs = useMemo(() => loadPrefs(), []);

  // Persisted prefs.
  const [order, setOrder] = useState<ColKey[]>(
    initialPrefs.order && initialPrefs.order.every((k) => k in COLS)
      ? initialPrefs.order
      : DEFAULT_ORDER,
  );
  const [widths, setWidths] = useState<Partial<Record<ColKey, number>>>(
    initialPrefs.widths ?? {},
  );
  const [pageSize, setPageSize] = useState<number>(initialPrefs.pageSize ?? 25);

  // Volatile state.
  const [items, setItems] = useState<Question[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [bulkActing, setBulkActing] = useState(false);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("stem");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  // Cascading filters — all server-side.
  const [examId, setExamId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [topicId, setTopicId] = useState<string>("");
  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [topics, setTopics] = useState<CatalogTopic[]>([]);

  useEffect(() => {
    savePrefs({ order, widths, pageSize });
  }, [order, widths, pageSize]);

  // Debounced search (matches MyQuestions cadence).
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(0);
  }, [examId, subjectId, topicId]);

  // Cascading dropdown loaders.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await catalog.myExams();
        if (alive) setExams(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [examId]);

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
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [subjectId]);

  // Fetch the page of REVIEW items. Self-authored rows filter out
  // client-side; the backend list endpoint doesn't have a "not me"
  // toggle today.
  async function refresh() {
    setError(null);
    try {
      const body = await content.listPaged({
        scope: "all",
        status: "REVIEW",
        q: search || undefined,
        examId: examId || undefined,
        subjectId: subjectId || undefined,
        topicId: topicId || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      const filtered = user
        ? body.items.filter((q) => q.createdBy !== user.id)
        : body.items;
      setItems(filtered);
      setTotal(body.total ?? body.items.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, examId, subjectId, topicId, page, pageSize]);

  // Client-side sort. Server pagination means each page is sorted
  // independently — that's OK because the most-useful sort here is
  // "stem ascending" (find duplicates) and the page is small.
  const sorted = useMemo(() => {
    if (!items) return [];
    const def = COLS[sortKey as ColKey];
    if (!def?.sortable || !def.sortBy) return items;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = def.sortBy!(a);
      const vb = def.sortBy!(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [items, sortKey, sortDir]);

  // Approve / Reject helpers.
  async function approveOne(id: string) {
    setActingId(id);
    try {
      await content.review(id, true);
      // Drop from local state — same in-place patch as the prior
      // single-card view, just over a list. No reload.
      setItems((prev) => (prev ? prev.filter((q) => q.id !== id) : prev));
      setTotal((t) => Math.max(0, t - 1));
      setSelected((cur) => {
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
      if (openId === id) setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActingId(null);
    }
  }

  async function rejectOne(id: string, notes: string) {
    setActingId(id);
    try {
      await content.review(id, false, notes || undefined);
      setItems((prev) => (prev ? prev.filter((q) => q.id !== id) : prev));
      setTotal((t) => Math.max(0, t - 1));
      setSelected((cur) => {
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
      if (openId === id) setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActingId(null);
    }
  }

  async function approveSelected() {
    if (selected.size === 0) return;
    setBulkActing(true);
    setError(null);
    const queue = Array.from(selected);
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const id = queue[cursor++];
        try {
          await content.review(id, true);
          setItems((prev) => (prev ? prev.filter((q) => q.id !== id) : prev));
          setTotal((t) => Math.max(0, t - 1));
        } catch {
          /* swallow per-row */
        }
      }
    }
    await Promise.all(Array.from({ length: 5 }, worker));
    setSelected(new Set());
    setBulkActing(false);
  }

  // Bulk-select helpers.
  const visibleIds = useMemo(() => sorted.map((q) => q.id), [sorted]);
  const allOnPageSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  function toggleAllOnPage() {
    setSelected((cur) => {
      const next = new Set(cur);
      if (allOnPageSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Render ──
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const openQuestion = openId ? items?.find((q) => q.id === openId) ?? null : null;

  return (
    <AppShell
      title="Review queue"
      chips={
        items
          ? [
              { label: `${total} pending` },
              ...(selected.size > 0 ? [{ label: `${selected.size} selected` }] : []),
            ]
          : []
      }
      actions={
        <Link to="/questions" className="btn btn-ghost">
          ← My questions
        </Link>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        )}

        <Toolbar
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          examId={examId}
          setExamId={setExamId}
          subjectId={subjectId}
          setSubjectId={setSubjectId}
          topicId={topicId}
          setTopicId={setTopicId}
          exams={exams}
          subjects={subjects}
          topics={topics}
          total={total}
          shown={sorted.length}
          onResetLayout={() => {
            setOrder(DEFAULT_ORDER);
            setWidths({});
            setSortKey("stem");
            setSortDir("asc");
            setSearchInput("");
            setExamId("");
          }}
        />

        {selected.size > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 14px",
              background: "rgba(16,196,122,0.10)",
              border: "1px solid var(--good)",
              borderRadius: 8,
            }}
          >
            <strong style={{ fontSize: 13, color: "var(--good)" }}>
              {selected.size} selected
            </strong>
            <button
              type="button"
              onClick={() => void approveSelected()}
              disabled={bulkActing}
              className="btn btn-primary"
              style={{ padding: "6px 14px", fontSize: 12 }}
            >
              {bulkActing
                ? "Approving…"
                : `✓ Approve ${selected.size} selected`}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn btn-ghost"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              Clear selection
            </button>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
              Bulk approve runs 5 at a time. Per-row failures are silent — the row
              stays in the list.
            </span>
          </div>
        )}

        {items === null ? (
          <SkeletonRows count={5} />
        ) : sorted.length === 0 ? (
          <div className="card empty-state" style={{ marginTop: 4 }}>
            <div className="empty-state-title">
              {total === 0 ? "All clear" : "No matches"}
            </div>
            <p>
              {total === 0
                ? "Nothing in review right now. Approved questions land in the catalog."
                : "Try a different search or clear filters."}
            </p>
          </div>
        ) : (
          <DataTable
            rows={sorted}
            order={order}
            setOrder={setOrder}
            widths={widths}
            setWidths={setWidths}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={(k) => {
              if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
              else {
                setSortKey(k);
                setSortDir("asc");
              }
            }}
            selected={selected}
            allOnPageSelected={allOnPageSelected}
            toggleAllOnPage={toggleAllOnPage}
            toggleOne={toggleOne}
            actingId={actingId}
            onApprove={(id) => void approveOne(id)}
            onOpen={(id) => setOpenId(id)}
          />
        )}

        <Pagination
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          pageSize={pageSize}
          setPageSize={setPageSize}
          total={total}
        />
      </div>

      {openQuestion && (
        <DetailModal
          question={openQuestion}
          acting={actingId === openQuestion.id}
          onClose={() => setOpenId(null)}
          onApprove={() => void approveOne(openQuestion.id)}
          onReject={(notes) => void rejectOne(openQuestion.id, notes)}
        />
      )}
    </AppShell>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────

function Toolbar({
  searchInput,
  setSearchInput,
  examId,
  setExamId,
  subjectId,
  setSubjectId,
  topicId,
  setTopicId,
  exams,
  subjects,
  topics,
  total,
  shown,
  onResetLayout,
}: {
  searchInput: string;
  setSearchInput: (v: string) => void;
  examId: string;
  setExamId: (v: string) => void;
  subjectId: string;
  setSubjectId: (v: string) => void;
  topicId: string;
  setTopicId: (v: string) => void;
  exams: CatalogExam[];
  subjects: CatalogSubject[];
  topics: CatalogTopic[];
  total: number;
  shown: number;
  onResetLayout: () => void;
}) {
  const hasFilter = !!searchInput || !!examId || !!subjectId || !!topicId;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 14px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px" }}>
        <span aria-hidden style={{ fontSize: 14, color: "var(--ink-3)" }}>⌕</span>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search question stems…"
          style={{
            flex: 1,
            background: "transparent",
            border: 0,
            outline: 0,
            color: "var(--ink)",
            fontSize: 13,
            padding: "4px 0",
          }}
          aria-label="Search question stems"
        />
      </div>

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
        style={{ ...selectStyle, opacity: !examId ? 0.5 : 1 }}
      >
        <option value="">{examId ? "All subjects" : "Pick exam first"}</option>
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
        style={{ ...selectStyle, opacity: !subjectId ? 0.5 : 1 }}
      >
        <option value="">{subjectId ? "All topics" : "Pick subject first"}</option>
        {topics.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>

      {hasFilter && (
        <button
          type="button"
          onClick={() => {
            setSearchInput("");
            setExamId("");
          }}
          className="btn btn-ghost"
          style={{ padding: "4px 10px", fontSize: 11 }}
        >
          Clear filters
        </button>
      )}

      <span style={{ color: "var(--ink-3)", fontSize: 11 }}>
        {shown} of {total} on this page
      </span>

      <button
        type="button"
        onClick={onResetLayout}
        title="Reset column order, widths, and sort"
        style={{
          background: "transparent",
          color: "var(--ink-3)",
          border: "1px solid var(--rule)",
          padding: "4px 10px",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 11,
        }}
      >
        Reset layout
      </button>
    </div>
  );
}

// ── DataTable ────────────────────────────────────────────────────────

function DataTable({
  rows,
  order,
  setOrder,
  widths,
  setWidths,
  sortKey,
  sortDir,
  onSort,
  selected,
  allOnPageSelected,
  toggleAllOnPage,
  toggleOne,
  actingId,
  onApprove,
  onOpen,
}: {
  rows: Question[];
  order: ColKey[];
  setOrder: (next: ColKey[]) => void;
  widths: Partial<Record<ColKey, number>>;
  setWidths: (next: Partial<Record<ColKey, number>>) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  selected: Set<string>;
  allOnPageSelected: boolean;
  toggleAllOnPage: () => void;
  toggleOne: (id: string) => void;
  actingId: string | null;
  onApprove: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const dragSrc = useRef<ColKey | null>(null);
  const resizeStart = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);

  function handleDragStart(e: DragEvent, key: ColKey) {
    dragSrc.current = key;
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDrop(e: DragEvent, dst: ColKey) {
    e.preventDefault();
    const src = dragSrc.current;
    dragSrc.current = null;
    if (!src || src === dst) return;
    const next = order.filter((x) => x !== src);
    const at = next.indexOf(dst);
    next.splice(at, 0, src);
    setOrder(next);
  }
  function startResize(e: MouseEvent, key: ColKey) {
    e.preventDefault();
    e.stopPropagation();
    const w = widths[key] ?? COLS[key].defaultWidth;
    resizeStart.current = { key, startX: e.clientX, startW: w };
    function move(ev: globalThis.MouseEvent) {
      if (!resizeStart.current) return;
      const { key: k, startX, startW } = resizeStart.current;
      const delta = ev.clientX - startX;
      const next = Math.max(COLS[k].minWidth, startW + delta);
      setWidths({ ...widths, [k]: next });
    }
    function up() {
      resizeStart.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <div
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 10,
        overflow: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--card)" }}>
            {order.map((k) => {
              const def = COLS[k];
              const w = widths[k] ?? def.defaultWidth;
              const isSort = def.sortable && sortKey === (k as SortKey);
              return (
                <th
                  key={k}
                  draggable={k !== "select" && k !== "actions"}
                  onDragStart={(e) => handleDragStart(e, k)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, k)}
                  style={{
                    width: w,
                    minWidth: def.minWidth,
                    padding: "8px 10px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink-3)",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    cursor: def.sortable ? "pointer" : "default",
                    position: "relative",
                    userSelect: "none",
                  }}
                  onClick={
                    def.sortable
                      ? () => onSort(k as SortKey)
                      : undefined
                  }
                >
                  {k === "select" ? (
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label="Select all on page"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      {def.label}
                      {isSort && (
                        <span style={{ marginLeft: 4, color: "var(--ink)" }}>
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </>
                  )}
                  {/* Resize handle */}
                  <div
                    onMouseDown={(e) => startResize(e, k)}
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      width: 5,
                      height: "100%",
                      cursor: "col-resize",
                    }}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => {
            const isSelected = selected.has(q.id);
            const ctx: RenderCtx = {
              selected: isSelected,
              toggleSelect: () => toggleOne(q.id),
              onApprove: () => onApprove(q.id),
              onOpen: () => onOpen(q.id),
              acting: actingId === q.id,
            };
            return (
              <tr
                key={q.id}
                style={{
                  borderTop: "1px solid var(--rule)",
                  background: isSelected ? "rgba(79,135,246,0.08)" : "transparent",
                }}
              >
                {order.map((k) => {
                  const def = COLS[k];
                  const w = widths[k] ?? def.defaultWidth;
                  return (
                    <td
                      key={k}
                      style={{
                        width: w,
                        minWidth: def.minWidth,
                        padding: "8px 10px",
                        verticalAlign: "middle",
                      }}
                    >
                      {def.render(q, ctx)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────

function Pagination({
  page,
  setPage,
  totalPages,
  pageSize,
  setPageSize,
  total,
}: {
  page: number;
  setPage: (n: number) => void;
  totalPages: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginTop: 4,
        fontSize: 12,
        color: "var(--ink-3)",
      }}
    >
      <span>
        Page <strong style={{ color: "var(--ink)" }}>{page + 1}</strong> of{" "}
        <strong style={{ color: "var(--ink)" }}>{totalPages}</strong>
        <span style={{ marginLeft: 8, color: "var(--ink-4)" }}>
          · {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}
        </span>
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        <PageBtn onClick={() => setPage(0)} disabled={page === 0}>«</PageBtn>
        <PageBtn onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
          ‹ Prev
        </PageBtn>
        <PageBtn
          onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          Next ›
        </PageBtn>
        <PageBtn
          onClick={() => setPage(totalPages - 1)}
          disabled={page >= totalPages - 1}
        >
          »
        </PageBtn>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        Page size:
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value) || 25);
            setPage(0);
          }}
          style={selectStyle}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>
    </div>
  );
}

function PageBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--card)",
        color: disabled ? "var(--ink-4)" : "var(--ink)",
        border: "1px solid var(--rule)",
        padding: "4px 10px",
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

// ── Detail modal ─────────────────────────────────────────────────────

function DetailModal({
  question,
  acting,
  onClose,
  onApprove,
  onReject,
}: {
  question: Question;
  acting: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--paper-2)",
          border: "1px solid var(--rule-2)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <strong style={{ fontSize: 14 }}>Question detail</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ink-3)",
              cursor: "pointer",
              fontSize: 18,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <h2 style={{ fontSize: 16, marginBottom: 14, color: "var(--ink)" }}>
          {question.stem}
        </h2>

        <ol style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
          {question.choices.map((c, i) => (
            <li
              key={i}
              style={{
                padding: 10,
                marginBottom: 6,
                background:
                  i === question.correctIdx
                    ? "rgba(16,196,122,0.12)"
                    : "var(--card)",
                border: `1px solid ${
                  i === question.correctIdx
                    ? "var(--good)"
                    : "var(--rule)"
                }`,
                borderRadius: 6,
                display: "flex",
                gap: 10,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <strong style={{ minWidth: 24 }}>{String.fromCharCode(65 + i)}.</strong>
              <span style={{ flex: 1 }}>{c}</span>
              {i === question.correctIdx && (
                <span style={{ color: "var(--good)", fontSize: 11, fontWeight: 600 }}>
                  ✓ correct
                </span>
              )}
            </li>
          ))}
        </ol>

        {question.explanation && (
          <div
            style={{
              padding: 10,
              background: "var(--paper-2)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--ink-2)",
              lineHeight: 1.5,
              marginBottom: 14,
            }}
          >
            <strong style={{ color: "var(--ink)" }}>Explanation:</strong>{" "}
            {question.explanation}
          </div>
        )}

        <div
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            marginBottom: 12,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>type: {question.questionType ?? "MCQ_SINGLE"}</span>
          <span>language: {question.language.toUpperCase()}</span>
          <span>difficulty b={question.difficultyB.toFixed(2)}</span>
          <span>
            author: <code>{question.createdBy.slice(0, 8)}…</code>
          </span>
          <span>id: <code>{question.id.slice(0, 8)}…</code></span>
        </div>

        <textarea
          rows={2}
          placeholder="Optional review notes (shown to the author if rejected)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            background: "var(--paper-2)",
            color: "var(--ink)",
            border: "1px solid var(--rule-2)",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
            marginBottom: 12,
          }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onApprove}
            disabled={acting}
            className="btn btn-primary"
          >
            {acting ? "Working…" : "✓ Approve & publish"}
          </button>
          <button
            type="button"
            onClick={() => onReject(notes)}
            disabled={acting}
            className="btn btn-ghost"
          >
            ✗ Reject
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            style={{ marginLeft: "auto" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const selectStyle: CSSProperties = {
  padding: "4px 10px",
  background: "var(--paper-2)",
  color: "var(--ink)",
  border: "1px solid var(--rule-2)",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  maxWidth: 220,
};