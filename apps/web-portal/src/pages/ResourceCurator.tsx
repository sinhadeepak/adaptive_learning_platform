import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import {
  catalog,
  contentResources,
  type CatalogExam,
  type CatalogSubject,
  type CatalogTopic,
  type ResourceDetail,
  type YouTubeSearchResultItem,
} from "../lib/api";
import { useAuth, canReview } from "../lib/auth-provider";

// ─────────────────────────────────────────────────────────────────────────
// ResourceCurator (R-S1)
//
// Teacher tool for curating external content (YouTube clips, URLs, notes)
// against a topic. Search → pin → review pipeline. Lives at
// /content/resources and is the first surface that closes the
// diagnose-to-action loop on the student journey.
// ─────────────────────────────────────────────────────────────────────────

function formatDuration(secs: number | null | undefined): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViewCount(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function ResourceCurator() {
  const { user } = useAuth();
  const isReviewer = canReview(user?.role);

  // Topic cascade — Exam → Subject → Topic, scoped to caller's catalog.
  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [topics, setTopics] = useState<CatalogTopic[]>([]);
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [scopeError, setScopeError] = useState<string | null>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [searchLanguage, setSearchLanguage] = useState<"en" | "hi">("en");
  const [results, setResults] = useState<YouTubeSearchResultItem[] | null>(null);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Pin / pinned-list state
  const [pinned, setPinned] = useState<ResourceDetail[]>([]);
  const [pinningId, setPinningId] = useState<string | null>(null);

  // URL-paste fallback (works without YOUTUBE_DATA_API_KEY)
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasting, setPasting] = useState(false);

  // AI suggestions (LLM proposes search queries for the picked topic)
  type Suggestion = {
    query: string;
    rationale: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
  };
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestSource, setSuggestSource] = useState<"ai" | "heuristic" | null>(
    null,
  );
  const [suggestPromptId, setSuggestPromptId] = useState<string | null>(null);
  const [suggestPromptVersion, setSuggestPromptVersion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // ── Cascade fetches ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.myExams();
        if (!cancelled) setExams(list);
      } catch (e) {
        if (!cancelled) {
          setScopeError(
            e instanceof Error ? e.message : "Couldn't load exam assignments.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!examId) {
      setSubjects([]);
      setSubjectId("");
      setTopics([]);
      setTopicId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.mySubjects(examId);
        if (cancelled) return;
        setSubjects(list);
        setSubjectId("");
        setTopics([]);
        setTopicId("");
      } catch (e) {
        if (!cancelled) {
          setScopeError(
            e instanceof Error ? e.message : "Couldn't load subjects.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (!subjectId) {
      setTopics([]);
      setTopicId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.topics(subjectId);
        if (cancelled) return;
        setTopics(list);
        setTopicId("");
      } catch (e) {
        if (!cancelled) {
          setScopeError(
            e instanceof Error ? e.message : "Couldn't load topics.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  // ── Refresh pinned list whenever the topic changes ───────────────
  useEffect(() => {
    if (!topicId) {
      setPinned([]);
      setSuggestions(null);
      setSuggestSource(null);
      return;
    }
    setSuggestions(null);
    setSuggestSource(null);
    setSuggestError(null);
    void refreshPinned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  async function refreshPinned() {
    if (!topicId) return;
    try {
      const body = await contentResources.list({
        topic_id: topicId,
        scope: "mine",
      });
      setPinned(body.items);
    } catch (e) {
      // best-effort — surface as part of the search-error band
      setSearchError(e instanceof Error ? e.message : "Couldn't load pins.");
    }
  }

  // ── AI suggestions ──────────────────────────────────────────────
  const selectedTopic = topics.find((t) => t.id === topicId);
  const selectedExam = exams.find((e) => e.id === examId);

  async function fetchSuggestions() {
    if (!selectedTopic) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const body = await contentResources.aiSuggest({
        topic_id: selectedTopic.id,
        topic_title: selectedTopic.title,
        topic_description: selectedTopic.titleHi
          ? `${selectedTopic.title} (${selectedTopic.titleHi})`
          : selectedTopic.title,
        language: searchLanguage,
        exam: selectedExam?.code ?? undefined,
      });
      setSuggestions(body.queries);
      setSuggestSource(body.source);
      setSuggestPromptId(body.prompt_template_id);
      setSuggestPromptVersion(body.prompt_template_version);
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : "Couldn't load suggestions.");
    } finally {
      setSuggesting(false);
    }
  }

  function applySuggestion(q: string) {
    setQuery(q);
    // Run the search immediately so the teacher can pin within a click.
    setTimeout(() => void runSearch(), 0);
    // Scroll the search results into view on the next frame.
    setTimeout(() => {
      const el = document.getElementById("rs-search-results");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  // ── Search ──────────────────────────────────────────────────────
  async function runSearch(evt?: FormEvent) {
    evt?.preventDefault();
    setSearchError(null);
    setSearchNote(null);
    if (!query.trim()) return;
    setSearching(true);
    try {
      const body = await contentResources.search({
        q: query.trim(),
        max_results: 10,
        language: searchLanguage,
      });
      setResults(body.items);
      setQuotaRemaining(body.daily_quota_remaining ?? null);
      setSearchNote(body.note ?? null);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  // ── Pin from search result ──────────────────────────────────────
  async function pin(item: YouTubeSearchResultItem) {
    if (!topicId) {
      setSearchError("Pick a topic before pinning.");
      return;
    }
    setPinningId(item.video_id);
    try {
      await contentResources.pin({
        topic_id: topicId,
        resource_type: "youtube_video",
        external_id: item.video_id,
        url: `https://www.youtube.com/watch?v=${item.video_id}`,
        title: item.title,
        description: item.description ?? undefined,
        channel_name: item.channel_name ?? undefined,
        duration_seconds: item.duration_seconds ?? undefined,
        thumbnail_url: item.thumbnail_url ?? undefined,
        language: searchLanguage,
      });
      await refreshPinned();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Pin failed.");
    } finally {
      setPinningId(null);
    }
  }

  // ── Pin from pasted URL (works without API key) ─────────────────
  async function pinFromPaste(evt: FormEvent) {
    evt.preventDefault();
    if (!topicId) {
      setSearchError("Pick a topic before pinning.");
      return;
    }
    if (!pasteUrl.trim() || !pasteTitle.trim()) return;
    setPasting(true);
    try {
      await contentResources.pin({
        topic_id: topicId,
        resource_type: "youtube_video",
        url: pasteUrl.trim(),
        title: pasteTitle.trim(),
        language: searchLanguage,
      });
      setPasteUrl("");
      setPasteTitle("");
      await refreshPinned();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Pin failed.");
    } finally {
      setPasting(false);
    }
  }

  async function submit(rid: string) {
    try {
      await contentResources.submit(rid);
      await refreshPinned();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Submit failed.");
    }
  }

  async function review(rid: string, approve: boolean) {
    try {
      await contentResources.review(rid, { approve });
      await refreshPinned();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Review failed.");
    }
  }

  async function remove(rid: string) {
    try {
      await contentResources.remove(rid);
      await refreshPinned();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Remove failed.");
    }
  }

  return (
    <AppShell title="Content references">
      {scopeError && <Banner tone="danger">{scopeError}</Banner>}

      {/* ── Topic cascade ───────────────────────────────────── */}
      <section
        style={{
          background: "var(--bg-surface2, #101A30)",
          padding: 16,
          borderRadius: 8,
          marginBottom: 16,
          border: "1px solid var(--border-strong, rgba(255,255,255,0.11))",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "var(--text-faint, #7A8BAD)",
            marginBottom: 10,
          }}
        >
          Curate against a topic
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          <label style={{ fontSize: 12, color: "var(--text-secondary, #B8C5E0)" }}>
            <div style={{ marginBottom: 4 }}>Exam</div>
            <select
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              style={fieldStyle}
            >
              <option value="">— select exam —</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name || ex.code}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--text-secondary, #B8C5E0)" }}>
            <div style={{ marginBottom: 4 }}>Subject</div>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={!examId}
              style={fieldStyle}
            >
              <option value="">
                {examId ? "— select subject —" : "(pick exam first)"}
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--text-secondary, #B8C5E0)" }}>
            <div style={{ marginBottom: 4 }}>Topic</div>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={!subjectId}
              style={fieldStyle}
            >
              <option value="">
                {subjectId
                  ? topics.length === 0
                    ? "(no topics yet)"
                    : "— select topic —"
                  : "(pick subject first)"}
              </option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ── AI suggestions ─────────────────────────────────── */}
      <section
        style={{
          ...cardStyle,
          background:
            "linear-gradient(135deg, rgba(34,212,238,0.08), rgba(79,135,246,0.06))",
          border: "1px solid rgba(34,212,238,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "var(--color-ai, #22D4EE)",
              }}
            >
              ✨ AI search suggestions
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #B8C5E0)",
                marginTop: 2,
              }}
            >
              {topicId
                ? "Let the model propose 4-6 angles to search for, tailored to this topic."
                : "Pick a topic first; the model will draft search angles you can run with one click."}
            </div>
          </div>
          {suggestSource && suggestPromptId && (
            <div
              style={{
                fontSize: 10,
                color: "var(--text-faint, #7A8BAD)",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {suggestSource === "ai"
                ? `${suggestPromptId}@${suggestPromptVersion}`
                : "deterministic fallback"}
            </div>
          )}
        </div>

        {suggestError && (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              fontSize: 12,
              color: "var(--color-red, #F43F5E)",
              background: "rgba(244,63,94,0.08)",
              border: "1px solid rgba(244,63,94,0.25)",
              borderRadius: 6,
            }}
          >
            {suggestError}
          </div>
        )}

        {suggestions === null ? (
          <button
            type="button"
            onClick={() => void fetchSuggestions()}
            disabled={!topicId || suggesting}
            className="btn btn-primary"
            style={{ marginTop: 8 }}
          >
            {suggesting ? "Generating…" : "✨ Get AI suggestions"}
          </button>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 10,
                marginTop: 8,
              }}
            >
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  style={{
                    // Auto-themed surface — was hardcoded rgba(12,20,34,0.7)
                    // (a deep navy at 70% alpha) which rendered as a dark
                    // stripe on the light cyan-tinted panel in light mode.
                    background: "var(--bg-surface3)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--text-primary, #EEF2FF)",
                        flex: 1,
                      }}
                    >
                      "{s.query}"
                    </div>
                    <Pill
                      tone={
                        s.difficulty === "HARD"
                          ? "danger"
                          : s.difficulty === "MEDIUM"
                            ? "warning"
                            : "info"
                      }
                    >
                      {s.difficulty}
                    </Pill>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary, #B8C5E0)",
                      lineHeight: 1.45,
                    }}
                  >
                    {s.rationale}
                  </div>
                  <button
                    type="button"
                    onClick={() => applySuggestion(s.query)}
                    className="btn btn-ghost"
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      alignSelf: "flex-start",
                      marginTop: 2,
                    }}
                  >
                    Search this →
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void fetchSuggestions()}
                disabled={suggesting}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                {suggesting ? "Regenerating…" : "Regenerate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuggestions(null);
                  setSuggestSource(null);
                }}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                Clear
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── Search YouTube ──────────────────────────────────── */}
      <section id="rs-search-results" style={cardStyle}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "var(--text-faint, #7A8BAD)",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Search YouTube</span>
          {quotaRemaining !== null && (
            <span style={{ textTransform: "none", letterSpacing: 0 }}>
              quota: {quotaRemaining} searches left today
            </span>
          )}
        </div>

        <form
          onSubmit={runSearch}
          style={{ display: "flex", gap: 8, alignItems: "stretch" }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "Newton third law action reaction friction"'
            style={{ ...fieldStyle, flex: 1 }}
          />
          <select
            value={searchLanguage}
            onChange={(e) => setSearchLanguage(e.target.value as "en" | "hi")}
            style={{ ...fieldStyle, width: 120 }}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
          <button
            type="submit"
            disabled={!query.trim() || searching}
            className="btn btn-primary"
            style={{ minWidth: 110 }}
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {searchNote && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              fontSize: 12,
              color: "var(--color-amber, #F5A623)",
              background: "rgba(245,166,35,0.08)",
              border: "1px solid rgba(245,166,35,0.25)",
              borderRadius: 6,
            }}
          >
            {searchNote}
          </div>
        )}
        {searchError && <Banner tone="danger">{searchError}</Banner>}

        {results !== null && results.length === 0 && !searchNote && (
          <div
            style={{
              marginTop: 12,
              fontSize: 13,
              color: "var(--text-secondary, #B8C5E0)",
            }}
          >
            No matches. Try a more specific query (concept + grade level).
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 10,
            }}
          >
            {results.map((item) => {
              const alreadyPinned = pinned.some(
                (p) => p.external_id === item.video_id,
              );
              return (
                <div
                  key={item.video_id}
                  style={{
                    background: "var(--bg-surface3, #162038)",
                    borderRadius: 6,
                    border:
                      "1px solid var(--border, rgba(255,255,255,0.07))",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {item.thumbnail_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.thumbnail_url}
                      alt={item.title}
                      style={{
                        width: "100%",
                        aspectRatio: "16 / 9",
                        objectFit: "cover",
                      }}
                    />
                  )}
                  <div style={{ padding: 10, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--text-primary, #EEF2FF)",
                        marginBottom: 4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {item.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-faint, #7A8BAD)",
                        marginBottom: 8,
                      }}
                    >
                      {item.channel_name} · {formatDuration(item.duration_seconds)} ·{" "}
                      {formatViewCount(item.view_count)} views
                    </div>
                    <button
                      type="button"
                      onClick={() => pin(item)}
                      disabled={
                        !topicId || pinningId === item.video_id || alreadyPinned
                      }
                      className={alreadyPinned ? "btn btn-ghost" : "btn btn-primary"}
                      style={{ width: "100%", padding: "6px 12px", fontSize: 12 }}
                    >
                      {alreadyPinned
                        ? "✓ Already pinned"
                        : pinningId === item.video_id
                          ? "Pinning…"
                          : "Pin to topic"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Paste URL fallback ─────────────────────────────── */}
      <section style={cardStyle}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "var(--text-faint, #7A8BAD)",
            marginBottom: 10,
          }}
        >
          Or paste a YouTube URL
        </div>
        <form
          onSubmit={pinFromPaste}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            style={{ ...fieldStyle, flex: "2 1 320px" }}
          />
          <input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Title for the student"
            style={{ ...fieldStyle, flex: "1 1 220px" }}
          />
          <button
            type="submit"
            disabled={
              !pasteUrl.trim() || !pasteTitle.trim() || !topicId || pasting
            }
            className="btn btn-primary"
          >
            {pasting ? "Pinning…" : "Pin URL"}
          </button>
        </form>
      </section>

      {/* ── Pinned list ────────────────────────────────────── */}
      <section style={cardStyle}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "var(--text-faint, #7A8BAD)",
            marginBottom: 10,
          }}
        >
          Pinned to this topic ({pinned.length})
        </div>
        {pinned.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #B8C5E0)",
              opacity: 0.8,
            }}
          >
            {topicId
              ? "Nothing pinned yet. Search above or paste a URL."
              : "Pick a topic above to see its pinned references."}
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {pinned.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: 10,
                  background: "var(--bg-surface3, #162038)",
                  borderRadius: 6,
                  alignItems: "center",
                  border: "1px solid var(--border, rgba(255,255,255,0.07))",
                }}
              >
                {p.thumbnail_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.thumbnail_url}
                    alt={p.title}
                    style={{
                      width: 88,
                      height: 50,
                      objectFit: "cover",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary, #EEF2FF)",
                    }}
                  >
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {p.title}
                    </a>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-faint, #7A8BAD)",
                      marginTop: 2,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {p.channel_name && <span>{p.channel_name}</span>}
                    {p.duration_seconds && (
                      <span>· {formatDuration(p.duration_seconds)}</span>
                    )}
                    <span>· lang: {p.language.toUpperCase()}</span>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Pill
                    tone={
                      p.status === "PUBLISHED"
                        ? "success"
                        : p.status === "REJECTED"
                          ? "danger"
                          : p.status === "IN_REVIEW"
                            ? "warning"
                            : "muted"
                    }
                  >
                    {p.status}
                  </Pill>
                  {p.status === "DRAFT" && (
                    <button
                      type="button"
                      onClick={() => submit(p.id)}
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "4px 10px" }}
                    >
                      Submit for review
                    </button>
                  )}
                  {isReviewer &&
                    (p.status === "DRAFT" || p.status === "IN_REVIEW") && (
                      <>
                        <button
                          type="button"
                          onClick={() => review(p.id, true)}
                          className="btn btn-primary"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => review(p.id, false)}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

const fieldStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-surface3, #162038)",
  color: "var(--text-primary, #EEF2FF)",
  border: "1px solid var(--border-strong, rgba(255,255,255,0.11))",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-surface2, #101A30)",
  padding: 16,
  borderRadius: 8,
  marginBottom: 16,
  border: "1px solid var(--border-strong, rgba(255,255,255,0.11))",
};
