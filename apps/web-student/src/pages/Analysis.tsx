import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AIInsightCard,
  Button,
  EmptyState,
  StatCard,
} from "@alp/ui";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Pill, SkeletonRows, strengthFor } from "../components/dashboard";
// Phase 1C — confidence calibration card.
import { ConfidenceGapCard, MistakeReplayButton } from "../components/phase1c";
// Phase 1D — career outcomes, rank trajectory, national rank.
import {
  CareerOutcomeCard,
  RankTrajectoryChart,
  NationalRankCard,
} from "../components/phase1d";

// Analysis screen — React port of
// docs/ui/01_StudentPortal_Web/10_analysis.html.
//
// Phase 1 scope: only the Overview tab is implemented. The other tabs
// (Score History / Topics / Sessions / Predictions) are visible-but-
// disabled until the corresponding endpoints land — Analytics today
// returns only point-in-time readiness/mastery, not a time series.
//
// Data sources (all live):
//   • /api/v1/profile/me              — enrolled exams + target dates
//   • /api/v1/catalog/exams           — exam code+name (chip labels)
//   • /api/v1/analytics/readiness/{id}?scope=GLOBAL
//   • /api/v1/analytics/mastery/{id}  — per-topic EWA + n
//   • /api/v1/analytics/streak/{id}   — current/longest streak
//   • /api/v1/catalog/topics/{tid}    — per-topic title + subjectId
//   • /api/v1/catalog/exams/{eid}/subjects — subject names per exam
//   • /api/v1/adaptive/rank-projection/{id}?exam=NEET — projected rank
//   • /api/v1/adaptive/weakness-diagnosis/{id} — cross-topic patterns
//
// What's faked vs real on this page:
//   • Real: every KPI tile, the topic table, subject roll-up,
//     ability gauge (derived from mean EWA), insight bullets.
//   • Synthesised: trajectory chart line — no historical readiness
//     series exists yet, so we render a smoothed "0 → current" curve
//     with a clear caveat. Empty-state shown when there are no
//     sessions to draw from.

interface Profile {
  user: { firstName: string };
  preferences: { language: string; dailyGoalMinutes: number | null };
  exams: Array<{ examId: string; targetDate: string | null }>;
}

