// F5 — AI-suggested Custom Tests landing.
// URL: /practice/ai-suggestions
//
// Shows four variant cards (today_pick / long_form / crash_drill /
// decay_refresh). Tapping a card calls POST /catalog/exam-blueprints/
// ai-suggest with the variant, persists a new AI_SUGGESTED blueprint,
// then displays the result (name, rationale, sections summary) with
// a "Start now" CTA that routes to MockExam.
//
// Also lists currently-fresh AI-suggested blueprints (≤24h) so the
// student can come back to one without re-spending an LLM call.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";

interface Profile {
  exams: Array<{ examId: string; targetDate: string | null }>;
}

interface ActiveSuggestion {
  blueprintId: string;
  name: string;
  totalQuestions: number;
  totalMinutes: number;
  createdAt: string | null;
  sectionCount: number;
}

interface SuggestResponse {
  blueprintId: string;
  name: string;
  rationale: string;
  variant: string;
  expiresAt: string;
  totalQuestions: number;
  totalMinutes: number;
  sections: Array<{
    section_id: string;
    name: string;
    n_questions: number;
    n_minutes: number;
    difficulty_band: string;
  }>;
}

type Variant = "today_pick" | "long_form" | "crash_drill" | "decay_refresh";

const VARIANTS: Array<{
  id: Variant;
  emoji: string;
  title: string;
  pitch: string;
  shape: string;
}> = [
  {
    id: "today_pick",
    emoji: "🎯",
    title: "Today's pick",
    pitch: "Quick balanced drill targeting your top 2 weak subjects.",
    shape: "15 Q · 25 min · mixed",
  },
  {
    id: "long_form",
    emoji: "📚",
    title: "Long form",
    pitch: "Mock-style 45-min session across your 3 weakest subjects.",
    shape: "45 Q · 60 min · mixed",
  },
  {
    id: "crash_drill",
    emoji: "🔥",
    title: "Crash drill",
    pitch: "Hardest band on your single weakest concept. Stress-test only.",
    shape: "10 Q · 10 min · hard",
  },
  {
    id: "decay_refresh",
    emoji: "🧠",
    title: "Decay refresh",
    pitch: "Topics you mastered weeks ago that need re-surfacing.",
    shape: "20 Q · 30 min · mixed",
  },
];

