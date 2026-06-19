import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import { auth } from "../lib/api";
import { env } from "../lib/env";
import { batches, languages, type Language } from "../lib/translation-workbench-api";
import { clearPage, resolveAllMatching, selectAllOnPage, toggle } from "./translation-selection";

const SELECT_ALL_CAP = 500;

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

  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [langs, setLangs] = useState<Language[]>([]);
  const [chosenLangs, setChosenLangs] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    languages.list().then((ls) => setLangs(ls.filter((l) => !l.isSource))).catch(() => setLangs([]));
  }, []);

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

  const pageIds = rows.map((r) => r.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  async function selectAllMatching() {
    const { ids, capped } = await resolveAllMatching(async (off) => {
      const p = new URLSearchParams(queryString);
      p.set("limit", "200");
      p.set("offset", String(off));
      const r = await auth.fetch(`${env.apiBaseUrl}/content/questions?${p.toString()}`);
      const body = (await r.json()) as QuestionList;
      return { ids: body.items.map((i) => i.id), total: body.total };
    }, SELECT_ALL_CAP);
    setSelected(new Set(ids));
    if (capped) setNotice(`Selection capped at ${SELECT_ALL_CAP} questions.`);
  }

  async function startBatch() {
    if (selected.size === 0 || chosenLangs.size === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const out = await batches.create({
        questionIds: [...selected],
        targetLangs: [...chosenLangs],
        overwriteExisting: overwrite,
      });
      navigate(`/translation-batches/${out.batchId}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't start batch");
      setBusy(false);
    }
  }

  function applySearch() {
    setSearch(pendingSearch);
    setPage(0);
  }

  return (
    <AdminShell
      crumbs="Quality · Translations"
      title="Translations"
      chips={<span className="vidya-shell__chip">Phase 5</span>}
    >
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
            background: "var(--paper-2)",
            color: "var(--ink)",
            border: "1px solid var(--rule)",
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
            background: "var(--paper-2)",
            color: "var(--ink)",
            border: "1px solid var(--rule)",
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
          className="btn btn-primary"
        >
          Search
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {notice && <Banner tone="info">{notice}</Banner>}
      {selected.size > 0 && total > rows.length && (
        <button className="btn" onClick={selectAllMatching} style={{ marginBottom: 8 }}>
          Select all {total} matching this filter
        </button>
      )}

      <div
        style={{
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? selectAllOnPage(s, pageIds) : clearPage(s, pageIds)))
                  }
                  aria-label="Select all on page"
                />
              </th>
              <th>Stem</th>
              <th>Type</th>
              <th>Status</th>
              <th>Lang</th>
              <th>Difficulty</th>
              <th style={{ textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--ink-3)",
                  }}
                >
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--ink-3)",
                  }}
                >
                  No questions match this filter.
                </td>
              </tr>
            )}
            {rows.map((q) => (
              <tr key={q.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={() => setSelected((s) => toggle(s, q.id))}
                    aria-label={`Select ${q.id}`}
                  />
                </td>
                <td style={{ maxWidth: 600 }}>
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
                      color: "var(--ink-3)",
                      fontFamily: "var(--font-mono, monospace)",
                      marginTop: 2,
                    }}
                  >
                    {q.id}
                  </div>
                </td>
                <td>
                  <Pill tone="muted">{q.questionType ?? "MCQ_SINGLE"}</Pill>
                </td>
                <td>
                  <Pill tone={q.status === "PUBLISHED" ? "success" : "warning"}>
                    {q.status}
                  </Pill>
                </td>
                <td style={{ color: "var(--ink-2)" }}>
                  {q.language.toUpperCase()}
                </td>
                <td style={{ color: "var(--ink-2)" }}>
                  {q.difficultyB.toFixed(1)}
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link
                    to={`/translation-review/${q.id}`}
                    className="btn btn-primary"
                    style={{ fontSize: 12, textDecoration: "none" }}
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
          color: "var(--ink-3)",
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
      {selected.size > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "12px 16px",
            marginTop: 12,
            background: "var(--card)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
          }}
        >
          <strong>{selected.size} selected</strong>
          <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
          <span style={{ color: "var(--ink-3)" }}>Translate to:</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {langs.map((l) => (
              <label key={l.code} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={chosenLangs.has(l.code)}
                  onChange={() => setChosenLangs((s) => toggle(s, l.code))}
                />
                {l.name}
              </label>
            ))}
          </div>
          <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Overwrite existing
          </label>
          <button
            className="btn btn-primary"
            disabled={busy || chosenLangs.size === 0}
            onClick={startBatch}
          >
            {busy ? "Starting…" : `Translate → ${chosenLangs.size} lang(s)`}
          </button>
        </div>
      )}
    </AdminShell>
  );
}

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    background: "var(--card)",
    color: disabled ? "var(--ink-4)" : "var(--ink)",
    border: "1px solid var(--rule)",
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
  };
}
