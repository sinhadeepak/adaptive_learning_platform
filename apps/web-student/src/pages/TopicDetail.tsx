// TopicDetail — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + subtitle + back action) → Aurora
// hero card with mastery ring, AI/tier/bucket chips, primary CTA row →
// Watch & Learn shelf → 4-up stats strip → AI insight (weak only) →
// Time-to-mastery + Prerequisite map + Video engagement → About /
// Objectives / Prerequisites / Saved-here / Tutor chat / Recent
// activity sections. Reached from study-map topic rows or catalog
// drill-downs.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AIInsightCard,
  Button,
  Card,
  ProgressRing,
  StatCard,
  Tag,
} from "@alp/ui";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { AITutorChat } from "../components/AITutorChat";
import { ResourceShelf } from "../components/ResourceShelf";
import { blockedLabel, summariseGate, type GateResponse } from "../lib/prereq_gate";
// Phase 7 (P7-A1) — per-topic notes + importance pill.
import { ImportancePill, type ImportanceMeta } from "../components/stats";
import { notes as notesApi, importance as importanceApi } from "../lib/notes-api";
// Phase 1C — time-to-mastery + mistake-replay.
import { TimeToMasteryCard, MistakeReplayButton } from "../components/phase1c";
// Phase 1D-2 — prerequisite map.
import { PrerequisiteMap } from "../components/PrerequisiteMap";
// Phase 1D-6 — video engagement card.
import { VideoEngagementCard } from "../components/phase1d";

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
  // Phase 7 (P7-A1) — note editor + importance pill.
  const [noteDraft, setNoteDraft] = useState<string>("");
  const [noteOriginal, setNoteOriginal] = useState<string>("");
  const [noteSavedAt, setNoteSavedAt] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<boolean>(false);
  // Difficulty picker for the "Practice this topic" button. `null`
  // means closed; the value is the pre-selected band when opening so
  // the modal can pre-highlight (e.g. Easy when the user re-opens
  // after picking Easy last time).
  const [difficultyPickerOpen, setDifficultyPickerOpen] = useState(false);
  const [importance, setImportance] = useState<ImportanceMeta | null>(null);

  // Load note + importance once topic is known.
  useEffect(() => {
    if (!topicId || !user?.id) return;
    let cancelled = false;
    notesApi
      .get(user.id, topicId)
      .then((n) => {
        if (cancelled) return;
        const md = n?.contentMd ?? "";
        setNoteOriginal(md);
        setNoteDraft(md);
        setNoteSavedAt(n?.updatedAt ?? null);
      })
      .catch(() => {
        /* 404 is fine — no note yet */
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, user?.id]);

  useEffect(() => {
    // Importance is exam-scoped; fetch the user's primary exam from
    // their profile and look up our topic.
    if (!topicId) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await auth.fetch("/api/v1/profile/me");
        if (!p.ok) return;
        const pj = await p.json();
        const examId = pj?.exams?.[0]?.examId;
        if (!examId) return;
        const list = await importanceApi.byExam(examId);
        if (cancelled) return;
        const match = list.find((t) => t.topicId === topicId);
        if (match) {
          setImportance({
            weight: match.weight,
            source: match.source,
            confidence: match.confidence,
            hidden: match.hidden,
          });
        }
      } catch {
        /* importance is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  async function saveNote() {
    if (!user?.id || !topicId) return;
    if (noteDraft === noteOriginal) return; // nothing to save
    setNoteError(null);
    try {
      const out = await notesApi.put(user.id, topicId, {
        contentMd: noteDraft,
      });
      setNoteOriginal(out.contentMd);
      setNoteSavedAt(out.updatedAt);
    } catch (e) {
      setNoteError((e as Error).message);
    }
  }

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

  async function startQuiz(difficultyBand: DifficultyBand = "adaptive") {
    if (!topicId || !user || starting) return;
    setError(null);
    setStarting(true);
    try {
      // P6-S54 — read the per-topic intent (set by the IntentSelector
      // in Quiz.tsx's session menu) and forward it to Quiz Go. The
      // server applies a ±0.4 θ̂ offset on top of the difficultyBand
      // seed; "match" is the safe default for first-time topics.
      const { loadIntentForTopic } = await import("../lib/difficulty-agency");
      const intentAnchor = loadIntentForTopic(topicId) ?? "match";
      const { contentLanguageField } = await import("../lib/session-start");
      const langField = await contentLanguageField();
      const r = await auth.fetch(`/api/v1/quiz/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          userId: user.id,
          mode: "PRACTICE",
          // Forward the chosen band so the picker seeds the initial
          // ability estimate. The backend ignores unknown values and
          // falls back to adaptive on the user's existing θ.
          difficultyBand,
          intentAnchor,
          ...langField,
        }),
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
    <Link
      to="/catalog"
      className="vidya-shell__chip"
      style={{ textDecoration: "none" }}
    >
      ← Catalog
    </Link>
  );

  if (error && !topic) {
    return (
      <VidyaShell
        crumbs="LEARN · TOPIC"
        title="Topic"
        actions={backAction}
      >
        <div
          role="alert"
          style={{
            background: "var(--bad)",
            color: "var(--paper)",
            padding: "var(--sp-3)",
            borderRadius: "var(--radius-2)",
            margin: "0 0 var(--sp-3) 0",
          }}
        >
          {error}
        </div>
      </VidyaShell>
    );
  }

  if (!topic) {
    return (
      <VidyaShell
        crumbs="LEARN · TOPIC"
        title="Topic"
        actions={backAction}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="vidya-card-block"
              style={{ opacity: 0.5, minHeight: 72 }}
              aria-hidden
            />
          ))}
        </div>
      </VidyaShell>
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

  const ringTone: "weak" | "developing" | "strong" | "neutral" =
    bucket === "weak" ? "weak"
    : bucket === "developing" ? "developing"
    : bucket === "strong" ? "strong"
    : "neutral";
  const bucketLabel =
    bucket === "strong" ? "Strong"
    : bucket === "developing" ? "Developing"
    : bucket === "weak" ? "Weak"
    : "Not started";
  const bucketTagTone: "success" | "warning" | "danger" | "neutral" =
    bucket === "strong" ? "success"
    : bucket === "developing" ? "warning"
    : bucket === "weak" ? "danger"
    : "neutral";

  const gateState = summariseGate(gate);
  const ptsToGain = mastery
    ? bucket === "weak"
      ? `+${(2.5 + (1 - mastery.ewa) * 2).toFixed(1)}`
      : bucket === "developing"
        ? `+${(0.8 + (1 - mastery.ewa) * 1.2).toFixed(1)}`
        : "Maintain"
    : "—";

  const crumbs = `LEARN · TOPIC · ${topic.title.toUpperCase()}`;
  const masterySubtitle =
    mastery !== null
      ? `${bucketLabel} · Mastery ${masteryPct}% · ${mastery.n} session${mastery.n === 1 ? "" : "s"}`
      : "Not started yet — your first session will set your baseline.";

  return (
    <VidyaShell
      crumbs={crumbs}
      title={topic.title}
      subtitle={masterySubtitle}
      actions={backAction}
    >
      {/* ── Aurora hero — topic identity, mastery ring, primary CTA ── */}
      <Card padding="lg" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 20,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <ProgressRing
            value={mastery?.ewa ?? 0}
            size={96}
            thickness={9}
            tone={ringTone}
          >
            {masteryPct !== null ? `${masteryPct}%` : "—"}
          </ProgressRing>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <Tag tone="aurora" variant="soft" size="sm">
                ✦ AI Adaptive Practice
              </Tag>
              <Tag
                tone={topic.tier === "PREMIUM" ? "warning" : "neutral"}
                variant="soft"
                size="sm"
              >
                {topic.tier === "PREMIUM" ? "Premium" : "Free"}
              </Tag>
              {mastery !== null ? (
                <Tag tone={bucketTagTone} variant="soft" size="sm">
                  {bucketLabel}
                </Tag>
              ) : null}
              {importance ? <ImportancePill {...importance} /> : null}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "var(--t-h1-size)",
                lineHeight: "var(--t-h1-line)",
                fontWeight: 700,
                color: "var(--ink)",
              }}
            >
              {topic.title}
            </h1>
            {topic.description ? (
              <p style={{ margin: "8px 0 0", color: "var(--ink-3)" }}>
                {topic.description}
              </p>
            ) : (
              <p style={{ margin: "8px 0 0", color: "var(--ink-3)" }}>
                Practice this topic with the IRT engine. Each session adapts
                to your current ability so the next item is always within
                reach.
              </p>
            )}

            {/* Prereq gate pill */}
            {gateState.kind === "ready" ? (
              <div style={{ marginTop: 12 }}>
                <Tag tone="success" variant="soft" size="md">
                  ✓ You're ready for this topic
                </Tag>
              </div>
            ) : gateState.kind === "blocked" ? (
              <Link
                to={`/topics/${gateState.first.topicId}`}
                style={{ textDecoration: "none", display: "inline-block", marginTop: 12 }}
              >
                <Tag tone="warning" variant="soft" size="md">
                  ⚠ {blockedLabel(gateState)} →
                </Tag>
              </Link>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              <Button
                variant="aurora"
                size="lg"
                loading={starting}
                onClick={() => startQuiz("adaptive")}
                iconLeft={<span aria-hidden>✦</span>}
              >
                {starting ? "Starting…" : "Start AI practice"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDifficultyPickerOpen(true)}
                disabled={starting}
                title="Pick a difficulty band and start a practice round"
              >
                Practice this topic
              </Button>
              {user && topicId ? (
                <MistakeReplayButton userId={user.id} topicId={topicId} />
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Watch & Learn shelf (R-S2) ──────────────── */}
      <ResourceShelf
        topicId={topicId}
        title="Watch & Learn"
        subtitle={
          isWeak
            ? `Curated clips for ${topic.title} — pick one before your next practice round.`
            : `Curated clips for ${topic.title}.`
        }
        hideWhenEmpty={false}
      />

      {/* ── Stats strip — 4 StatCards ──────────────────────────── */}
      <section
        aria-label="Topic stats"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          margin: "20px 0",
        }}
      >
        <StatCard
          size="sm"
          label="Questions"
          value={topic.questionCount}
          deltaLabel="in this topic's bank"
          tone="brand"
        />
        <StatCard
          size="sm"
          label="Mastery (EWA)"
          value={masteryPct !== null ? `${masteryPct}%` : "—"}
          deltaLabel={mastery === null ? "Not started" : "Recency-weighted"}
          tone={
            bucket === "strong"
              ? "success"
              : bucket === "developing"
                ? "warning"
                : bucket === "weak"
                  ? "danger"
                  : "neutral"
          }
        />
        <StatCard
          size="sm"
          label="Sessions"
          value={mastery?.n ?? 0}
          deltaLabel={mastery && mastery.n > 0 ? "completed" : "no attempts yet"}
          tone="reward"
        />
        <StatCard
          size="sm"
          label="Pts to gain"
          value={ptsToGain}
          deltaLabel="est. per 10-min round"
          tone="aurora"
        />
      </section>

      {/* ── AI insight banner when this topic is weak ────────── */}
      {isWeak ? (
        <div style={{ margin: "20px 0" }}>
          <AIInsightCard
            headline={
              <>
                <strong>{topic.title}</strong> needs focused practice — a 10-minute
                drill will move you the most.
              </>
            }
            description="Adaptive mode picks items at your ability so every question is just within reach."
            action={
              <Button
                variant="aurora"
                onClick={() => startQuiz("adaptive")}
                loading={starting}
                iconLeft={<span aria-hidden>✦</span>}
              >
                Start a 10-min drill
              </Button>
            }
          />
        </div>
      ) : null}

      {/* Phase 1C — Time-to-mastery card */}
      {user && topicId && (
        <section style={{ margin: "16px 0" }}>
          <TimeToMasteryCard userId={user.id} topicId={topicId} />
        </section>
      )}

      {/* Phase 1D-2 — Prerequisite map */}
      {topicId && (
        <section style={{ margin: "16px 0" }}>
          <h3
            style={{
              fontSize: 13,
              color: "var(--ink-3)",
              textTransform: "uppercase",
              letterSpacing: 0.04,
              marginBottom: 8,
            }}
          >
            Prerequisite map
          </h3>
          <PrerequisiteMap topicId={topicId} userId={user?.id} />
        </section>
      )}

      {/* Phase 1D-6 — Watch history card for this topic */}
      {topicId && (
        <section style={{ margin: "16px 0" }}>
          <VideoEngagementCard topicId={topicId} />
        </section>
      )}

      {error ? (
        <div
          role="alert"
          style={{
            marginTop: "var(--sp-4)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
            padding: "var(--sp-3)",
            borderRadius: "var(--radius-2)",
            border: "1px solid var(--warn)",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* ── Zone 3: AI recommends ───────────────────────────────── */}
      {isWeak && mastery ? (
        <button
          type="button"
          onClick={() => startQuiz("adaptive")}
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
        <section className="topic-section">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <h2 className="topic-section-title">About this topic</h2>
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="vidya-shell__chip"
              style={{ fontSize: 12, padding: "4px 12px" }}
              aria-label="Open notes for this topic"
            >
              📝 {noteOriginal ? "View / edit notes" : "Add notes"}
              {noteOriginal && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: "1px 6px",
                    background: "var(--gold)",
                    color: "#fff",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  saved
                </span>
              )}
            </button>
          </div>

          {topic.description ? (
            <p className="topic-section-body" style={{ marginTop: 8 }}>
              {topic.description}
            </p>
          ) : (
            <p
              className="topic-section-body"
              style={{ marginTop: 8, color: "var(--ink-3)" }}
            >
              No syllabus blurb supplied yet. Use the AI tutor below or your
              own notes to capture what this chapter is about.
            </p>
          )}

          {/* A small fact-grid so this card earns its real estate even
              when the seed description is one line long. Items collapse
              when the underlying datum is missing. */}
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              margin: "16px 0 0",
              padding: 0,
            }}
          >
            <AboutFact
              label="Question bank"
              value={`${topic.questionCount}`}
              sub="ready to practise"
            />
            <AboutFact
              label="Sessions logged"
              value={mastery && mastery.n > 0 ? `${mastery.n}` : "—"}
              sub={mastery && mastery.n > 0 ? "by you, so far" : "first attempt pending"}
            />
            <AboutFact
              label="Your mastery"
              value={mastery ? `${Math.round((mastery.ewa ?? 0) * 100)}%` : "—"}
              sub="EWA over recent attempts"
            />
            {topic.prerequisites.length > 0 && (
              <AboutFact
                label="Prerequisites"
                value={`${topic.prerequisites.length}`}
                sub="chapters to know first"
              />
            )}
            {importance && !importance.hidden ? (
              <AboutFact
                label="Exam relevance"
                value={`${(importance.weight * 100).toFixed(1)}%`}
                sub={
                  importance.source === "pyq"
                    ? "from past papers"
                    : importance.source === "blueprint"
                    ? "from section share"
                    : importance.source === "override"
                    ? "set by admin"
                    : "default weighting"
                }
              />
            ) : null}
          </dl>
        </section>

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
                    background: "var(--card-1)",
                    border: "1px solid var(--rule)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <span style={{ color: "var(--warn)", fontSize: 16, lineHeight: "20px" }}>★</span>
                  <span
                    style={{
                      flex: 1,
                      color: "var(--ink)",
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
                      color: "var(--ink-3)",
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
                color: "var(--ink-3)",
                fontSize: 13,
                margin: 0,
              }}
            >
              No attempts yet — your first quiz attempt will appear here.
            </p>
          )}
        </section>

        {/* Phase 7 (P7-A1) — per-topic notes are now opened via the
            "View / edit notes" button in the About section. Keeping the
            inline editor would have stretched the page; a modal makes
            the editor a deliberate side-task instead of a scroll item. */}
      </div>

      {notesOpen && (
        <NotesModal
          topicTitle={topic.title}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          noteOriginal={noteOriginal}
          noteSavedAt={noteSavedAt}
          noteError={noteError}
          onSave={() => void saveNote()}
          onClose={() => setNotesOpen(false)}
        />
      )}

      {difficultyPickerOpen && (
        <DifficultyModal
          topicTitle={topic.title}
          currentMastery={mastery?.ewa ?? null}
          starting={starting}
          onPick={(band) => {
            setDifficultyPickerOpen(false);
            void startQuiz(band);
          }}
          onClose={() => setDifficultyPickerOpen(false)}
        />
      )}
    </VidyaShell>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────

function AboutFact({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
      }}
    >
      <dt
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "var(--ink-4)",
          margin: 0,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--ink)",
          lineHeight: 1.15,
          margin: "4px 0 0",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </dd>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

type DifficultyBand = "adaptive" | "easy" | "medium" | "hard" | "mixed";

interface DifficultyOption {
  band: DifficultyBand;
  label: string;
  glyph: string;
  blurb: string;
  /** Suggested when this option is the closest fit for the user's
   *  current mastery; null = don't suggest. */
  recommendedFor?: (ewa: number | null) => boolean;
}

const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  {
    band: "adaptive",
    label: "Adaptive",
    glyph: "◈",
    blurb:
      "AI picks each item to keep you in the flow corridor — slightly above your current θ.",
    recommendedFor: () => true,
  },
  {
    band: "easy",
    label: "Easy",
    glyph: "○",
    blurb: "Recall-level items only. Good for warm-ups or building confidence on a weak chapter.",
    recommendedFor: (ewa) => ewa !== null && ewa < 0.3,
  },
  {
    band: "medium",
    label: "Medium",
    glyph: "◐",
    blurb: "Application-level items. The bulk of the bank — typical exam difficulty.",
    recommendedFor: (ewa) => ewa !== null && ewa >= 0.3 && ewa < 0.7,
  },
  {
    band: "hard",
    label: "Hard",
    glyph: "●",
    blurb: "Stretch items — analyse / evaluate Bloom levels. Use when mastery is already strong.",
    recommendedFor: (ewa) => ewa !== null && ewa >= 0.7,
  },
  {
    band: "mixed",
    label: "Mixed",
    glyph: "◑",
    blurb: "Random across all difficulty bands. Closest to a real exam blueprint.",
  },
];

