import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, tokens } from "@alp/design-system";
import { auth } from "../lib/api";

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

  // Focus the input on mount.
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
        // typeahead is non-critical — silent on fail
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
    <main style={styles.page}>
      <header style={styles.header}>
        <Link to="/home" style={styles.backLink}>‹ Home</Link>
      </header>

      <section style={styles.section}>
        <div style={styles.searchRow}>
          <span style={{ marginRight: tokens.spacing[2] }} aria-hidden>🔍</span>
          <input
            ref={inputRef}
            type="search"
            role="searchbox"
            placeholder="Search topics, subjects, exams…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (committed) setCommitted(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            style={styles.searchInput}
          />
          {query ? (
            <button type="button" onClick={clear} style={styles.clearBtn} aria-label="Clear search">×</button>
          ) : null}
        </div>

        {error ? (
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        ) : null}

        {!committed && suggestions.length > 0 ? (
          <div style={styles.suggestionsPanel} role="listbox">
            <p style={styles.suggestionsHeading}>Suggestions</p>
            {suggestions.map((s) => (
              <Link
                key={s.id}
                to={s.path ?? `/catalog/topic/${s.id}`}
                role="option"
                aria-selected="false"
                style={styles.suggestion}
              >
                📚 {s.title}
              </Link>
            ))}
          </div>
        ) : null}

        {committed && results !== null ? (
          <>
            <p style={styles.meta}>
              {results.total} result{results.total === 1 ? "" : "s"}
              {results.tookMs !== undefined ? ` · ${results.tookMs} ms` : ""}
            </p>
            {results.results.length === 0 ? (
              <p style={{ color: tokens.colors.text.muted }}>
                No matches for "{committed}". Try different keywords.
              </p>
            ) : (
              <ul style={styles.resultsList}>
                {results.results.map((r) => (
                  <li key={r.id} style={{ listStyle: "none" }}>
                    <Link to={r.path ?? `/catalog/topic/${r.id}`} style={styles.resultCard}>
                      <div>
                        <div style={styles.resultTitle}>{r.title}</div>
                        {r.subtitle ? <p style={styles.resultSubtitle}>{r.subtitle}</p> : null}
                      </div>
                      {r.score !== null && r.score !== undefined ? (
                        <span style={styles.score}>match {Math.round((r.score / 10) * 100)}%</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: tokens.colors.surface.secondary, fontFamily: tokens.typography.family.ui },
  header: {
    background: tokens.colors.surface.primary,
    borderBottom: `1px solid ${tokens.colors.border.default}`,
    height: 56,
    display: "flex",
    alignItems: "center",
    padding: `0 ${tokens.spacing[6]}px`,
  },
  backLink: { color: tokens.colors.text.secondary, textDecoration: "none", fontSize: tokens.typography.scale.body.size },
  section: { maxWidth: 720, margin: "0 auto", padding: tokens.spacing[5], boxSizing: "border-box" },
  searchRow: {
    display: "flex",
    alignItems: "center",
    background: tokens.colors.surface.primary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.input,
    padding: `0 ${tokens.spacing[3]}px`,
    height: 40,
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontFamily: tokens.typography.family.ui,
    fontSize: tokens.typography.scale.body.size,
    color: tokens.colors.text.primary,
  },
  clearBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 18,
    color: tokens.colors.text.muted,
    padding: `0 ${tokens.spacing[1]}px`,
  },
  suggestionsPanel: {
    marginTop: tokens.spacing[3],
    padding: tokens.spacing[3],
    background: tokens.colors.surface.primary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.panel,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacing[1],
  },
  suggestionsHeading: {
    margin: `0 0 ${tokens.spacing[1]}px 0`,
    fontSize: tokens.typography.scale.hint.size,
    color: tokens.colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  suggestion: {
    padding: tokens.spacing[2],
    color: tokens.colors.text.primary,
    textDecoration: "none",
    borderRadius: tokens.radius.button,
    fontSize: tokens.typography.scale.body.size,
  },
  meta: {
    margin: `${tokens.spacing[4]}px 0 ${tokens.spacing[3]}px 0`,
    color: tokens.colors.text.secondary,
    fontSize: tokens.typography.scale.body.size,
  },
  resultsList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: tokens.spacing[2] },
  resultCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacing[4],
    background: tokens.colors.surface.primary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.card,
    textDecoration: "none",
    color: tokens.colors.text.primary,
  },
  resultTitle: { fontWeight: 500, fontSize: tokens.typography.scale.body.size },
  resultSubtitle: {
    margin: `${tokens.spacing[1]}px 0 0 0`,
    color: tokens.colors.text.muted,
    fontSize: tokens.typography.scale.hint.size,
  },
  score: { color: tokens.colors.text.muted, fontSize: tokens.typography.scale.hint.size },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.danger.bg,
    color: tokens.colors.semantic.danger.fg,
    marginTop: tokens.spacing[3],
    fontSize: tokens.typography.scale.body.size,
  },
};
