/**
 * Catalog → Exam topic browser with full table affordances.
 *
 * Replaces the previous simple list-of-rows view with a real data
 * grid:
 *   • Search box (matches topic title or subject)
 *   • Sortable columns (click header)
 *   • Column resizing (drag right edge of header)
 *   • Column reordering (drag column header)
 *   • Pagination (10 / 25 / 50 / 100 per page)
 *   • View toggle: dense table ↔ card grid
 *
 * User preferences (column order, widths, view mode, page size) are
 * persisted to localStorage so they survive page reloads.
 *
 * No external dependencies — all interactions are hand-rolled with
 * standard React + DOM events. Styling lives inline / in the
 * matching `catalog-exam.css` snippet appended to the global stylesheet.
 */

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link, useParams } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

// ─── Types ──────────────────────────────────────────────────────────

interface Subject {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}

interface Topic {
  id: string;
  subjectId: string;
  title: string;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
}

interface Row extends Topic {
  subjectName: string;
  /** EWA mastery in [0, 1] joined from analytics/mastery. 0 = not started. */
  mastery: number;
  /** Attempt count for this topic. */
  attempts: number;
}

interface ExamMeta {
  id: string;
  code: string;
  name: string;
  subtitle: string;
  iconKey?: string;
}

interface ExamEnrolment {
  examId: string;
  targetDate: string | null;
}

type ColKey = "subject" | "title" | "mastery" | "questions" | "tier" | "actions";
type ViewMode = "table" | "cards";

interface ColDef {
  key: ColKey;
  label: string;
  /** Default width in pixels for table mode. */
  defaultWidth: number;
  /** Min width in pixels for table mode. */
  minWidth: number;
  /** Whether the column is sortable. */
  sortable: boolean;
  /** Sort key — falls back to `key` when omitted. */
  sortBy?: (r: Row) => string | number;
  /** Cell renderer in table mode. */
  render: (r: Row) => ReactNode;
}