function DifficultyModal({
  topicTitle,
  currentMastery,
  starting,
  onPick,
  onClose,
}: {
  topicTitle: string;
  currentMastery: number | null;
  starting: boolean;
  onPick: (band: DifficultyBand) => void;
  onClose: () => void;
}) {
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
      aria-label={`Choose practice difficulty for ${topicTitle}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,15,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--card)",
          border: "1px solid var(--rule)",
          borderRadius: 12,
          boxShadow: "0 30px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "14px 18px",
            borderBottom: "1px solid var(--rule)",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--gold)",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              ▦ Practice this topic
            </div>
            <h2
              style={{
                margin: "2px 0 0",
                fontSize: 16,
                fontWeight: 700,
                color: "var(--ink)",
              }}
            >
              {topicTitle}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--ink-3)",
                lineHeight: 1.45,
              }}
            >
              Pick the difficulty band you want this round to focus on. You can
              always switch back to Adaptive — it's the platform default.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="vidya-shell__chip"
            style={{ padding: "4px 10px", fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </button>
        </header>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {DIFFICULTY_OPTIONS.map((opt) => {
            const recommended = opt.recommendedFor?.(currentMastery) ?? false;
            return (
              <button
                key={opt.band}
                type="button"
                disabled={starting}
                onClick={() => onPick(opt.band)}
                style={{
                  textAlign: "left",
                  background: "var(--paper-2)",
                  border: "1px solid var(--rule)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  cursor: starting ? "default" : "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  transition: "border-color 120ms, transform 120ms",
                }}
                onMouseEnter={(e) => {
                  if (!starting) {
                    e.currentTarget.style.borderColor = "var(--gold)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--rule)";
                }}
              >
                <span
                  aria-hidden
                  style={{
                    fontSize: 18,
                    width: 24,
                    textAlign: "center",
                    color: "var(--gold)",
                    marginTop: 1,
                  }}
                >
                  {opt.glyph}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--ink)",
                    }}
                  >
                    {opt.label}
                    {recommended && (
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: "var(--gold)",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                        }}
                      >
                        suggested
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 2,
                      fontSize: 12,
                      color: "var(--ink-3)",
                      lineHeight: 1.45,
                    }}
                  >
                    {opt.blurb}
                  </span>
                </span>
                <span
                  aria-hidden
                  style={{
                    alignSelf: "center",
                    fontSize: 14,
                    color: "var(--ink-4)",
                  }}
                >
                  →
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NotesModal({
  topicTitle,
  noteDraft,
  setNoteDraft,
  noteOriginal,
  noteSavedAt,
  noteError,
  onSave,
  onClose,
}: {
  topicTitle: string;
  noteDraft: string;
  setNoteDraft: (s: string) => void;
  noteOriginal: string;
  noteSavedAt: string | null;
  noteError: string | null;
  onSave: () => void;
  onClose: () => void;
}) {
  // Esc closes; save-on-close ensures any unsaved edits don't vanish
  // when the user dismisses the modal via backdrop / Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (noteDraft !== noteOriginal) onSave();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [noteDraft, noteOriginal, onSave, onClose]);

  const dirty = noteDraft !== noteOriginal;
  const status = noteError
    ? `Save failed: ${noteError}`
    : dirty
    ? "Unsaved changes"
    : noteSavedAt
    ? `Saved ${new Date(noteSavedAt).toLocaleTimeString()}`
    : "Private to you · 4096 char limit";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Notes for ${topicTitle}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (dirty) onSave();
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,15,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "var(--card)",
          border: "1px solid var(--rule)",
          borderRadius: 12,
          boxShadow: "0 30px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "85vh",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: "1px solid var(--rule)",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--ink-4)",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              📝 My notes
            </div>
            <h2
              style={{
                margin: "2px 0 0",
                fontSize: 16,
                fontWeight: 700,
                color: "var(--ink)",
              }}
            >
              {topicTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (dirty) onSave();
              onClose();
            }}
            aria-label="Close notes"
            className="vidya-shell__chip"
            style={{ padding: "4px 10px", fontSize: 14 }}
          >
            ✕
          </button>
        </header>

        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value.slice(0, 4096))}
          placeholder={`Notes on ${topicTitle}…\n\n# Heading\n- Bullet\n**bold** for key formulas`}
          style={{
            flex: 1,
            minHeight: 280,
            padding: 16,
            margin: 0,
            background: "var(--paper-2)",
            border: 0,
            outline: 0,
            color: "var(--ink)",
            fontFamily:
              "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
            fontSize: 13,
            lineHeight: 1.55,
            resize: "vertical",
          }}
          autoFocus
        />

        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 18px",
            borderTop: "1px solid var(--rule)",
            background: "var(--paper-2)",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 11, color: noteError ? "var(--bad)" : "var(--ink-3)" }}>
            {status}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "var(--ink-4)" }}>
              {noteDraft.length} / 4096
            </span>
            <button
              type="button"
              className="vidya-shell__chip"
              style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => {
                if (dirty) onSave();
                onClose();
              }}
            >
              Done
            </button>
            <button
              type="button"
              className="vidya-shell__primary"
              style={{ fontSize: 12, padding: "4px 14px" }}
              disabled={!dirty}
              onClick={onSave}
            >
              {dirty ? "Save" : "Saved"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