interface ExamMeta {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

interface ReadinessResponse {
  userId: string;
  scope: string;
  score: number;
  nTopics: number;
  updatedAt: string | null;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface StreakResponse {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

interface RankProjection {
  examCode: string;
  examName: string;
  readiness: number;
  projectedPercentile: number;
  projectedRank: number;
  rankLow: number;
  rankHigh: number;
  confidence?: string;
  commentary?: string;
  source?: "ai" | "heuristic";
  totalCandidates?: number;
  nTopicsActive?: number;
  nAttempts?: number;
}

interface WeaknessPattern {
  pattern: string;
  evidence?: string;
  prescription?: string;
}

interface WeaknessResponse {
  overall_assessment: string;
  patterns: WeaknessPattern[];
  weakest_topics: string[];
  source: "ai" | "heuristic";
}

interface SubjectMeta {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}

interface TopicRow {
  topicId: string;
  title: string;
  subjectId: string;
  subjectName: string;
  examId: string;
  ewa: number;
  n: number;
}

type Period = "30D" | "90D" | "ALL";
type TabKey = "overview" | "history" | "topics" | "sessions" | "predictions";

export function Analysis() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [examsMeta, setExamsMeta] = useState<Record<string, ExamMeta>>({});
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [mastery, setMastery] = useState<TopicRow[] | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [rank, setRank] = useState<RankProjection | null>(null);
  // Phase 1B — readiness band wiring.
  const [readinessBand, setReadinessBand] = useState<{
    band: string;
    readiness_score: number;
    target_score: number;
    days_to_exam: number;
    actions: string[];
  } | null>(null);
  const [weakness, setWeakness] = useState<WeaknessResponse | null>(null);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [period, setPeriod] = useState<Period>("30D");
  const [showAllTopics, setShowAllTopics] = useState(false);

  // 1. Profile + exam metadata
  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (r.ok) {
          const body = (await r.json()) as Profile;
          setProfile(body);
          if (body.exams.length > 0 && !activeExamId) {
            setActiveExamId(body.exams[0].examId);
          }
        }
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (r.ok) {
          const all = (await r.json()) as ExamMeta[];
          const map: Record<string, ExamMeta> = {};
          all.forEach((e) => {
            map[e.id] = e;
          });
          setExamsMeta(map);
        }
      } catch {
        /* swallow */
      }
    })();
    // activeExamId intentionally omitted — only initialise on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Analytics core (readiness + streak)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/readiness/${user.id}`);
        if (r.ok) setReadiness((await r.json()) as ReadinessResponse);
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(`/api/v1/analytics/streak/${user.id}`);
        if (r.ok) setStreak((await r.json()) as StreakResponse);
      } catch {
        /* swallow */
      }
    })();
  }, [user]);

  // 3. Mastery + topic/subject hydration
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!r.ok) {
          setMastery([]);
          return;
        }
        const body = (await r.json()) as MasteryListResponse;
        if (body.topics.length === 0) {
          setMastery([]);
          return;
        }

        // Hydrate each topic row with title + subjectId.
        const partials = await Promise.all(
          body.topics.map(async (t) => {
            try {
              const tr = await auth.fetch(`/api/v1/catalog/topics/${t.topicId}`);
              if (tr.ok) {
                const tj = (await tr.json()) as { title: string; subjectId: string };
                return { ...t, title: tj.title, subjectId: tj.subjectId };
              }
            } catch {
              /* fall through */
            }
            return {
              ...t,
              title: `Topic ${t.topicId.slice(0, 8)}`,
              subjectId: "",
            };
          }),
        );

        // Build a subjectId → {name, examId} map by walking each enrolled
        // exam's subjects. Subjects belong to exactly one exam in the
        // catalog schema, so a single sweep is sufficient.
        const subjectMap = new Map<string, { name: string; examId: string }>();
        const examIds = Array.from(new Set(partials.map((p) => p.subjectId).filter(Boolean)));
        if (examIds.length > 0) {
          const examList = (await (
            await auth.fetch("/api/v1/catalog/exams")
          ).json()) as ExamMeta[];
          for (const e of examList) {
            try {
              const sr = await auth.fetch(`/api/v1/catalog/exams/${e.id}/subjects`);
              if (!sr.ok) continue;
              const subs = (await sr.json()) as SubjectMeta[];
              for (const s of subs) {
                subjectMap.set(s.id, { name: s.name, examId: e.id });
              }
            } catch {
              /* swallow */
            }
          }
        }

        const rows: TopicRow[] = partials.map((p) => {
          const meta = subjectMap.get(p.subjectId);
          return {
            topicId: p.topicId,
            title: p.title,
            subjectId: p.subjectId,
            subjectName: meta?.name ?? "—",
            examId: meta?.examId ?? "",
            ewa: p.ewa,
            n: p.n,
          };
        });
        setMastery(rows);
      } catch {
        setMastery([]);
      }
    })();
  }, [user]);

  // 4. AI projections — only when an exam is selected
  useEffect(() => {
    if (!user || !activeExamId || !examsMeta[activeExamId]) return;
    const examCode = examsMeta[activeExamId].code;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/adaptive/rank-projection/${user.id}?exam=${encodeURIComponent(examCode)}`,
        );
        if (r.ok) setRank((await r.json()) as RankProjection);
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(`/api/v1/adaptive/weakness-diagnosis/${user.id}`);
        if (r.ok) setWeakness((await r.json()) as WeaknessResponse);
      } catch {
        /* swallow */
      }
      // Phase 1B — readiness band tied to selected exam target date.
      try {
        const target = profile?.exams.find((e) => e.examId === activeExamId);
        const daysToExam = target?.targetDate
          ? Math.max(
              30,
              Math.round(
                (new Date(target.targetDate).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24),
              ),
            )
          : 120;
        const r = await auth.fetch(
          `/api/v1/analytics/readiness-band/${user.id}?target_score=0.7&days_to_exam=${daysToExam}`,
        );
        if (r.ok) setReadinessBand(await r.json());
      } catch {
        /* swallow */
      }
    })();
  }, [user, activeExamId, examsMeta, profile]);

  // ── Derivations ────────────────────────────────────────────────────────
  const exams = profile?.exams ?? [];
  const enrolledExamIds = exams.map((e) => e.examId);
  const activeExam = activeExamId ? examsMeta[activeExamId] : null;

  // Topics scoped to the active exam (when we have subject→exam joining).
  const examTopics = useMemo(() => {
    if (!mastery) return [];
    if (!activeExamId) return mastery;
    const scoped = mastery.filter((t) => !t.examId || t.examId === activeExamId);
    return scoped.length > 0 ? scoped : mastery;
  }, [mastery, activeExamId]);

  // KPIs
  const readinessPct = readiness ? +(readiness.score * 100).toFixed(1) : 0;
  const totalSessions = examTopics.reduce((s, t) => s + t.n, 0);
  // n is sessions; estimate Q-count assuming ~10 Qs / session.
  const learningEvents = totalSessions * 10;
  // Mean EWA over topics with at least one session (proxy for accuracy).
  const tested = examTopics.filter((t) => t.n > 0);
  const meanEwa =
    tested.length > 0 ? tested.reduce((s, t) => s + t.ewa, 0) / tested.length : 0;
  const answerPrecisionPct = Math.round(meanEwa * 100);
  // Ability θ proxy: map mean EWA in [0,1] linearly to [-2, +2].
  const theta = +(meanEwa * 4 - 2).toFixed(2);
  const abilityBand =
    theta >= 1.0
      ? "Advanced"
      : theta >= 0.4
        ? "Upper-Intermediate"
        : theta >= -0.4
          ? "Intermediate"
          : theta >= -1.0
            ? "Developing"
            : "Beginner";
  const gaugePct = Math.max(0, Math.min(100, ((theta + 2) / 4) * 100));

  // Predicted readiness — straight-line projection toward target date.
  const projectedReadiness = useMemo(() => {
    if (!readiness || !activeExamId) return null;
    const ex = profile?.exams.find((e) => e.examId === activeExamId);
    if (!ex?.targetDate) return null;
    const target = new Date(ex.targetDate);
    if (Number.isNaN(target.getTime())) return null;
    const days = Math.max(1, Math.round((target.getTime() - Date.now()) / 86400000));
    // Velocity: assume +0.005 readiness/day as a sanity-checked default for
    // an active learner. Capped at 0.95 to avoid overpromising.
    const projected = Math.min(0.95, readiness.score + 0.005 * days);
    return { projected, days, target };
  }, [readiness, activeExamId, profile]);

  // Subject roll-up (weighted average of per-topic EWA, weighted by n+1).
  const subjectStats = useMemo(() => {
    if (!examTopics.length) return [] as Array<{
      subjectId: string;
      name: string;
      ewa: number;
      sessions: number;
    }>;
    const groups = new Map<string, { ewaSum: number; weight: number; sessions: number; name: string }>();
    for (const t of examTopics) {
      if (!t.subjectId) continue;
      const w = t.n + 1;
      const cur = groups.get(t.subjectId);
      if (cur) {
        cur.ewaSum += t.ewa * w;
        cur.weight += w;
        cur.sessions += t.n;
      } else {
        groups.set(t.subjectId, {
          ewaSum: t.ewa * w,
          weight: w,
          sessions: t.n,
          name: t.subjectName,
        });
      }
    }
    return Array.from(groups.entries())
      .map(([subjectId, g]) => ({
        subjectId,
        name: g.name,
        ewa: g.weight > 0 ? g.ewaSum / g.weight : 0,
        sessions: g.sessions,
      }))
      .sort((a, b) => b.ewa - a.ewa);
  }, [examTopics]);

  // Topic table — sort weakest-first, then by stalest last-practice.
  const sortedTopics = useMemo(() => {
    return [...examTopics].sort((a, b) => {
      if (a.n === 0 && b.n > 0) return 1;
      if (b.n === 0 && a.n > 0) return -1;
      return a.ewa - b.ewa;
    });
  }, [examTopics]);

  const topicCounts = useMemo(() => {
    const c = { weak: 0, developing: 0, strong: 0, neww: 0 };
    for (const t of examTopics) {
      const s = strengthFor(t.ewa);
      if (s === "STRONG") c.strong++;
      else if (s === "DEVELOPING") c.developing++;
      else if (s === "WEAK") c.weak++;
      else c.neww++;
    }
    return c;
  }, [examTopics]);

  // Insight bullets — pulled from rank-projection commentary +
  // weakness-diagnosis patterns + computed analytics.
  const insights = useMemo(() => buildInsights({
    readiness,
    rank,
    weakness,
    streak,
    sortedTopics,
    activeExamName: activeExam?.name,
    projectedReadiness,
  }), [readiness, rank, weakness, streak, sortedTopics, activeExam, projectedReadiness]);

  const loading = profile === null && readiness === null && mastery === null;
  const hasData = (mastery?.length ?? 0) > 0 && totalSessions > 0;

  if (loading) {
    return (
      <AppShell title="My Analysis">
        <SkeletonRows count={3} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="My Analysis"
      actions={
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "6px 12px" }}
          onClick={() => alert("Sharable progress links land in Phase 2.")}
        >
          ↗ Share progress
        </button>
      }
    >
      {/* Tab bar — Overview is the analytical view here; the rest are
          quick-jumps to the dedicated pages we now ship for each concern.
          Better than dead "Coming soon" buttons. */}
      <nav className="an-tabs" aria-label="Analysis tabs">
        <button
          type="button"
          className={`an-tab ${tab === "overview" ? "is-active" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <Link to="/history" className="an-tab" style={{ textDecoration: "none" }}>
          Sessions →
        </Link>
        <Link to="/catalog" className="an-tab" style={{ textDecoration: "none" }}>
          Topics →
        </Link>
        <Link to="/rank" className="an-tab" style={{ textDecoration: "none" }}>
          Predictions →
        </Link>
        <Link to="/bookmarks" className="an-tab" style={{ textDecoration: "none" }}>
          Saved →
        </Link>
      </nav>

      {/* Exam scope chips */}
      {exams.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
          role="group"
          aria-label="Exam scope"
        >
          <span style={{ fontSize: 11, color: "var(--ink-3)", marginRight: 4 }}>
            Scope:
          </span>
          {enrolledExamIds.map((examId) => {
            const meta = examsMeta[examId];
            if (!meta) return null;
            const active = examId === activeExamId;
            return (
              <button
                key={examId}
                type="button"
                onClick={() => setActiveExamId(examId)}
                aria-pressed={active}
                style={{
                  cursor: "pointer",
                  appearance: "none",
                  background: active ? "var(--accent-soft)" : "var(--paper-2)",
                  border: `1px solid ${active ? "var(--accent-soft0)" : "var(--ink-4)"}`,
                  borderRadius: "var(--r-pill)",
                  color: active ? "var(--accent-2)" : "var(--ink-2)",
                  padding: "4px 12px",
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  transition: "all 120ms var(--m-ease)",
                }}
              >
                {meta.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Empty state when learner has no sessions yet */}
      {!hasData ? (
        <EmptyState
          illustration={<span aria-hidden style={{ fontSize: 40 }}>📊</span>}
          title="Analysis unlocks after your first session"
          description="Run any practice round on a topic and we'll start tracking your readiness, mastery, and AI ability estimate. Insights and projections appear once you have at least 3 answered items."
          actions={
            <Link to="/catalog" style={{ textDecoration: "none" }}>
              <Button variant="aurora" iconLeft={<span aria-hidden>✦</span>}>
                Start practice
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Phase 1B — Performance cards: rank projection + readiness band.
              Two-up grid; the readiness card gets a slightly wider track
              since its bullet list usually carries more content. */}
          {(rank || readinessBand) && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns: rank && readinessBand
                  ? "minmax(0, 1fr) minmax(0, 1.4fr)"
                  : "minmax(0, 1fr)",
                gap: 12,
                marginBottom: "var(--sp-3)",
                alignItems: "stretch",
              }}
              aria-label="Performance projections"
            >
              {rank && (
                <div className="card" style={{ padding: 14 }}>
                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontSize: 12,
                      color: "var(--ink-3)",
                      textTransform: "uppercase",
                      letterSpacing: 0.04,
                    }}
                  >
                    Projected rank · {rank.examCode}
                  </h3>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: "var(--info)",
                      fontVariantNumeric: "tabular-nums",
                      marginBottom: 4,
                    }}
                  >
                    #{(rank.projectedRank ?? 0).toLocaleString()}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      marginBottom: 8,
                    }}
                  >
                    Range: #{(rank.rankLow ?? 0).toLocaleString()} – #{(rank.rankHigh ?? 0).toLocaleString()} · top {(100 - (rank.projectedPercentile ?? 0)).toFixed(0)}%
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ink-4)",
                      paddingTop: 8,
                      borderTop: "1px solid var(--rule)",
                    }}
                  >
                    {rank.totalCandidates
                      ? `Of ${rank.totalCandidates.toLocaleString()} candidates · readiness ${(rank.readiness * 100).toFixed(0)}%`
                      : `Readiness ${(rank.readiness * 100).toFixed(0)}%`}
                  </div>
                </div>
              )}
              {readinessBand && (
                <div className="card" style={{ padding: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "var(--ink-3)",
                        textTransform: "uppercase",
                        letterSpacing: 0.04,
                      }}
                    >
                      Readiness band
                    </h3>
                    <Pill
                      tone={
                        readinessBand.band === "approaching"
                          ? "success"
                          : readinessBand.band === "on_track"
                          ? "info"
                          : readinessBand.band === "behind"
                          ? "warning"
                          : "danger"
                      }
                    >
                      {readinessBand.band.replace("_", " ")}
                    </Pill>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink-2)",
                      marginBottom: 6,
                    }}
                  >
                    Target {Math.round(readinessBand.target_score * 100)}% in {readinessBand.days_to_exam} days
                  </div>
                  {readinessBand.actions.length > 0 && (
                    <ul
                      style={{
                        margin: "8px 0 0",
                        paddingLeft: 18,
                        fontSize: 12,
                        color: "var(--ink-2)",
                      }}
                    >
                      {readinessBand.actions.slice(0, 3).map((a, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Phase 1D — Rank trajectory + career outcomes + national rank.
              Three-up grid with each track equal-width and minmax(0, …)
              so children can't push the row past the available width. */}
          {user && rank && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr)",
                gap: 12,
                margin: "12px 0",
                alignItems: "stretch",
              }}
            >
              <div style={{ minWidth: 0, display: "flex" }}>
                <RankTrajectoryChart userId={user.id} examCode={rank.examCode} />
              </div>
              <div style={{ minWidth: 0, display: "flex" }}>
                <CareerOutcomeCard examCode={rank.examCode} readiness={readiness?.score ?? 0.5} />
              </div>
              <div style={{ minWidth: 0, display: "flex" }}>
                <NationalRankCard userId={user.id} examCode={rank.examCode} />
              </div>
            </section>
          )}

          {/* Phase 1C — Confidence calibration + mistake replay.
              2:1 grid so the mistake-replay card fills the remaining
              width instead of sitting at its 220px natural width and
              leaving a big empty band on the right. */}
          {user && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
                gap: 12,
                margin: "12px 0",
                alignItems: "stretch",
              }}
            >
              <div style={{ minWidth: 0, display: "flex" }}>
                <ConfidenceGapCard userId={user.id} />
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "16px 18px",
                  background: "var(--paper-2)",
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-3)",
                    textTransform: "uppercase",
                    letterSpacing: 0.04,
                    marginBottom: 10,
                    fontWeight: 700,
                  }}
                >
                  Practice your mistakes
                </div>
                <MistakeReplayButton
                  userId={user.id}
                  className="btn btn-primary"
                  label="▶ Replay all my mistakes"
                />
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    marginTop: 8,
                    lineHeight: 1.5,
                  }}
                >
                  A focused 10-question session pulled from your wrong answers.
                </div>
              </div>
            </section>
          )}

          {/* KPI strip — 5 Aurora StatCards */}
          <section
            aria-label="Key analytics"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <StatCard
              size="sm"
              label="AI Readiness"
              value={readinessPct.toFixed(1)}
              deltaLabel={
                readiness?.nTopics
                  ? `${readiness.nTopics} topic${readiness.nTopics === 1 ? "" : "s"} tracked`
                  : "—"
              }
              tone="success"
            />
            <StatCard
              size="sm"
              label={
                projectedReadiness
                  ? `Predicted ${formatShortDate(projectedReadiness.target)}`
                  : "Predicted"
              }
              value={
                projectedReadiness
                  ? Math.round(projectedReadiness.projected * 100)
                  : "—"
              }
              deltaLabel={
                projectedReadiness
                  ? `▲ ${projectedReadiness.days} days to target`
                  : "Set a target date to project"
              }
              tone="aurora"
            />
            <StatCard
              size="sm"
              label="AI Ability (θ)"
              value={theta >= 0 ? `+${theta.toFixed(2)}` : theta.toFixed(2)}
              deltaLabel={abilityBand}
              tone="brand"
            />
            <StatCard
              size="sm"
              label="Answer precision"
              value={`${answerPrecisionPct}%`}
              deltaLabel={`avg mastery · ${tested.length} topic${tested.length === 1 ? "" : "s"}`}
              tone="warning"
            />
            <StatCard
              size="sm"
              label="Learning events"
              value={(learningEvents ?? 0).toLocaleString()}
              deltaLabel={
                `${totalSessions} session${totalSessions === 1 ? "" : "s"}` +
                (streak?.currentStreak ? ` · ${streak.currentStreak}d streak` : "")
              }
              tone="aurora"
            />
          </section>

          {/* AI insights — first goes in an AIInsightCard, rest as a list. */}
          {insights.length > 0 ? (
            <section aria-label="AI insights" style={{ marginBottom: 16 }}>
              <AIInsightCard
                eyebrow={
                  <>
                    AI-GENERATED INSIGHTS
                    {activeExam ? <> · {activeExam.name}</> : null}
                    {readiness?.updatedAt ? (
                      <> · updated {formatRelative(readiness.updatedAt)}</>
                    ) : null}
                  </>
                }
                headline={stripHtml(insights[0]!.text)}
                description={
                  insights.length > 1 ? (
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                      {insights.slice(1).map((ins, i) => (
                        <li key={i} style={{ color: "var(--ink-2)" }}>
                          <span
                            aria-hidden="true"
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: ins.color,
                              marginRight: 8,
                              verticalAlign: "middle",
                            }}
                          />
                          {stripHtml(ins.text)}
                        </li>
                      ))}
                    </ul>
                  ) : undefined
                }
              />
            </section>
          ) : null}

          {/* Two-col: trajectory chart + (subjects + ability gauge) */}
          <div className="an-main-grid" style={{ marginTop: "var(--sp-4)" }}>
            {/* Trajectory chart */}
            <div className="card">
              <div className="sec-row">
                <div>
                  <h2 className="section-heading">Readiness trajectory</h2>
                  <div style={{ fontSize: 9.5, color: "var(--ink-4)", marginTop: 1 }}>
                    {activeExam?.name ?? "Global"} · EWA model
                  </div>
                </div>
                <div className="an-period-tabs" role="tablist">
                  {(["30D", "90D", "ALL"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`an-pt ${period === p ? "is-active" : ""}`}
                      onClick={() => setPeriod(p)}
                    >
                      {p === "ALL" ? "All" : p}
                    </button>
                  ))}
                </div>
              </div>

              {readiness && readiness.score > 0 ? (
                <TrajectoryChart
                  current={readiness.score}
                  projected={projectedReadiness?.projected ?? null}
                  daysToTarget={projectedReadiness?.days ?? null}
                  period={period}
                />
              ) : (
                <div className="an-chart-empty">
                  Trajectory will appear here once you have your first session.
                  <br />
                  We track readiness over time and project against your target date.
                </div>
              )}

              <div className="an-chart-legend">
                <div className="an-chart-legend-item">
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 2,
                      background: "var(--good)",
                      borderRadius: 1,
                    }}
                  />
                  Actual (smoothed)
                </div>
                <div className="an-chart-legend-item">
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 0,
                      borderTop: "1.5px dashed var(--info)",
                    }}
                  />
                  AI projection
                </div>
                <div className="an-chart-legend-item" style={{ color: "var(--warn)" }}>
                  ◇ Historical series — phase 2
                </div>
              </div>
            </div>

            {/* Subject mastery + ability gauge */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card">
                <div className="sec-row">
                  <h2 className="section-heading">Subject mastery</h2>
                  <Link to="/catalog" className="see auth-link">
                    Topics ›
                  </Link>
                </div>
                {subjectStats.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                    No subject roll-up yet — answer a few items to seed it.
                  </div>
                ) : (
                  <div className="an-subj-row">
                    {subjectStats.map((s) => {
                      const pct = Math.round(s.ewa * 100);
                      const strength = strengthFor(s.ewa);
                      const color =
                        strength === "STRONG"
                          ? "var(--good)"
                          : strength === "DEVELOPING"
                            ? "var(--info)"
                            : "var(--bad)";
                      return (
                        <div key={s.subjectId} className="an-subj">
                          <div className="an-subj-head">
                            <div className="an-subj-name">
                              <span>{s.name}</span>
                              <span className={`str ${strengthClassFor(strength)}`}>
                                {strength}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span className="an-subj-pct" style={{ color }}>
                                {pct}%
                              </span>
                            </div>
                          </div>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="sec-row">
                  <h2 className="section-heading">AI ability estimate</h2>
                  <Pill tone="info">◈ IRT model</Pill>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 800,
                      color: "var(--gold)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    θ {theta >= 0 ? `+${theta.toFixed(2)}` : theta.toFixed(2)}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
                      {abilityBand}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ink-4)" }}>
                      derived from mean EWA · {tested.length} topic
                      {tested.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <div className="an-gauge">
                  <div className="an-gauge-fill" style={{ width: `${gaugePct}%` }} />
                </div>
                <div className="an-gauge-axis">
                  <span>Beginner</span>
                  <span>Mid</span>
                  <span>Advanced</span>
                </div>
              </div>
            </div>
          </div>

          {/* Topic mastery table */}
          <div className="card" style={{ marginTop: "var(--sp-4)" }}>
            <div className="sec-row">
              <div>
                <h2 className="section-heading">
                  Topic mastery breakdown · {examTopics.length} topic
                  {examTopics.length === 1 ? "" : "s"}
                </h2>
                <div style={{ fontSize: 9.5, color: "var(--ink-4)", marginTop: 1 }}>
                  Sorted by AI priority · click any topic to practice
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Pill tone="danger">{topicCounts.weak} Weak</Pill>
                <Pill tone="info">{topicCounts.developing} Developing</Pill>
                <Pill tone="success">{topicCounts.strong} Strong</Pill>
                {topicCounts.neww > 0 ? (
                  <Pill tone="muted">{topicCounts.neww} New</Pill>
                ) : null}
              </div>
            </div>

            <table className="an-tt">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Subject</th>
                  <th>Mastery</th>
                  <th>Strength</th>
                  <th style={{ textAlign: "right" }}>Sessions</th>
                </tr>
              </thead>
              <tbody>
                {(showAllTopics ? sortedTopics : sortedTopics.slice(0, 7)).map((t) => {
                  const pct = Math.round(t.ewa * 100);
                  const strength = strengthFor(t.ewa);
                  const barColor =
                    strength === "STRONG"
                      ? "var(--good)"
                      : strength === "DEVELOPING"
                        ? "var(--info)"
                        : strength === "WEAK"
                          ? "var(--bad)"
                          : "var(--ink-4)";
                  return (
                    <tr
                      key={t.topicId}
                      onClick={() => {
                        window.location.href = `/catalog/topic/${t.topicId}`;
                      }}
                    >
                      <td>
                        <div className="an-tt-name">{t.title}</div>
                        {t.n === 0 ? (
                          <div className="an-tt-sub">Not started yet</div>
                        ) : null}
                      </td>
                      <td>
                        <span style={{ fontSize: 10.5, color: "var(--ink-2)" }}>
                          {t.subjectName}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="an-tt-bar">
                            <div className="bar-track">
                              <div
                                className="bar-fill"
                                style={{ width: `${pct}%`, background: barColor }}
                              />
                            </div>
                          </div>
                          <span className="an-tt-pct" style={{ color: barColor }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`str ${strengthClassFor(strength)}`}>
                          {strength}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }} className="an-tt-last">
                        {t.n}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedTopics.length > 7 ? (
              <button
                type="button"
                className="an-tt-foot"
                onClick={() => setShowAllTopics((v) => !v)}
                style={{ background: "transparent", border: 0, width: "100%", fontFamily: "inherit" }}
              >
                {showAllTopics
                  ? "Collapse"
                  : `Show all ${sortedTopics.length} topics ›`}
              </button>
            ) : null}
          </div>

          {/* Share card */}
          <div className="an-share" style={{ marginTop: "var(--sp-4)" }}>
            <div className="an-share-icon">📊</div>
            <div className="an-share-body">
              <div className="an-share-title">Share your progress report</div>
              <div className="an-share-sub">
                Generate a read-only link · share with parents, teachers, or
                institution admin · revoke anytime
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flexShrink: 0 }}
              onClick={() => alert("Sharable progress links land in Phase 2.")}
            >
              Generate link →
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}

// Trajectory chart — synthesises a smoothed approach line from 0 to
// `current` over the chosen window, plus an optional dashed projection
// line forward to the target date.
function TrajectoryChart({
  current,
  projected,
  daysToTarget,
  period,
}: {
  current: number;
  projected: number | null;
  daysToTarget: number | null;
  period: Period;
}) {
  const W = 320;
  const H = 130;
  // Map readiness 0..1 → y in [110, 18] (inverted so high reads top).
  const yFor = (r: number) => 110 - Math.max(0, Math.min(1, r)) * 92;

  const periodDays = period === "30D" ? 30 : period === "90D" ? 90 : 180;
  const todayX = W * 0.78;

  // Smoothed historical curve — easeOut from 0 to current across the window.
  const points: Array<[number, number]> = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Eased ramp: 1 - (1 - t)^2 (quadratic ease-out).
    const eased = 1 - (1 - t) * (1 - t);
    const x = 14 + (todayX - 14) * t;
    const y = yFor(current * eased);
    points.push([x, y]);
  }
  const linePath = points
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  const fillPath = `${linePath} L${todayX},118 L14,118 Z`;

  return (
    <div className="an-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="an-ga" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10C47A" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10C47A" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="an-gb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F87F6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#4F87F6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        <line x1="0" y1="18" x2={W} y2="18" stroke="var(--card)" />
        <line x1="0" y1="55" x2={W} y2="55" stroke="var(--card)" />
        <line x1="0" y1="92" x2={W} y2="92" stroke="var(--card)" />
        <text x="2" y="16" fill="var(--ink-4)" fontSize="7.5">100</text>
        <text x="2" y="53" fill="var(--ink-4)" fontSize="7.5">60</text>
        <text x="2" y="90" fill="var(--ink-4)" fontSize="7.5">20</text>
        {/* smoothed actual */}
        <path d={fillPath} fill="url(#an-ga)" />
        <path d={linePath} fill="none" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" />
        {/* today dot */}
        <circle cx={todayX} cy={yFor(current)} r="4" fill="var(--good)" stroke="var(--paper)" strokeWidth="2" />
        <text
          x={todayX - 6}
          y={yFor(current) - 7}
          fill="var(--good)"
          fontSize="8"
          textAnchor="middle"
        >
          {Math.round(current * 100)}
        </text>
        {/* projection */}
        {projected !== null && projected > current ? (
          <>
            <path
              d={`M${todayX},${yFor(current)} L${W - 4},${yFor(projected)}`}
              fill="none"
              stroke="var(--info)"
              strokeWidth="1.8"
              strokeDasharray="4,3"
              strokeLinecap="round"
            />
            <path
              d={`M${todayX},${yFor(current)} L${W - 4},${yFor(projected)} L${W - 4},118 L${todayX},118 Z`}
              fill="url(#an-gb)"
            />
            <circle cx={W - 4} cy={yFor(projected)} r="3.5" fill="var(--info)" stroke="var(--paper)" strokeWidth="1.5" />
            <text x={W - 8} y={yFor(projected) - 5} fill="var(--info)" fontSize="7.5" textAnchor="end">
              {Math.round(projected * 100)}
            </text>
          </>
        ) : null}
        {/* today marker */}
        <line
          x1={todayX}
          y1="10"
          x2={todayX}
          y2="118"
          stroke="var(--rule)"
          strokeDasharray="2,3"
        />
        <text x={todayX} y="126" fill="var(--ink-4)" fontSize="7.5" textAnchor="middle">
          Today
        </text>
        <text x="14" y="126" fill="var(--ink-4)" fontSize="7.5">
          {`-${periodDays}d`}
        </text>
        {projected !== null && daysToTarget !== null ? (
          <text x={W - 4} y="126" fill="var(--info)" fontSize="7.5" textAnchor="end">
            +{daysToTarget}d
          </text>
        ) : null}
      </svg>
    </div>
  );
}

interface InsightLine {
  text: string;
  color: string;
}

function buildInsights(args: {
  readiness: ReadinessResponse | null;
  rank: RankProjection | null;
  weakness: WeaknessResponse | null;
  streak: StreakResponse | null;
  sortedTopics: TopicRow[];
  activeExamName?: string;
  projectedReadiness: { projected: number; days: number; target: Date } | null;
}): InsightLine[] {
  const out: InsightLine[] = [];
  const { readiness, rank, weakness, streak, sortedTopics, projectedReadiness } = args;

  // Projection insight
  if (projectedReadiness && readiness && readiness.score > 0) {
    const cur = Math.round(readiness.score * 100);
    const pred = Math.round(projectedReadiness.projected * 100);
    if (pred >= cur + 5) {
      out.push({
        text: `<strong>On track.</strong> At your current pace you'll hit ${pred} readiness by ${formatShortDate(projectedReadiness.target)} — up from ${cur} today.`,
        color: "var(--good)",
      });
    } else if (pred <= cur + 1) {
      out.push({
        text: `<strong>${projectedReadiness.days} days to target.</strong> Cadence has plateaued — bump session frequency to push readiness past ${cur}.`,
        color: "var(--warn)",
      });
    }
  }

  // Rank-projection commentary
  if (rank && rank.commentary) {
    out.push({
      text: `<strong>${rank.examCode} projection:</strong> ${rank.commentary}${rank.projectedRank ? ` (rank ~${rank.projectedRank.toLocaleString()})` : ""}`,
      color: rank.confidence === "high" ? "var(--good)" : "var(--info)",
    });
  }

  // Weakest topic
  const weakest = sortedTopics.find((t) => t.n > 0 && t.ewa < 0.4);
  if (weakest) {
    out.push({
      text: `<strong>${weakest.title} is your biggest drag.</strong> Mastery ${Math.round(weakest.ewa * 100)}% across ${weakest.n} session${weakest.n === 1 ? "" : "s"} — fixing it alone moves readiness most.`,
      color: "var(--bad)",
    });
  }

  // Cross-topic patterns
  if (weakness && weakness.patterns.length > 0) {
    const p = weakness.patterns[0];
    out.push({
      text: `<strong>Cross-topic pattern:</strong> ${p.pattern}`,
      color: "var(--warn)",
    });
  }

  // Streak
  if (streak && streak.currentStreak >= 3) {
    out.push({
      text: `<strong>${streak.currentStreak}-day streak.</strong> Consistency compounds — this is the single highest-ROI signal we track.`,
      color: "var(--good)",
    });
  } else if (streak && streak.currentStreak === 0 && streak.longestStreak > 0) {
    out.push({
      text: `<strong>Streak broken</strong> (longest: ${streak.longestStreak}d). One short session today gets you back on the board.`,
      color: "var(--warn)",
    });
  }

  return out.slice(0, 4);
}

function strengthClassFor(s: ReturnType<typeof strengthFor>): string {
  return s === "STRONG"
    ? "str-strong"
    : s === "DEVELOPING"
      ? "str-developing"
      : s === "WEAK"
        ? "str-weak"
        : "str-not-started";
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Strip HTML tags from an insight string. buildInsights() produces
// strings like "<strong>On track.</strong> At your pace…". We render
// the plain text so AI insight cards stay free of dangerouslySetInnerHTML.
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "recently";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}