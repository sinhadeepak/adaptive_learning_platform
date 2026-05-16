import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";

interface SearchHit {
  type: "topic" | "lesson" | "question";
  id: string;
  title: string;
  subtitle?: string | null;
  path?: string | null;
  score?: number | null;
}

interface SearchResults {
  results: SearchHit[];
  total: number;
  page: number;
  perPage: number;
  tookMs?: number;
}

interface TypeaheadHit {
  type: "topic" | "lesson" | "question";
  id: string;
  title: string;
  path?: string | null;
}

const RECENTS_KEY = "alp.search.recents";
const RECENTS_MAX = 10;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => typeof s === "string").slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

function saveRecents(list: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_MAX)));
  } catch {
    /* quota exceeded — silent */
  }
}

export function Search() {
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [suggestions, setSuggestions] = useState<TypeaheadHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function pushRecent(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setRecents((prev) => {
      // Move-to-front; dedupe case-insensitively.
      const next = [trimmed, ...prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())]
        .slice(0, RECENTS_MAX);
      saveRecents(next);
      return next;
    });
  }

  function removeRecent(q: string) {
    setRecents((prev) => {
      const next = prev.filter((r) => r !== q);
      saveRecents(next);
      return next;
    });
  }

  function clearRecents() {
    setRecents([]);
    saveRecents([]);
  }

  // Typeahead — debounce 300ms.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (committed || !query) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await auth.fetch(`/api/v1/search/typeahead?q=${encodeURIComponent(query)}`);
        if (res.ok) setSuggestions((await res.json()) as TypeaheadHit[]);
      } catch {
        /* typeahead is non-critical — silent on fail */
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, committed]);

  // Full search — fires on submit.
  useEffect(() => {
    if (!committed) {
      setResults(null);
      return;
    }
    setError(null);
    (async () => {
      try {
        const res = await auth.fetch(`/api/v1/search?q=${encodeURIComponent(committed)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setResults((await res.json()) as SearchResults);
      } catch {
        setError("Search is unavailable right now.");
      }
    })();
  }, [committed]);

  function submit() {
    setCommitted(query);
    setSuggestions([]);
    pushRecent(query);
  }

  function searchFor(q: string) {
    setQuery(q);
    setCommitted(q);
    setSuggestions([]);
    pushRecent(q);
  }

  function clear() {
    setQuery("");
    setCommitted(null);
    setResults(null);
    setSuggestions([]);
    inputRef.current?.focus();
  }

  return (
    <AppShell title="Search">
      <h1 className="page-greeting">Find a topic, exam, or lesson</h1>
      <p className="page-subhead">
        Bilingual search — type in English, Hindi (Devanagari), or Hinglish.
      </p>

      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          className="search-input"
          placeholder="Search topics, subjects, exams…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (committed) setCommitted(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: "var(--ink-3)",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {error ? (
        <div style={{ marginTop: "var(--sp-3)" }}>
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        </div>
      ) : null}

      {!committed && suggestions.length > 0 ? (
        <div className="suggestions" role="listbox" aria-label="Suggestions">
          {suggestions.map((s) => (
            <Link
              key={s.id}
              to={s.path ?? `/catalog/topic/${s.id}`}
              role="option"
              aria-selected="false"
              className="suggestion-item"
            >
              <span className="suggestion-icon" aria-hidden>
                📚
              </span>
              {s.title}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Recent searches — localStorage-backed, device-specific. Only shown
          when the input is empty (no typeahead, no committed query) so they
          don't clutter the active search experience. */}
      {!query && !committed && recents.length > 0 ? (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "var(--sp-2)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Recent searches
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={clearRecents}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--ink-3)",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Clear
            </button>
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {recents.map((r) => (
              <li
                key={r}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--rule)",
                  background: "var(--card-1)",
                }}
              >
                <span aria-hidden style={{ color: "var(--ink-3)", fontSize: 14 }}>
                  ↺
                </span>
                <button
                  type="button"
                  onClick={() => searchFor(r)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: 0,
                    color: "var(--ink)",
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  {r}
                </button>
                <button
                  type="button"
                  onClick={() => removeRecent(r)}
                  aria-label={`Remove "${r}" from recent searches`}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "var(--ink-3)",
                    fontSize: 14,
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {committed && results !== null ? (
        <section style={{ marginTop: "var(--sp-5)" }}>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: 13,
              margin: "0 0 var(--sp-3)",
            }}
          >
            {results.total} result{results.total === 1 ? "" : "s"}
            {results.tookMs !== undefined ? ` · ${results.tookMs} ms` : ""}
          </p>
          {results.results.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-title">No matches</div>
              <p>Nothing matches "{committed}". Try different keywords.</p>
            </div>
          ) : (
            <ul
              className="row-list"
              style={{ display: "flex", flexDirection: "column", gap: 8, padding: 0, margin: 0 }}
            >
              {results.results.map((r) => (
                <li key={r.id} style={{ listStyle: "none" }}>
                  <Link
                    to={r.path ?? `/catalog/topic/${r.id}`}
                    className="row-link"
                    aria-label={`Open ${r.title}`}
                  >
                    <div className="row-link-body">
                      <p className="row-link-title">{r.title}</p>
                      {r.subtitle ? <p className="row-link-meta">{r.subtitle}</p> : null}
                    </div>
                    <div className="row-link-trail">
                      {r.score !== null && r.score !== undefined ? (
                        <span style={{ color: "var(--ink-3)", fontSize: 11 }}>
                          match {Math.round((r.score / 10) * 100)}%
                        </span>
                      ) : null}
                      <span className="chevron" aria-hidden>
                        ›
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}