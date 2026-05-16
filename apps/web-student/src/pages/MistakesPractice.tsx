// Mistake Replay — first-class practice surface (Feature F1).
//
// Promoted from a single button on /analysis. Three tabs:
//   - All recent: most recent wrong-answered items across all topics.
//   - Last 7 days: only mistakes from the last week.
//   - By topic: pick a topic chip, drill that one.
//
// All variants POST /api/v1/quiz/sessions/start-mistake-replay and route
// into the standard /quiz/:id runner. Endpoint accepts
// `{ userId, topicId?, limit?, sinceDays? }` — already shipped + extended
// today with sinceDays for the "Last 7 days" tab.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";

type Tab = "recent" | "week" | "topic";

const LIMIT_OPTIONS = [10, 20, 30] as const;
type Limit = (typeof LIMIT_OPTIONS)[number];

interface WeakTopic {
  topicId: string;
  title: string;
  ewa: number;
  n: number;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface ReplayResponse {
  sessionId: string;
  mode: string;
  itemCount: number;
  topicId?: string;
  replayKind: string;
}

export function MistakesPractice() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("recent");
  const [limit, setLimit] = useState<Limit>(10);
  const [topicId, setTopicId] = useState<string>("");
  const [topics, setTopics] = useState<WeakTopic[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull mastery list once; surface weakest 12 as drill targets for the
  // "By topic" tab. Catalog title-resolution lifted from Analysis.tsx.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!r.ok) {
          if (alive) setTopics([]);
          return;
        }
        const body = (await r.json()) as MasteryListResponse;
        const ordered = body.topics
          .filter((t) => t.n > 0)
          .sort((a, b) => a.ewa - b.ewa)
          .slice(0, 12);
        // Resolve titles in parallel; fall back to truncated id.
        const titled = await Promise.all(
          ordered.map(async (t) => {
            try {
              const tr = await auth.fetch(`/api/v1/catalog/topics/${t.topicId}`);
              if (tr.ok) {
                const tj = (await tr.json()) as { title: string };
                return { ...t, title: tj.title };
              }
            } catch {
              /* fall through */
            }
            return { ...t, title: `Topic ${t.topicId.slice(0, 8)}` };
          }),
        );
        if (alive) setTopics(titled);
      } catch {
        if (alive) setTopics([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const canStart = useMemo(() => {
    if (!user || submitting) return false;
    if (tab === "topic" && !topicId) return false;
    return true;
  }, [user, submitting, tab, topicId]);

  async function start() {
    if (!user || !canStart) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { userId: user.id, limit };
      if (tab === "week") body.sinceDays = 7;
      if (tab === "topic" && topicId) body.topicId = topicId;
      const r = await auth.fetch(
        `/api/v1/quiz/sessions/start-mistake-replay`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (r.status === 422) {
        setError(
          tab === "week"
            ? "No mistakes in the last 7 days — try All recent."
            : tab === "topic"
              ? "No mistakes in this topic yet. Drill it first, then come back."
              : "No wrong-answered questions yet — answer some practice items first.",
        );
        return;
      }
      if (!r.ok) {
        setError(`Couldn't start replay (HTTP ${r.status}).`);
        return;
      }
      const out = (await r.json()) as ReplayResponse;
      navigate(`/quiz/${out.sessionId}`);
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Drill your mistakes"
      actions={
        <Link to="/practice" className="pg-btn pg-btn-ghost">
          ← Practice
        </Link>
      }
    >
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Drill your mistakes</h1>
            <p className="pg-header-sub">
              Re-attempt the questions you got wrong. The session pre-loads
              your most recent mistakes — filter by recency or by a single
              topic, then pick how many items you want to drill.
            </p>
          </div>
        </header>

        <div className="pg-tabs" role="tablist">
          {(
            [
              ["recent", "All recent"],
              ["week", "Last 7 days"],
              ["topic", "By topic"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`pg-tab${tab === t ? " on" : ""}`}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* By-topic chip-row — visible only on the topic tab. */}
        {tab === "topic" && (
          <section className="pg-section" style={{ marginBottom: 16 }}>
            <h2 className="pg-section-title">
              Pick a topic
              <span className="pg-section-title-sub">
                weakest first · mastery shown
              </span>
            </h2>
            {topics === null ? (
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Loading topics…
              </p>
            ) : topics.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                No topics with attempted questions yet. Practice a few
                topics first, then come back to drill mistakes per-topic.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {topics.map((t) => {
                  const on = topicId === t.topicId;
                  return (
                    <button
                      key={t.topicId}
                      type="button"
                      className={`pg-chip${on ? " on" : ""}`}
                      onClick={() => setTopicId(t.topicId)}
                      title={`${t.n} attempts · ${Math.round(t.ewa * 100)}% mastery`}
                    >
                      {t.title}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          marginLeft: 6,
                          color: on
                            ? "var(--info)"
                            : "var(--ink-4)",
                        }}
                      >
                        {Math.round(t.ewa * 100)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Length selector — always visible. */}
        <section className="pg-section" style={{ marginBottom: 16 }}>
          <h2 className="pg-section-title">
            How many items?
            <span className="pg-section-title-sub">
              capped at 30 per session
            </span>
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            {LIMIT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`pg-chip${limit === n ? " on" : ""}`}
                onClick={() => setLimit(n)}
              >
                {n} items
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div style={{ marginBottom: 14 }}>
            <Banner tone="warning" role="alert">
              {error}
            </Banner>
          </div>
        )}

        {/* Start CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 16,
            background:
              "linear-gradient(135deg, rgba(245,166,35,0.10), rgba(245,166,35,0.02))",
            border: "1px solid rgba(245,166,35,0.30)",
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 24 }}>🎯</span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ink)",
                marginBottom: 2,
              }}
            >
              {tab === "recent"
                ? `Replay your ${limit} most recent mistakes`
                : tab === "week"
                  ? `Replay mistakes from the last 7 days (up to ${limit})`
                  : topicId
                    ? `Replay ${limit} mistakes from ${
                        topics?.find((t) => t.topicId === topicId)?.title ??
                        "this topic"
                      }`
                    : `Pick a topic above, then start`}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {tab === "topic" && !topicId
                ? "Select a topic chip to enable Start."
                : "Items load once; you drill them all then submit."}
            </div>
          </div>
          <button
            type="button"
            className="pg-btn pg-btn-primary"
            onClick={start}
            disabled={!canStart}
          >
            {submitting ? "Starting…" : "▶ Start drill"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}