// F3 — My custom tests list + AI-suggested tests (Vidya v1 redesign).
// URL: /practice/my-tests
//   ?tab=my-tests    (default) — custom blueprints the user has authored
//   ?tab=ai-suggested          — AI-suggested blueprints (today_pick / long_form /
//                                crash_drill / decay_refresh)
//
// /practice/ai-suggestions redirects here via <Navigate replace />.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { auth } from "../lib/api";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { Banner } from "../components/dashboard";
import { ShareTestModal } from "../components/ShareTestModal";

// ─── My tests types ──────────────────────────────────────────────────────────

interface BlueprintRow {
  id: string;
  examId: string;
  name: string;
  totalQuestions: number;
  totalMinutes: number;
  marksCorrect: number;
  marksNegative: number;
  kind: string;
  visibility: string;
  status: string;
  shareSlug: string | null;
  createdAt: string | null;
  sections: Array<{ section_id: string; name: string; n_questions: number }>;
}

interface MyBlueprintsResponse {
  items: BlueprintRow[];
  count: number;
}

interface BlueprintStats {
  attempts: number;
  ratings: { count: number; avgStars: number | null };
}

// ─── AI suggestions types ────────────────────────────────────────────────────

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

// ─── AI suggestions tab (absorbed from AISuggestedTests.tsx) ─────────────────

