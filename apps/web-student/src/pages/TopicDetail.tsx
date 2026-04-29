import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";
import { AITutorChat } from "../components/AITutorChat";
import { blockedLabel, summariseGate, type GateResponse } from "../lib/prereq_gate";

// ─────────────────────────────────────────────────────────────────────────
// Topic Detail — AI Practice prep page.
// Reached from study-map topic rows or catalog drill-downs. Aligns with
// the AI-first dark-theme dashboards (master / exam / study-map).
//
// Layout:
//   1. AI hero with topic name + AI pill + tier badge + CTA row
//   2. Stats row — questions, sessions, mastery %, last practiced
//   3. AI recommends banner if this is a weak topic
//   4. About / Learning objectives / Prerequisites cards
//   5. Recent activity (placeholder until per-topic attempt history exists)
// ─────────────────────────────────────────────────────────────────────────

interface Topic {
  id: string;
  subjectId: string;
  title: string;
  description?: string | null;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
  objectives: string[];
  prerequisites: Array<{ topicId: string; title: string }>;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

export function TopicDetail() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [mastery, setMastery] = useState<{ ewa: number; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [savedHere, setSavedHere] = useState<
    Array<{ questionId: string; stem: string | null; createdAt: string }>
  >([]);
  // Sprint 26 (P4-S26) — prereq gate state.
  const [gate, setGate] = useState<GateResponse | null>(null);

  useEffect(() => {
    if (!topicId) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/topics/${topicId}`);
        if (r.status === 404) {
          setError("Topic not found.");
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setTopic((await r.json()) as Topic);
      } catch {
        setError("We couldn't load this topic.");
      }
    })();
  }, [topicId]);

  // Fetch user mastery for this topic.
  useEffect(() => {
    if (!user || !topicId) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!r.ok) return;
        const body = (await r.json()) as MasteryListResponse;
        const m = body.topics.find((t) => t.topicId === topicId);
        if (m) setMastery({ ewa: m.ewa, n: m.n });
      } catch {
        /* swallow */
      }
    })();
  }, [user, topicId]);

  // Sprint 26 (P4-S26) — prereq gate fetch. Soft-fail: if the request errors
  // the pill is omitted; the page still renders.
  useEffect(() => {
    if (!user || !topicId) return;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/catalog/topics/${topicId}/gate?userId=${user.id}`,
        );
        if (!r.ok) return;
        setGate((await r.json()) as GateResponse);
      } catch {
        /* swallow — pill hidden */
      }
    })();
  }, [user, topicId]);

  // Filter the user's bookmarks to this topic so the page can surface a
  // "Saved questions for this topic" section without a dedicated endpoint.
  useEffect(() => {
    if (!user || !topicId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/profile/bookmarks`);
        if (!r.ok) return;
        const body = (await r.json()) as {
          items: Array<{
            questionId: string;
            topicId: string | null;
            stem: string | null;
            createdAt: string;
          }>;
        };
        if (!alive) return;
        setSavedHere(
          body.items
            .filter((b) => b.topicId === topicId)
            .map((b) => ({ questionId: b.questionId, stem: b.stem, createdAt: b.createdAt })),
        );
      } catch {
        /* swallow */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, topicId]);

  async function removeSaved(questionId: string) {
    setSavedHere((prev) => prev.filter((b) => b.questionId !== questionId));
    await auth.fetch(`/api/v1/profile/bookmarks/${questionId}`, { method: "DELETE" });
  }

  async function startQuiz() {
    if (!topicId || !user || starting) return;
    setError(null);
    setStarting(true);
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, userId: user.id, mode: "PRACTICE" }),
      });
      if (r.status === 422) {
        setError("This topic doesn't have any practice questions yet.");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { sessionId: string };
      navigate(`/quiz/${body.sessionId}`);
    } catch {
      setError("We couldn't start the quiz. Try again in a moment.");
    } finally {
      setStarting(false);
    }
  }

  const backAction = (
    <Link to="/catalog" className="topbar-back">
      ← Catalog
    </Link>
  );

  if (error && !topic) {
    return (
      <AppShell title="Topic" actions={backAction}>
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      </AppShell>
    );
  }

  if (!topic) {
    return (
      <AppShell title="Topic" actions={backAction}>
        <SkeletonRows count={3} />
      </AppShell>
    );
  }

  const masteryPct = mastery ? Math.round(mastery.ewa * 100) : null;
  const bucket =
    mastery === null
      ? "not-started"
      : mastery.ewa >= 0.7
        ? "strong"
        : mastery.ewa >= 0.4
          ? "developing"
          : "weak";
  const isWeak = bucket === "weak";

  return (
    <AppShell title={topic.title} actions={backAction}>
      {/* ── Zone 1: AI hero ─────────────────────────────────────── */}
      <section className="topic-hero" aria-label={`${topic.title} overview`}>
        <div className="topic-hero-left">
          <div className="topic-hero-tag">
            <span className="ai-pill">◈ AI ADAPTIVE PRACTICE</span>
            <Pill tone={topic.tier === "PREMIUM" ? "warning" : "muted"}>
              {topic.tier === "PREMIUM" ? "Premium" : "Free"}
            </Pill>
            {mastery !== null ? (
              <Pill
                tone={
                  bucket === "strong"
                    ? "success"
                    : bucket === "developing"
                      ? "info"
                      : "danger"
                }
              >
                {bucket === "strong"
                  ? "Strong"
                  : bucket === "developing"
                    ? "Developing"
                    : "Weak"}
              </Pill>
            ) : null}
          </div>
          <h1 className="topic-hero-title">{topic.title}</h1>
          {/* Sprint 26 (P4-S26) — prereq gate pill. Hidden when no prereqs. */}
          {(() => {
            const state = summariseGate(gate);
            if (state.kind === "hidden") return null;
            if (state.kind === "ready") {
              return (
                <p
                  className="prereq-pill prereq-pill-ready"
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: 12,
                    background: "var(--color-green, #10C47A)",
                    color: "#fff",
                    fontSize: 13,
                    margin: "8px 0",
                  }}
                >
                  ✓ You're ready for this topic
                </p>
              );
            }
            return (
              <Link
                to={`/topics/${state.first.topicId}`}
                className="prereq-pill prereq-pill-blocked"
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 12,
                  background: "var(--color-amber, #F5A623)",
                  color: "#fff",
                  fontSize: 13,
                  margin: "8px 0",
                  textDecoration: "none",
                }}
              >
                ⚠ {blockedLabel(state)} →
              </Link>
            );
          })()}
          <p className="topic-hero-sub">
            {topic.description ?? (
              <>
                Practice this topic with the IRT engine. Each session adapts
                to your current ability so the next item is always within
                reach.
              </>
            )}
          </p>
          <div className="topic-hero-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={startQuiz}
              disabled={starting}
            >
              {starting ? "Starting…" : "◈ Start AI practice"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled
              title="Lessons land in a future sprint"
            >
              Read lesson notes
            </button>
          </div>
        </div>
      </section>

      {/* ── Zone 2: Stats row ───────────────────────────────────── */}
      <section className="topic-stats" aria-label="Topic stats">
        <div className="topic-stat">
          <div
            className="topic-stat-num"
            style={{ color: "var(--color-blue)" }}
          >
            {topic.questionCount}
          </div>
          <div className="topic-stat-lbl">Questions</div>
          <div className="topic-stat-foot">
            in this topic's bank
          </div>
        </div>
        <div className="topic-stat">
          <div
            className="topic-stat-num"
            style={{
              color:
                bucket === "strong"
                  ? "var(--color-green)"
                  : bucket === "developing"
                    ? "var(--color-blue)"
                    : bucket === "weak"
                      ? "var(--color-red)"
                      : "var(--text-muted)",
            }}
          >
            {masteryPct !== null ? `${masteryPct}%` : "—"}
          </div>
          <div className="topic-stat-lbl">Mastery (EWA)</div>
          <div className="topic-stat-foot">
            {mastery === null ? "Not started" : "Recency-weighted"}
          </div>
        </div>
        <div className="topic-stat">
          <div
            className="topic-stat-num"
            style={{ color: "var(--color-amber)" }}
          >
            {mastery?.n ?? 0}
          </div>
          <div className="topic-stat-lbl">Sessions</div>
          <div className="topic-stat-foot">
            {mastery && mastery.n > 0 ? "completed" : "no attempts yet"}
          </div>
        </div>
        <div className="topic-stat">
          <div
            className="topic-stat-num"
            style={{ color: "var(--color-ai)" }}
          >
            {mastery
              ? bucket === "weak"
                ? `+${(2.5 + (1 - mastery.ewa) * 2).toFixed(1)}`
                : bucket === "developing"
                  ? `+${(0.8 + (1 - mastery.ewa) * 1.2).toFixed(1)}`
                  : "Maintain"
              : "—"}
          </div>
          <div className="topic-stat-lbl">Pts to gain</div>
          <div className="topic-stat-foot">est. per 10-min round</div>
        </div>
      </section>

      {error ? (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <Banner tone="warning" role="alert">
            {error}
          </Banner>
        </div>
      ) : null}

      {/* ── Zone 3: AI recommends ───────────────────────────────── */}
      {isWeak && mastery ? (
        <button
          type="button"
          onClick={startQuiz}
          disabled={starting}
          className="reco-banner"
          style={{
            marginTop: "var(--sp-4)",
            border: "none",
            background: "rgba(34,212,238,0.04)",
            cursor: starting ? "default" : "pointer",
            width: "100%",
            textAlign: "left",
            font: "inherit",
            color: "inherit",
            padding: 14,
          }}
        >
          <div className="reco-icon">⚡</div>
          <div className="reco-body">
            <div className="reco-eyebrow">◈ AI RECOMMENDS · RIGHT NOW</div>
            <div className="reco-title">
              This is one of your weakest topics — short focused round
            </div>
            <div className="reco-sub">
              Mastery is at {masteryPct}%. A 10-minute round on this topic
              moves your readiness more than any other action right now.
            </div>
            <div className="reco-impact">
              ▲ Est. +{(2.5 + (1 - mastery.ewa) * 2).toFixed(1)} readiness pts ·
              ~10 minutes
            </div>
          </div>
          <span className="btn-ai" style={{ flexShrink: 0 }}>
            {starting ? "Starting…" : "Start Now →"}
          </span>
        </button>
      ) : null}

      {/* ── Zone 4: About / Objectives / Prerequisites ──────────── */}
      <div style={{ marginTop: "var(--sp-5)" }}>
        {topic.description ? (
          <section className="topic-section">
            <h2 className="topic-section-title">About this topic</h2>
            <p className="topic-section-body">{topic.description}</p>
          </section>
        ) : null}

        {topic.objectives.length > 0 ? (
          <section className="topic-section">
            <h2 className="topic-section-title">Learning objectives</h2>
            <ol className="topic-objectives">
              {topic.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          </section>
        ) : null}

        {topic.prerequisites.length > 0 ? (
          <section className="topic-section">
            <h2 className="topic-section-title">Prerequisites</h2>
            <ul className="row-list">
              {topic.prerequisites.map((p) => (
                <li key={p.topicId}>
                  <Link
                    to={`/catalog/topic/${p.topicId}`}
                    className="row-link"
                    aria-label={`Open prerequisite ${p.title}`}
                  >
                    <div className="row-link-body">
                      <p className="row-link-title">{p.title}</p>
                    </div>
                    <span className="chevron" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Saved questions for this topic — pulled from /profile/bookmarks
            and filtered client-side. Only renders when the student has at
            least one saved question on this topic. */}
        {savedHere.length > 0 ? (
          <section className="topic-section">
            <h2 className="topic-section-title">
              ★ Saved questions on this topic
            </h2>
            <ol
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {savedHere.slice(0, 5).map((b) => (
                <li
                  key={b.questionId}
                  style={{
                    background: "var(--bg-surface-1)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <span style={{ color: "var(--color-amber)", fontSize: 16, lineHeight: "20px" }}>★</span>
                  <span
                    style={{
                      flex: 1,
                      color: "var(--text-primary)",
                      fontSize: 13,
                      lineHeight: 1.45,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {b.stem ?? `Question #${b.questionId.slice(0, 8)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSaved(b.questionId)}
                    aria-label="Remove bookmark"
                    title="Remove bookmark"
                    style={{
                      background: "transparent",
                      border: 0,
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      fontSize: 14,
                      padding: 0,
                      lineHeight: "20px",
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            {savedHere.length > 5 ? (
              <div style={{ marginTop: 10, fontSize: 12 }}>
                <Link to="/bookmarks" className="auth-link">
                  View all {savedHere.length} saved →
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Zone 5: Recent activity — empty state until per-topic attempt history exists */}
        <section className="topic-section">
          <h2 className="topic-section-title">Stuck on something?</h2>
          <p className="topic-section-body">
            Ask the AI tutor a free-form question about {topic.title}. Replies
            are grounded in the topic + your current mastery level.
          </p>
          <AITutorChat topicId={topic.id} topicTitle={topic.title} />
        </section>

        <section className="topic-section">
          <h2 className="topic-section-title">Recent activity</h2>
          {mastery && mastery.n > 0 ? (
            <p className="topic-section-body">
              You've completed <strong>{mastery.n}</strong> session
              {mastery.n === 1 ? "" : "s"} on this topic. Mastery is at{" "}
              <strong>{masteryPct}%</strong>. Per-attempt history will appear
              here once the analytics service exposes the per-topic timeline.
            </p>
          ) : (
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                margin: 0,
              }}
            >
              No attempts yet — your first quiz attempt will appear here.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