export function AISuggestedTests() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [active, setActive] = useState<ActiveSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState<Variant | null>(null);
  const [latest, setLatest] = useState<SuggestResponse | null>(null);

  const examId = useMemo(() => profile?.exams?.[0]?.examId ?? null, [profile]);

  async function load() {
    setError(null);
    try {
      const [profRes, activeRes] = await Promise.all([
        auth.fetch(`/api/v1/profile/me`),
        auth.fetch(`/api/v1/catalog/exam-blueprints/ai-suggested/active`),
      ]);
      if (profRes.ok) setProfile(await profRes.json());
      if (activeRes.ok) {
        const body = (await activeRes.json()) as { items: ActiveSuggestion[] };
        setActive(body.items);
      }
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function compose(variant: Variant) {
    if (!examId) {
      setError("Set an exam in your profile before requesting AI suggestions.");
      return;
    }
    setComposing(variant);
    setError(null);
    setLatest(null);
    try {
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/ai-suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant, exam_id: examId }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body?.detail?.message ?? `Couldn't compose (HTTP ${r.status}).`);
        return;
      }
      const body = (await r.json()) as SuggestResponse;
      setLatest(body);
      // Refresh active list so the new suggestion appears below.
      void load();
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setComposing(null);
    }
  }

  function start(blueprintId: string) {
    nav(`/mock-exam?blueprintId=${blueprintId}`);
  }

  return (
    <AppShell
      title="AI-suggested tests"
      actions={
        <Link to="/practice" className="pg-btn pg-btn-ghost">
          ← Practice
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 960 }}>
        {error && <Banner tone="danger">{error}</Banner>}

        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Pick a shape — we'll target your weak spots</h1>
            <p className="pg-header-sub">
              We compose a fresh test from your mastery data + recent attempts.
              Each card is a different "shape" — pick the one that fits the
              moment. Each suggestion is fresh for 24 hours.
            </p>
          </div>
        </header>

        {/* ── Variant grid ─────────────────────────────────────────── */}
        <section className="pg-section">
          <h2 className="pg-section-title">Compose a new suggestion</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={composing !== null}
                onClick={() => compose(v.id)}
                style={{
                  textAlign: "left",
                  padding: "16px 18px",
                  background:
                    "linear-gradient(135deg, rgba(126,84,234,0.08) 0%, rgba(126,84,234,0.01) 100%)",
                  border: "1px solid rgba(126,84,234,0.30)",
                  borderRadius: 10,
                  color: "inherit",
                  cursor: composing !== null ? "wait" : "pointer",
                  opacity: composing && composing !== v.id ? 0.5 : 1,
                  transition: "transform 80ms ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 26 }}>{v.emoji}</span>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{v.title}</div>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 8 }}>
                  {v.pitch}
                </div>
                <div style={{ fontSize: 12, color: "#7e54ea", fontWeight: 600 }}>
                  {composing === v.id ? "Composing…" : v.shape}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Latest composed suggestion ───────────────────────────── */}
        {latest && (
          <section className="pg-section">
            <h2 className="pg-section-title">
              Your new suggestion
              <span className="pg-section-title-sub">
                Fresh — auto-expires in 24h
              </span>
            </h2>
            <div
              style={{
                padding: 18,
                background: "rgba(126,84,234,0.06)",
                border: "1px solid rgba(126,84,234,0.30)",
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                {latest.name}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 14 }}>
                {latest.rationale}
              </div>
              <div className="pg-stat-strip" style={{ marginBottom: 14 }}>
                <div className="pg-stat">
                  <div className="pg-stat-label">Questions</div>
                  <div className="pg-stat-value">{latest.totalQuestions}</div>
                </div>
                <div className="pg-stat">
                  <div className="pg-stat-label">Time</div>
                  <div className="pg-stat-value">{latest.totalMinutes}m</div>
                </div>
                <div className="pg-stat">
                  <div className="pg-stat-label">Sections</div>
                  <div className="pg-stat-value">{latest.sections.length}</div>
                </div>
              </div>
              <div className="pg-list" style={{ marginBottom: 14 }}>
                {latest.sections.map((s, i) => (
                  <div className="pg-row" key={s.section_id}>
                    <div className="pg-row-main">
                      <p className="pg-row-title">{s.name || `Section ${i + 1}`}</p>
                      <div className="pg-row-meta">
                        <span>{s.n_questions} Q · {s.n_minutes} min</span>
                        <span className="pg-row-meta-dot">·</span>
                        <span>{s.difficulty_band}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="pg-btn pg-btn-primary"
                  onClick={() => start(latest.blueprintId)}
                >
                  Start now →
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Active suggestions ───────────────────────────────────── */}
        <section className="pg-section">
          <h2 className="pg-section-title">
            Recent suggestions
            <span className="pg-section-title-sub">
              {active === null
                ? "loading…"
                : active.length === 0
                  ? "none yet — pick a shape above"
                  : `${active.length} fresh`}
            </span>
          </h2>
          {active && active.length > 0 && (
            <div className="pg-list">
              {active.map((s) => (
                <div className="pg-row" key={s.blueprintId}>
                  <div className="pg-row-main">
                    <p className="pg-row-title">{s.name}</p>
                    <div className="pg-row-meta">
                      <span>{s.totalQuestions} Q · {s.totalMinutes} min</span>
                      <span className="pg-row-meta-dot">·</span>
                      <span>{s.sectionCount} section{s.sectionCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pg-btn pg-btn-ghost"
                    onClick={() => start(s.blueprintId)}
                  >
                    Start →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}