function AISuggestionsTab() {
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
    <div style={{ maxWidth: 960 }}>
      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: "var(--sp-4)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: "var(--sp-2)" }}>
          Pick a shape — we'll target your weak spots
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>
          We compose a fresh test from your mastery data + recent attempts.
          Each card is a different "shape" — pick the one that fits the
          moment. Each suggestion is fresh for 24 hours.
        </p>
      </div>

      {/* ── Variant grid ─────────────────────────────────────────── */}
      <section className="vidya-card-block">
        <div className="vidya-card-block__head">
          <div className="vidya-card-block__title">Compose a new suggestion</div>
        </div>
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
              <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                {composing === v.id ? "Composing…" : v.shape}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Latest composed suggestion ───────────────────────────── */}
      {latest && (
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <div className="vidya-card-block__title">
              Your new suggestion
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "var(--ink-3)" }}>
                Fresh — auto-expires in 24h
              </span>
            </div>
          </div>
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
            <div style={{ display: "flex", gap: "var(--sp-4)", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Questions</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{latest.totalQuestions}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Time</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{latest.totalMinutes}m</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Sections</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{latest.sections.length}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginBottom: 14 }}>
              {latest.sections.map((s, i) => (
                <div
                  key={s.section_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--sp-3) var(--sp-4)",
                    background: "var(--card)",
                    border: "1px solid var(--rule)",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{s.name || `Section ${i + 1}`}</p>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                      <span>{s.n_questions} Q · {s.n_minutes} min</span>
                      <span style={{ margin: "0 6px" }}>·</span>
                      <span>{s.difficulty_band}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="vidya-shell__primary"
                onClick={() => start(latest.blueprintId)}
              >
                Start now →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Active suggestions ───────────────────────────────────── */}
      <section className="vidya-card-block">
        <div className="vidya-card-block__head">
          <div className="vidya-card-block__title">
            Recent suggestions
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "var(--ink-3)" }}>
              {active === null
                ? "loading…"
                : active.length === 0
                  ? "none yet — pick a shape above"
                  : `${active.length} fresh`}
            </span>
          </div>
        </div>
        {active && active.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {active.map((s) => (
              <div
                key={s.blueprintId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--sp-3) var(--sp-4)",
                  background: "var(--card)",
                  border: "1px solid var(--rule)",
                  borderRadius: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{s.name}</p>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    <span>{s.totalQuestions} Q · {s.totalMinutes} min</span>
                    <span style={{ margin: "0 6px" }}>·</span>
                    <span>{s.sectionCount} section{s.sectionCount === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="vidya-shell__chip"
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
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = "my-tests" | "ai-suggested";

// ─── Main page ───────────────────────────────────────────────────────────────

export function MyTests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: Tab = rawTab === "ai-suggested" ? "ai-suggested" : "my-tests";

  function switchTab(t: Tab) {
    setSearchParams(t === "my-tests" ? {} : { tab: t }, { replace: true });
  }

  // ── My tests state ──────────────────────────────────────────────
  const [items, setItems] = useState<BlueprintRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<BlueprintRow | null>(null);
  const [statsByBp, setStatsByBp] = useState<Record<string, BlueprintStats>>(
    {},
  );

  async function refresh() {
    setError(null);
    try {
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/mine`);
      if (!r.ok) {
        setError(`Couldn't load your tests (HTTP ${r.status}).`);
        return;
      }
      const body = (await r.json()) as MyBlueprintsResponse;
      setItems(body.items);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  // Fetch share stats for any blueprint that's currently shared (has slug).
  // Only the author sees this page, so the per-row stats endpoint is safe.
  useEffect(() => {
    if (!items) return;
    const shared = items.filter((b) => b.shareSlug);
    if (shared.length === 0) return;
    let alive = true;
    void Promise.all(
      shared.map(async (b) => {
        try {
          const r = await auth.fetch(
            `/api/v1/catalog/exam-blueprints/mine/${b.id}/stats`,
          );
          if (!r.ok) return null;
          const body = (await r.json()) as BlueprintStats & { blueprintId: string };
          return { id: b.id, stats: body };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (!alive) return;
      const next: Record<string, BlueprintStats> = {};
      for (const row of rows) {
        if (row) next[row.id] = row.stats;
      }
      setStatsByBp((p) => ({ ...p, ...next }));
    });
    return () => {
      alive = false;
    };
  }, [items]);

  async function deleteOne(id: string) {
    if (!confirm("Delete this test? Past sessions stay; the test won't be re-launchable.")) return;
    setDeletingId(id);
    try {
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/mine/${id}`, {
        method: "DELETE",
      });
      if (!r.ok && r.status !== 204) {
        alert(`Delete failed (${r.status})`);
        return;
      }
      void refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "my-tests", label: "My tests" },
    { id: "ai-suggested", label: "AI suggestions" },
  ];

  const chips = (
    <>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={activeTab === t.id}
          onClick={() => switchTab(t.id)}
          className={
            activeTab === t.id
              ? "vidya-shell__chip vidya-shell__chip--on"
              : "vidya-shell__chip"
          }
        >
          {t.label}
        </button>
      ))}
    </>
  );

  const actions = (
    <>
      <Link to="/practice" className="vidya-shell__chip">
        ← Practice
      </Link>
      <Link to="/practice/build" className="vidya-shell__primary">
        ＋ New test
      </Link>
    </>
  );

  return (
    <VidyaShell
      crumbs="PRACTICE · MY TESTS"
      title="My tests"
      subtitle="Custom tests you've built, plus AI-suggested practice based on your weak topics."
      chips={chips}
      actions={actions}
    >
      {activeTab === "ai-suggested" && <AISuggestionsTab />}

      {activeTab === "my-tests" && (
        <>
          {error && <Banner tone="danger">{error}</Banner>}

          {items === null && !error && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    opacity: 0.5,
                    minHeight: 80,
                    background: "var(--card)",
                    border: "1px solid var(--rule)",
                    borderRadius: 10,
                  }}
                  aria-hidden
                />
              ))}
            </div>
          )}

          {items !== null && items.length === 0 && (
            <section
              style={{
                textAlign: "center",
                padding: "var(--sp-6) var(--sp-4)",
                background: "var(--card)",
                border: "1px solid var(--rule)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: "var(--sp-3)" }}>📝</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: "var(--sp-2)" }}>
                No custom tests yet
              </h2>
              <p style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 520, margin: "0 auto var(--sp-4)" }}>
                Build a test that mixes multiple topics, sets your own
                difficulty band, and runs against a custom timer. Useful when
                you want more control than topic-only Practice but a tighter
                scope than a full Mock Exam.
              </p>
              <Link to="/practice/build" className="vidya-shell__primary">
                ＋ Build your first test
              </Link>
            </section>
          )}

          {items !== null && items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {items.map((bp) => {
                const stats = statsByBp[bp.id];
                return (
                  <div
                    key={bp.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--sp-3)",
                      padding: "var(--sp-3) var(--sp-4)",
                      background: "var(--card)",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{bp.name}</p>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        <span>{bp.totalQuestions} Q · {bp.totalMinutes} min</span>
                        <span>·</span>
                        <span>+{bp.marksCorrect} / −{bp.marksNegative}</span>
                        <span>·</span>
                        <span>
                          {Array.isArray(bp.sections) ? bp.sections.length : 0} section
                          {(Array.isArray(bp.sections) ? bp.sections.length : 0) === 1 ? "" : "s"}
                        </span>
                        {bp.createdAt && (
                          <>
                            <span>·</span>
                            <span>
                              {new Date(bp.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </>
                        )}
                        {stats && bp.shareSlug && (
                          <>
                            <span>·</span>
                            <span style={{ color: "var(--info)" }}>
                              {stats.attempts} attempt{stats.attempts === 1 ? "" : "s"}
                            </span>
                            {stats.ratings.count > 0 && (
                              <>
                                <span>·</span>
                                <span style={{ color: "var(--warn)" }}>
                                  ★ {stats.ratings.avgStars?.toFixed(1)} (
                                  {stats.ratings.count})
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexShrink: 0 }}>
                      {bp.shareSlug && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "var(--info)",
                            color: "var(--paper)",
                          }}
                        >
                          Shared
                        </span>
                      )}
                      <Link
                        to={`/mock-exam?blueprintId=${bp.id}`}
                        className="vidya-shell__primary"
                      >
                        ▶ Start →
                      </Link>
                      <button
                        type="button"
                        className="vidya-shell__chip"
                        onClick={() => setSharing(bp)}
                      >
                        {bp.shareSlug ? "Manage share" : "Share"}
                      </button>
                      <button
                        type="button"
                        className="vidya-shell__chip"
                        onClick={() => deleteOne(bp.id)}
                        disabled={deletingId === bp.id}
                      >
                        {deletingId === bp.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {sharing && (
        <ShareTestModal
          blueprintId={sharing.id}
          initialSlug={sharing.shareSlug}
          onClose={() => setSharing(null)}
          onShared={(slug) => {
            // Reflect the new slug on the row immediately + clear cached stats.
            setItems((prev) =>
              prev
                ? prev.map((b) => (b.id === sharing.id ? { ...b, shareSlug: slug } : b))
                : prev,
            );
            setStatsByBp((prev) => {
              const next = { ...prev };
              delete next[sharing.id];
              return next;
            });
          }}
        />
      )}
    </VidyaShell>
  );
}
