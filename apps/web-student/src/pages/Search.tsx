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

export function Search() {
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [suggestions, setSuggestions] = useState<TypeaheadHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
              color: "var(--text-muted)",
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

      {committed && results !== null ? (
        <section style={{ marginTop: "var(--sp-5)" }}>
          <p
            style={{
              color: "var(--text-secondary)",
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
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
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
