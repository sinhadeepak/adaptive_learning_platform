import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import { auth } from "../lib/api";
import { env } from "../lib/env";

// ─────────────────────────────────────────────────────────────────────────
// Translation Review — list view.
//
// Replaces the standalone "paste a UUID and load translations" form
// with a paged list of every published question. Each row exposes a
// Translations action that drills into the detail view at
// /translation-review/:questionId, where source ↔ translation diff +
// approve/reject lives.
//
// Wraps GET /content/questions?scope=all (admin only) — supports
// stem search (?q=...), question_type filter, and limit/offset.
// ─────────────────────────────────────────────────────────────────────────

interface QuestionRow {
  id: string;
  topicId: string;
  stem: string;
  questionType?: string | null;
  language: string;
  status: string;
  difficultyB: number;
  createdAt: string;
}

interface QuestionList {
  items: QuestionRow[];
  total: number;
}

const PAGE_SIZE = 25;

export function TranslationsList() {
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [pendingSearch, setPendingSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = page * PAGE_SIZE;

  const queryString = useMemo(() => {
    const p = new URLSearchParams({
      scope: "all",
      status: "PUBLISHED",
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (search.trim()) p.set("q", search.trim());
    if (typeFilter) p.set("type", typeFilter);
    return p.toString();
  }, [offset, search, typeFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await auth.fetch(`${env.apiBaseUrl}/content/questions?${queryString}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as QuestionList;
        if (cancelled) return;
        setRows(body.items);
        setTotal(body.total);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load questions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  function applySearch() {
    setSearch(pendingSearch);
    setPage(0);
  }

  return (
    <AppShell title="Translations" chips={[{ label: "Phase 5" }]}>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          type="search"
          placeholder="Search stems…"
          value={pendingSearch}
          onChange={(e) => setPendingSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
          style={{
            flex: "1 1 320px",
            minWidth: 240,
            padding: "6px 10px",
            background: "var(--bg-surface3)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 13,
          }}
        />
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(0);
          }}
          style={{
            padding: "6px 10px",
            background: "var(--bg-surface3)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          <option value="">All types</option>
          <option value="MCQ_SINGLE">MCQ (single)</option>
          <option value="MCQ_MULTI">MCQ (multi)</option>
          <option value="NUMERIC_INTEGER">Numeric integer</option>
          <option value="NUMERIC_DECIMAL">Numeric decimal</option>
          <option value="ESSAY">Essay</option>
          <option value="DESCRIPTIVE_LONG">Descriptive long</option>
          <option value="SHORT_TEXT">Short text</option>
          <option value="DIAGRAM_HOTSPOT">Diagram hotspot</option>
          <option value="MAP_LOCATION">Map location</option>
          <option value="MATCH_THE_FOLLOWING">Match the following</option>
          <option value="CLOZE_PASSAGE">Cloze passage</option>
        </select>
        <button
          onClick={applySearch}
          style={{
            padding: "6px 16px",
            background: "var(--color-blue)",
            color: "white",
            border: "1px solid var(--border)",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Search
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div
        style={{
          background: "var(--bg-surface1)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr
              style={{
                background: "var(--bg-surface2)",
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.04 }}>
                Stem
              </th>
              <th style={{ padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.04 }}>
                Type
              </th>
              <th style={{ padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.04 }}>
                Status
              </th>
              <th style={{ padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.04 }}>
                Lang
              </th>
              <th style={{ padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.04 }}>
                Difficulty
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.04,
                  textAlign: "right",
                }}
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  No questions match this filter.
                </td>
              </tr>
            )}
            {rows.map((q) => (
              <tr
                key={q.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <td style={{ padding: "10px 12px", maxWidth: 600 }}>
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={q.stem}
                  >
                    {q.stem}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono, monospace)",
                      marginTop: 2,
                    }}
                  >
                    {q.id}
                  </div>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <Pill tone="muted">{q.questionType ?? "MCQ_SINGLE"}</Pill>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <Pill tone={q.status === "PUBLISHED" ? "success" : "warning"}>
                    {q.status}
                  </Pill>
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                  {q.language.toUpperCase()}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                  {q.difficultyB.toFixed(1)}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  <Link
                    to={`/translation-review/${q.id}`}
                    style={{
                      display: "inline-block",
                      padding: "5px 12px",
                      background: "var(--color-blue)",
                      color: "white",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Translations →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        <span>
          {total === 0
            ? "0 questions"
            : `Showing ${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            style={pageBtnStyle(page === 0)}
          >
            ‹‹
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={pageBtnStyle(page === 0)}
          >
            ‹ Prev
          </button>
          <span style={{ alignSelf: "center", padding: "0 8px" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={pageBtnStyle(page >= totalPages - 1)}
          >
            Next ›
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            style={pageBtnStyle(page >= totalPages - 1)}
          >
            ››
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    background: "var(--bg-surface2)",
    color: disabled ? "var(--text-faint)" : "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
  };
}