const COLS: Record<ColKey, ColDef> = {
  subject: {
    key: "subject",
    label: "Subject",
    defaultWidth: 200,
    minWidth: 120,
    sortable: true,
    sortBy: (r) => r.subjectName.toLowerCase(),
    render: (r) => <span style={{ color: "var(--ink-2)" }}>{r.subjectName}</span>,
  },
  title: {
    key: "title",
    label: "Chapter / Topic",
    defaultWidth: 320,
    minWidth: 200,
    sortable: true,
    sortBy: (r) => r.title.toLowerCase(),
    render: (r) => (
      <Link
        to={`/catalog/topic/${r.id}`}
        style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "none" }}
      >
        {r.title}
      </Link>
    ),
  },
  mastery: {
    key: "mastery",
    label: "Your mastery",
    defaultWidth: 180,
    minWidth: 140,
    sortable: true,
    sortBy: (r) => r.mastery,
    render: (r) => <MasteryBar value={r.mastery} attempts={r.attempts} />,
  },
  questions: {
    key: "questions",
    label: "Questions",
    defaultWidth: 110,
    minWidth: 80,
    sortable: true,
    sortBy: (r) => r.questionCount,
    render: (r) => (
      <span style={{ color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
        {r.questionCount}
      </span>
    ),
  },
  tier: {
    key: "tier",
    label: "Tier",
    defaultWidth: 100,
    minWidth: 80,
    sortable: true,
    sortBy: (r) => r.tier,
    render: (r) => (
      <Pill tone={r.tier === "PREMIUM" ? "warning" : "muted"}>
        {r.tier === "PREMIUM" ? "Premium" : "Free"}
      </Pill>
    ),
  },
  actions: {
    key: "actions",
    label: "",
    defaultWidth: 200,
    minWidth: 160,
    sortable: false,
    render: (r) => (
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <Link
          to={`/practice?topicId=${r.id}`}
          className="btn btn-primary"
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          Practice
        </Link>
        <Link
          to={`/catalog/topic/${r.id}`}
          className="btn btn-ghost"
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          Open
        </Link>
      </div>
    ),
  },
};

const DEFAULT_ORDER: ColKey[] = ["subject", "title", "mastery", "questions", "tier", "actions"];

// Bands chosen to match the design-system mastery palette used in
// progress_tab.dart / dashboard.tsx so a topic that reads "Weak" here
// reads "Weak" on the mobile dashboard too.
function masteryBand(v: number): { label: string; color: string; track: string } {
  if (v <= 0)    return { label: "Not started", color: "var(--ink-3)", track: "var(--paper-2)" };
  if (v < 0.4)   return { label: "Weak",        color: "var(--bad)",  track: "rgba(244,63,94,0.18)" };
  if (v < 0.7)   return { label: "Developing",  color: "var(--info)", track: "rgba(79,135,246,0.18)" };
  return            { label: "Strong",        color: "var(--good)", track: "rgba(16,196,122,0.20)" };
}

function MasteryBar({ value, attempts }: { value: number; attempts: number }) {
  const band = masteryBand(value);
  const pct = Math.round(value * 100);
  const started = value > 0;
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
      title={started ? `${pct}% mastery · ${attempts} attempt${attempts === 1 ? "" : "s"}` : "Not started yet"}
    >
      <div
        style={{
          flex: 1,
          height: 8,
          minWidth: 50,
          background: band.track,
          borderRadius: 4,
          // A 1px ring on the track keeps the "not started" state from
          // disappearing into the page background in light theme.
          boxShadow: "inset 0 0 0 1px var(--rule)",
          overflow: "hidden",
        }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            width: `${started ? Math.max(6, pct) : 0}%`,
            height: "100%",
            background: band.color,
            transition: "width 200ms",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          color: band.color,
          fontWeight: started ? 700 : 500,
          minWidth: started ? 36 : 78,
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {started ? `${pct}%` : "Not started"}
      </span>
    </div>
  );
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function ExamHeader({
  meta,
  enrolment,
  totalTopics,
  totalQuestions,
  avgMastery,
  topicsStarted,
}: {
  meta: ExamMeta | null;
  enrolment: ExamEnrolment | null;
  totalTopics: number;
  totalQuestions: number;
  avgMastery: number;
  topicsStarted: number;
}) {
  const days = daysUntil(enrolment?.targetDate ?? null);
  return (
    <section
      style={{
        marginBottom: 16,
        padding: 20,
        borderRadius: 12,
        background:
          "linear-gradient(135deg, rgba(79,135,246,0.10), rgba(34,212,238,0.06))",
        border: "1px solid var(--rule)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: "var(--gold)", textTransform: "uppercase" }}>
            ◈ EXAM SYLLABUS
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0", lineHeight: 1.15, color: "var(--ink)" }}>
            {meta?.name ?? "Exam"}
          </h1>
          {meta?.subtitle && (
            <p style={{ margin: "4px 0 0", color: "var(--ink-2)", fontSize: 13 }}>{meta.subtitle}</p>
          )}
        </div>
        {days !== null && (
          <div
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: days < 60 ? "rgba(244,63,94,0.18)" : "rgba(79,135,246,0.18)",
              color: days < 60 ? "var(--bad)" : "var(--info)",
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {days >= 0 ? `${days} days to exam` : `Exam date passed (${-days}d ago)`}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 16 }}>
        <StatTile
          label="Overall mastery"
          value={`${Math.round(avgMastery * 100)}%`}
          tone={avgMastery <= 0 ? "muted" : avgMastery >= 0.5 ? "good" : "warn"}
          sub={avgMastery <= 0 ? "start practising to see this rise" : undefined}
        />
        <StatTile label="Topics started" value={`${topicsStarted}/${totalTopics}`} tone="info" />
        <StatTile label="Total chapters" value={`${totalTopics}`} tone="muted" />
        <StatTile label="Question bank" value={`${totalQuestions}`} tone="muted" sub="across syllabus" />
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "good" | "warn" | "info" | "muted";
}) {
  const colors: Record<typeof tone, string> = {
    good: "var(--good)",
    warn: "var(--warn)",
    info: "var(--info)",
    muted: "var(--ink-2)",
  };
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: "var(--ink-4)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: colors[tone], lineHeight: 1.1, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Persistence ────────────────────────────────────────────────────
//
// Per-page localStorage so a student's table layout sticks across
// reloads. Keyed by examId so different exam catalogs don't stomp
// each other's column widths.

interface PersistedPrefs {
  order?: ColKey[];
  widths?: Partial<Record<ColKey, number>>;
  view?: ViewMode;
  pageSize?: number;
}

function loadPrefs(examId: string): PersistedPrefs {
  try {
    const raw = localStorage.getItem(`alp.catalog-exam.${examId}`);
    return raw ? (JSON.parse(raw) as PersistedPrefs) : {};
  } catch {
    return {};
  }
}

function savePrefs(examId: string, prefs: PersistedPrefs) {
  try {
    localStorage.setItem(`alp.catalog-exam.${examId}`, JSON.stringify(prefs));
  } catch {
    /* swallow — quota / private mode */
  }
}

// ─── Page ──────────────────────────────────────────────────────────

export function CatalogExam() {
  const { examId = "" } = useParams<{ examId: string }>();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<ExamMeta | null>(null);
  const [enrolment, setEnrolment] = useState<ExamEnrolment | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Persisted prefs.
  const initialPrefs = useMemo(() => loadPrefs(examId), [examId]);
  const [view, setView] = useState<ViewMode>(initialPrefs.view ?? "table");
  const [order, setOrder] = useState<ColKey[]>(() => {
    // Backward-compat: persisted prefs from before the `mastery` column
    // existed return an order without it. Splice it in just after the
    // title column instead of wiping the user's prior layout.
    const persisted = initialPrefs.order?.filter((k): k is ColKey => k in COLS);
    if (!persisted || persisted.length === 0) return DEFAULT_ORDER;
    if (!persisted.includes("mastery")) {
      const titleIdx = persisted.indexOf("title");
      const insertAt = titleIdx >= 0 ? titleIdx + 1 : persisted.length;
      return [...persisted.slice(0, insertAt), "mastery", ...persisted.slice(insertAt)];
    }
    return persisted;
  });
  const [widths, setWidths] = useState<Partial<Record<ColKey, number>>>(
    initialPrefs.widths ?? {},
  );
  const [pageSize, setPageSize] = useState<number>(initialPrefs.pageSize ?? 25);

  // Volatile state.
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<ColKey>("subject");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  // Persist whenever a relevant pref changes.
  useEffect(() => {
    savePrefs(examId, { order, widths, view, pageSize });
  }, [examId, order, widths, view, pageSize]);

  // Fetch exam content + meta + per-topic mastery in parallel. The
  // mastery join is best-effort — if /analytics is down the topic
  // rows still render with mastery=0 (treated as "not started").
  useEffect(() => {
    if (!examId) return;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const [subjectsRes, examsRes, profileRes, masteryRes] = await Promise.all([
          auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`),
          auth.fetch(`/api/v1/catalog/exams`),
          auth.fetch(`/api/v1/profile/me`),
          user?.id
            ? auth.fetch(`/api/v1/analytics/mastery/${user.id}`).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!subjectsRes.ok) throw new Error(`HTTP ${subjectsRes.status}`);
        const subjects = (await subjectsRes.json()) as Subject[];

        if (examsRes?.ok) {
          const all = (await examsRes.json()) as ExamMeta[];
          setMeta(all.find((e) => e.id === examId) ?? null);
        }
        if (profileRes?.ok) {
          const prof = await profileRes.json();
          const e = (prof?.exams as ExamEnrolment[] | undefined)?.find((x) => x.examId === examId);
          if (e) setEnrolment(e);
        }
        const masteryByTopic: Record<string, { ewa: number; n: number }> = {};
        if (masteryRes?.ok) {
          const j = await masteryRes.json();
          for (const t of (j.topics as Array<{ topicId: string; ewa: number; n: number }> | undefined) ?? []) {
            masteryByTopic[t.topicId] = { ewa: t.ewa, n: t.n };
          }
        }

        const enriched = await Promise.all(
          subjects.map(async (s): Promise<Row[]> => {
            const r = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
            const topics = r.ok ? ((await r.json()) as Topic[]) : [];
            return topics.map((t) => {
              const m = masteryByTopic[t.id];
              return {
                ...t,
                subjectName: s.name,
                mastery: m?.ewa ?? 0,
                attempts: m?.n ?? 0,
              };
            });
          }),
        );
        setRows(enriched.flat());
      } catch {
        setError("We couldn't load this exam's content.");
      }
    })();
  }, [examId, user?.id]);

  // Distinct subject options for the dropdown filter, sorted alphabetically.
  const subjectOptions = useMemo(() => {
    if (!rows) return [];
    const set = new Set<string>();
    for (const r of rows) set.add(r.subjectName);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // ── Derivations: filter → sort → paginate ──
  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (subjectFilter && r.subjectName !== subjectFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.subjectName.toLowerCase().includes(q)
      );
    });
  }, [rows, search, subjectFilter]);

  const sorted = useMemo(() => {
    const def = COLS[sortKey];
    if (!def?.sortable || !def.sortBy) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = def.sortBy!(a);
      const vb = def.sortBy!(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Clamp page if filter shrunk the list.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  // Reset to page 1 when search or subject filter changes.
  useEffect(() => setPage(1), [search, subjectFilter]);

  // ── Aggregate stats for the exam header. Computed off `rows` (NOT
  // the filtered view) so the header reflects the whole syllabus
  // even while the user is searching.
  const stats = useMemo(() => {
    if (!rows || rows.length === 0) {
      return { avgMastery: 0, started: 0, totalQ: 0, total: 0 };
    }
    const total = rows.length;
    const totalQ = rows.reduce((s, r) => s + r.questionCount, 0);
    const started = rows.filter((r) => r.mastery > 0).length;
    const masterySum = rows.reduce((s, r) => s + r.mastery, 0);
    return { avgMastery: masterySum / total, started, totalQ, total };
  }, [rows]);

  // ── Hide the TIER column when every row is FREE — a homogeneous
  // column adds visual noise. The persisted user order is honoured for
  // the columns that remain; if the user explicitly reordered tier
  // earlier and rows later gain Premium rows, the column reappears.
  const effectiveOrder = useMemo<ColKey[]>(() => {
    if (!rows) return order;
    const allFree = rows.every((r) => r.tier === "FREE");
    return allFree ? order.filter((k) => k !== "tier") : order;
  }, [order, rows]);

  // ── Render ──
  const headerTitle = meta?.name ?? "Exam";

  if (error) {
    return (
      <AppShell title={headerTitle} actions={<BackLink />}>
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      </AppShell>
    );
  }

  if (rows === null) {
    return (
      <AppShell title={headerTitle} actions={<BackLink />}>
        <SkeletonRows count={5} />
      </AppShell>
    );
  }

  return (
    <AppShell title={headerTitle} actions={<BackLink />}>
      <ExamHeader
        meta={meta}
        enrolment={enrolment}
        totalTopics={stats.total}
        totalQuestions={stats.totalQ}
        avgMastery={stats.avgMastery}
        topicsStarted={stats.started}
      />

      <Toolbar
        view={view}
        setView={setView}
        search={search}
        setSearch={setSearch}
        subjectFilter={subjectFilter}
        setSubjectFilter={setSubjectFilter}
        subjectOptions={subjectOptions}
        total={rows.length}
        shown={sorted.length}
        onResetLayout={() => {
          setOrder(DEFAULT_ORDER);
          setWidths({});
          setSortKey("subject");
          setSortDir("asc");
          setSubjectFilter("");
          setSearch("");
        }}
      />

      {sorted.length === 0 ? (
        <div className="card empty-state" style={{ marginTop: 12 }}>
          <div className="empty-state-title">No matching chapters</div>
          <p>
            {rows.length === 0
              ? "This exam has no chapters in the catalog yet."
              : "Try a different search term."}
          </p>
        </div>
      ) : view === "table" ? (
        <DataTable
          rows={pageRows}
          order={effectiveOrder}
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
          groupBySubject={sortKey === "subject"}
        />
      ) : (
        <CardGrid rows={pageRows} />
      )}

      <Pagination
        page={page}
        setPage={setPage}
        totalPages={totalPages}
        pageSize={pageSize}
        setPageSize={setPageSize}
        total={sorted.length}
      />
    </AppShell>
  );
}

// ─── Toolbar ───────────────────────────────────────────────────────

function Toolbar({
  view,
  setView,
  search,
  setSearch,
  subjectFilter,
  setSubjectFilter,
  subjectOptions,
  total,
  shown,
  onResetLayout,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  search: string;
  setSearch: (s: string) => void;
  subjectFilter: string;
  setSubjectFilter: (s: string) => void;
  subjectOptions: string[];
  total: number;
  shown: number;
  onResetLayout: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 12,
        padding: "10px 14px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 240px" }}>
        <span aria-hidden style={{ fontSize: 14, color: "var(--ink-3)" }}>
          ⌕
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chapters or subjects…"
          style={{
            flex: 1,
            background: "transparent",
            border: 0,
            outline: 0,
            color: "var(--ink)",
            fontSize: 13,
            padding: "4px 0",
          }}
          aria-label="Search chapters"
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <label
          htmlFor="subject-filter"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          Subject
        </label>
        <select
          id="subject-filter"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          aria-label="Filter by subject"
          style={{
            background: "var(--card)",
            color: "var(--ink)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 13,
            cursor: "pointer",
            maxWidth: 220,
          }}
        >
          <option value="">All subjects ({subjectOptions.length})</option>
          {subjectOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {subjectFilter && (
          <button
            onClick={() => setSubjectFilter("")}
            aria-label="Clear subject filter"
            title="Clear subject filter"
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ink-3)",
              cursor: "pointer",
              fontSize: 14,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        )}
      </div>

      <span style={{ color: "var(--ink-3)", fontSize: 11 }}>
        {shown} of {total} chapter{total === 1 ? "" : "s"}
      </span>

      <div style={{ display: "flex", gap: 4 }}>
        <ToggleButton active={view === "table"} onClick={() => setView("table")}>
          ▤ Table
        </ToggleButton>
        <ToggleButton active={view === "cards"} onClick={() => setView("cards")}>
          ▦ Cards
        </ToggleButton>
      </div>

      <button
        onClick={onResetLayout}
        title="Reset column order, widths and sort"
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

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active ? "var(--gold)" : "var(--card)",
        color: active ? "#fff" : "var(--ink-2)",
        border: "1px solid var(--rule)",
        padding: "5px 12px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

// ─── Data Table (table mode) ───────────────────────────────────────

function DataTable({
  rows,
  order,
  setOrder,
  widths,
  setWidths,
  sortKey,
  sortDir,
  onSort,
  groupBySubject = false,
}: {
  rows: Row[];
  order: ColKey[];
  setOrder: (o: ColKey[]) => void;
  widths: Partial<Record<ColKey, number>>;
  setWidths: (w: Partial<Record<ColKey, number>>) => void;
  sortKey: ColKey;
  sortDir: "asc" | "desc";
  onSort: (k: ColKey) => void;
  /** When true, inject a subject sub-header row whenever the subject
   *  changes between consecutive data rows. Only meaningful when the
   *  rows are already sorted by subject. */
  groupBySubject?: boolean;
}) {
  // Drag state for column reordering.
  const dragKey = useRef<ColKey | null>(null);
  const [hoverKey, setHoverKey] = useState<ColKey | null>(null);

  // Mouse state for column resizing.
  const resizing = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);

  useEffect(() => {
    function onMove(e: globalThis.MouseEvent) {
      const r = resizing.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const next = Math.max(COLS[r.key].minWidth, r.startW + dx);
      setWidths({ ...widths, [r.key]: next });
    }
    function onUp() {
      resizing.current = null;
      document.body.style.cursor = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [widths, setWidths]);

  const colWidth = (k: ColKey): number => widths[k] ?? COLS[k].defaultWidth;

  const handleDragStart = (k: ColKey) => (e: DragEvent<HTMLTableHeaderCellElement>) => {
    dragKey.current = k;
    e.dataTransfer.effectAllowed = "move";
    // Firefox needs a payload to start a drag.
    e.dataTransfer.setData("text/plain", k);
  };
  const handleDragOver = (k: ColKey) => (e: DragEvent<HTMLTableHeaderCellElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverKey(k);
  };
  const handleDrop = (k: ColKey) => (e: DragEvent<HTMLTableHeaderCellElement>) => {
    e.preventDefault();
    setHoverKey(null);
    const src = dragKey.current;
    dragKey.current = null;
    if (!src || src === k) return;
    const next = order.filter((x) => x !== src);
    const idx = next.indexOf(k);
    next.splice(idx, 0, src);
    setOrder(next);
  };

  const startResize = (k: ColKey) => (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = {
      key: k,
      startX: e.clientX,
      startW: colWidth(k),
    };
    document.body.style.cursor = "col-resize";
  };

  return (
    <div
      className="catalog-table-wrap"
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 10,
        overflow: "auto",
      }}
    >
      <table
        className="catalog-table"
        style={{
          borderCollapse: "collapse",
          tableLayout: "fixed",
          width: "max-content",
          minWidth: "100%",
        }}
      >
        <colgroup>
          {order.map((k) => (
            <col key={k} style={{ width: colWidth(k) }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ background: "var(--card)" }}>
            {order.map((k) => {
              const def = COLS[k];
              const isSort = sortKey === k;
              return (
                <th
                  key={k}
                  draggable
                  onDragStart={handleDragStart(k)}
                  onDragOver={handleDragOver(k)}
                  onDrop={handleDrop(k)}
                  onDragLeave={() => setHoverKey(null)}
                  onDragEnd={() => setHoverKey(null)}
                  scope="col"
                  style={
                    {
                      position: "relative",
                      padding: "10px 12px",
                      borderBottom: "1px solid var(--rule)",
                      background:
                        hoverKey === k ? "var(--gold)" : "var(--card)",
                      color: hoverKey === k ? "#fff" : "var(--ink-2)",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      userSelect: "none",
                      cursor: def.sortable ? "pointer" : "grab",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    } as CSSProperties
                  }
                  onClick={() => def.sortable && onSort(k)}
                >
                  <span>{def.label}</span>
                  {def.sortable && isSort && (
                    <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                  {/* Resize handle */}
                  <div
                    onMouseDown={startResize(k)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 6,
                      cursor: "col-resize",
                      userSelect: "none",
                    }}
                    aria-hidden
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const prev = rows[idx - 1];
            const showGroupHeader =
              groupBySubject && (!prev || prev.subjectName !== r.subjectName);
            return (
              <Fragment key={r.id}>
                {showGroupHeader && (
                  <tr aria-hidden>
                    <td
                      colSpan={order.length}
                      style={{
                        padding: "10px 12px 6px",
                        background: "transparent",
                        borderTop: idx === 0 ? "none" : "1px solid var(--rule)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: "var(--ink-2)",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          display: "inline-block",
                          width: 3,
                          height: 12,
                          marginRight: 8,
                          verticalAlign: "middle",
                          background: "var(--gold)",
                          borderRadius: 2,
                        }}
                      />
                      {r.subjectName}
                      <span
                        style={{
                          marginLeft: 10,
                          color: "var(--ink-4)",
                          fontWeight: 500,
                          letterSpacing: 0,
                          textTransform: "none",
                          fontSize: 11,
                        }}
                      >
                        {rows.filter((rr) => rr.subjectName === r.subjectName).length} chapters
                      </span>
                    </td>
                  </tr>
                )}
                <tr
                  className="catalog-row"
                  style={{
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  {order.map((k) => (
                    <td
                      key={k}
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        verticalAlign: "middle",
                      }}
                    >
                      {COLS[k].render(r)}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Card Grid (cards mode) ────────────────────────────────────────

// Six gradient swatches shared with /courses + /tutors so the visual
// language of the marketplace and the catalog stay consistent. Hashed
// off topic id so the same chapter always paints the same colour.
const THUMB_GRADIENTS = [
  "linear-gradient(135deg, #4F87F6, #A78BFA)",
  "linear-gradient(135deg, #22D4EE, #4F87F6)",
  "linear-gradient(135deg, #10C47A, #22D4EE)",
  "linear-gradient(135deg, #F5A623, #F43F5E)",
  "linear-gradient(135deg, #A78BFA, #F472B6)",
  "linear-gradient(135deg, #FB923C, #A78BFA)",
];
function thumbFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return THUMB_GRADIENTS[h % THUMB_GRADIENTS.length];
}

function CardGrid({ rows }: { rows: Row[] }) {
  return (
    <div className="pg-grid">
      {rows.map((r) => {
        const isPremium = r.tier === "PREMIUM";
        const band = masteryBand(r.mastery);
        const initial = r.title.trim().slice(0, 1).toUpperCase() || "•";
        return (
          <Link key={r.id} to={`/catalog/topic/${r.id}`} className="pg-card">
            <div className="pg-card-thumb" style={{ background: thumbFor(r.id) }}>
              <div className="pg-card-thumb-letter">{initial}</div>
              {isPremium && (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    padding: "3px 8px",
                    background: "rgba(255,255,255,0.95)",
                    color: "#000",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    borderRadius: 999,
                    textTransform: "uppercase",
                  }}
                >
                  ★ Premium
                </div>
              )}
            </div>
            <div className="pg-card-body">
              <div className="pg-card-eyebrow">{r.subjectName}</div>
              <h2 className="pg-card-title">{r.title}</h2>
              <MasteryBar value={r.mastery} attempts={r.attempts} />
              <div className="pg-card-meta">
                <span className="pg-card-meta-pill">📘 {r.questionCount} questions</span>
                <span
                  className="pg-card-meta-pill"
                  style={{ color: band.color, borderColor: "currentColor" }}
                >
                  ◉ {band.label}
                </span>
              </div>
            </div>
            <div className="pg-card-foot">
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {r.attempts > 0 ? `${r.attempts} attempt${r.attempts === 1 ? "" : "s"}` : "Not started yet"}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <Link
                  to={`/practice?topicId=${r.id}`}
                  className="btn btn-primary"
                  style={{ padding: "4px 12px", fontSize: 12 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Practice →
                </Link>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────

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
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginTop: 12,
        padding: "10px 14px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 10,
      }}
    >
      <span style={{ color: "var(--ink-3)", fontSize: 12 }}>
        Showing <strong style={{ color: "var(--ink)" }}>{start}</strong>–
        <strong style={{ color: "var(--ink)" }}>{end}</strong> of{" "}
        <strong style={{ color: "var(--ink)" }}>{total}</strong>
      </span>

      <label style={{ marginLeft: "auto", color: "var(--ink-3)", fontSize: 12 }}>
        Page size:&nbsp;
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          style={{
            background: "var(--card)",
            color: "var(--ink)",
            border: "1px solid var(--rule)",
            borderRadius: 4,
            padding: "2px 6px",
            fontSize: 12,
          }}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <PageBtn disabled={page <= 1} onClick={() => setPage(1)} title="First">
          «
        </PageBtn>
        <PageBtn disabled={page <= 1} onClick={() => setPage(page - 1)} title="Previous">
          ‹
        </PageBtn>
        <span style={{ color: "var(--ink-2)", fontSize: 12, minWidth: 80, textAlign: "center" }}>
          Page {page} / {totalPages}
        </span>
        <PageBtn
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          title="Next"
        >
          ›
        </PageBtn>
        <PageBtn disabled={page >= totalPages} onClick={() => setPage(totalPages)} title="Last">
          »
        </PageBtn>
      </div>
    </div>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: "var(--card)",
        color: disabled ? "var(--ink-4)" : "var(--ink)",
        border: "1px solid var(--rule)",
        padding: "4px 10px",
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

function BackLink() {
  return (
    <Link to="/catalog" className="btn btn-ghost">
      ← All exams
    </Link>
  );
}