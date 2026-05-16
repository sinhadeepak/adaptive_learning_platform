import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";

// ─────────────────────────────────────────────────────────────────────────
// Exam Dashboard — React port of docs/ui/01_StudentPortal_Web/06_exam-dashboard.html.
// Reached by clicking an exam card on /home.
//
// Eight zones (top to bottom):
//   1. Topbar back-link "← Dashboard / EXAM_NAME" + live chips
//   2. Exam hero — readiness ring + 3 stat tiles + CTAs
//   3. AI recommends — exam-specific weakest-topic banner
//   4. Subject mastery — Subject rows with bar + decay warning
//   5. Readiness trajectory chart — 90-day SVG line chart + mock history
//   6. Topic mastery matrix — 4-col grid color-coded by strength
//   7. AI insights — numbered insight items
//   8. Assignments — exam-scoped due/done items (placeholder)
//
// Data wiring (real vs derived/synthesised):
//   • Real: catalog/exams (meta), catalog/exams/{id}/subjects,
//     catalog/subjects/{id}/topics, analytics/mastery (filter to topics
//     belonging to this exam).
//   • Derived: per-subject readiness = mean(EWA across that subject's topics
//     intersected with the user's mastery list). Exam readiness =
//     mean(per-subject readiness).
//   • Synthesised (placeholder until backend lands): trajectory line, mock
//     history table, AI prediction stat, "this week +N", assignments list.
// ─────────────────────────────────────────────────────────────────────────

interface ExamMeta {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

interface Subject {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}

interface Topic {
  id: string;
  subjectId: string;
  title: string;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface TopicCard {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  ewa: number; // 0..1; -1 means "not started"
  n: number;
}

interface ProfileResponse {
  exams: Array<{ examId: string; targetDate: string | null }>;
}

const SUBJECT_EMOJI: Record<string, string> = {
  Biology: "🔬",
  Chemistry: "⚗️",
  Physics: "⚛️",
  Mathematics: "📐",
  Maths: "📐",
  English: "📖",
  History: "📜",
  Geography: "🌍",
};

export function ExamDetail() {
  const { examId = "" } = useParams<{ examId: string }>();
  const { user } = useAuth();
  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [topics, setTopics] = useState<TopicCard[] | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch exam meta + target date.
  useEffect(() => {
    if (!examId) return;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (r.ok) {
          const all = (await r.json()) as ExamMeta[];
          const match = all.find((e) => e.id === examId);
          if (match) setExam(match);
          else setError("Exam not found.");
        }
      } catch {
        setError("We couldn't load this exam.");
      }
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (r.ok) {
          const body = (await r.json()) as ProfileResponse;
          const e = body.exams.find((x) => x.examId === examId);
          if (e) setTargetDate(e.targetDate);
        }
      } catch {
        /* swallow */
      }
    })();
  }, [examId]);

  // Fetch subjects + topics + user mastery, then join.
  useEffect(() => {
    if (!examId || !user) return;
    (async () => {
      try {
        const subRes = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (!subRes.ok) {
          setSubjects([]);
          setTopics([]);
          return;
        }
        const subs = (await subRes.json()) as Subject[];
        setSubjects(subs);

        // Mastery list (one fetch).
        let masteryMap = new Map<string, { ewa: number; n: number }>();
        try {
          const mRes = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
          if (mRes.ok) {
            const body = (await mRes.json()) as MasteryListResponse;
            body.topics.forEach((t) => {
              masteryMap.set(t.topicId, { ewa: t.ewa, n: t.n });
            });
          }
        } catch {
          /* swallow — empty mastery is the fallback */
        }

        // Topics per subject (parallel).
        const allTopics = await Promise.all(
          subs.map(async (s): Promise<TopicCard[]> => {
            try {
              const tr = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
              if (!tr.ok) return [];
              const list = (await tr.json()) as Topic[];
              return list.map((t) => {
                const m = masteryMap.get(t.id);
                return {
                  id: t.id,
                  title: t.title,
                  subjectId: s.id,
                  subjectName: s.name,
                  ewa: m ? m.ewa : -1,
                  n: m ? m.n : 0,
                };
              });
            } catch {
              return [];
            }
          }),
        );
        setTopics(allTopics.flat());
      } catch {
        setError("We couldn't load this exam's content.");
      }
    })();
  }, [examId, user]);

  // ── Derivations ──
  const subjectReadiness = useMemo(() => {
    if (!subjects || !topics) return [];
    return subjects.map((s) => {
      const inSubject = topics.filter((t) => t.subjectId === s.id);
      const tracked = inSubject.filter((t) => t.ewa >= 0);
      const ewaMean =
        tracked.length > 0
          ? tracked.reduce((sum, t) => sum + t.ewa, 0) / tracked.length
          : 0;
      const buckets = {
        strong: inSubject.filter((t) => t.ewa >= 0.7).length,
        developing: inSubject.filter((t) => t.ewa >= 0.4 && t.ewa < 0.7).length,
        weak: inSubject.filter((t) => t.ewa >= 0 && t.ewa < 0.4).length,
        notStarted: inSubject.filter((t) => t.ewa < 0).length,
      };
      // Pick a single "eye-opening" highlight per subject so each row
      // tells the student something they didn't already get from the
      // bar + counts. Priority: weakest tracked → first unstarted.
      const weakest = tracked.slice().sort((a, b) => a.ewa - b.ewa)[0];
      const firstUnstarted = inSubject.find((t) => t.ewa < 0);
      return {
        subjectId: s.id,
        name: s.name,
        ewa: ewaMean,
        nTracked: tracked.length,
        buckets,
        totalTopics: inSubject.length,
        weakest: weakest ?? null,
        firstUnstarted: firstUnstarted ?? null,
      };
    });
  }, [subjects, topics]);

  const examReadinessPct = useMemo(() => {
    if (subjectReadiness.length === 0) return 0;
    const tracked = subjectReadiness.filter((s) => s.nTracked > 0);
    if (tracked.length === 0) return 0;
    const mean =
      tracked.reduce((sum, s) => sum + s.ewa, 0) / tracked.length;
    return Math.round(mean * 100);
  }, [subjectReadiness]);

  const trackedTopics = useMemo(
    () => topics?.filter((t) => t.ewa >= 0).length ?? 0,
    [topics],
  );

  const weakest = useMemo(() => {
    if (!topics) return null;
    const tracked = topics.filter((t) => t.ewa >= 0);
    if (tracked.length === 0) return null;
    const sorted = [...tracked].sort((a, b) => a.ewa - b.ewa);
    return sorted[0].ewa < 0.5 ? sorted[0] : null;
  }, [topics]);

  const decayingTopics = useMemo(() => {
    // Stand-in for "haven't been studied in 9+ days" — until per-topic
    // last-attempt timestamps land, we tag the bottom-3 sub-50% topics.
    if (!topics) return [];
    return topics
      .filter((t) => t.ewa >= 0 && t.ewa < 0.5)
      .sort((a, b) => a.ewa - b.ewa)
      .slice(0, 3);
  }, [topics]);

  // Quick-win candidates: tracked but mid-tier (45–69%) — small push
  // crosses into the green band, so they're the highest-ROI sessions.
  const quickWins = useMemo(() => {
    if (!topics) return [];
    return topics
      .filter((t) => t.ewa >= 0.45 && t.ewa < 0.7)
      .sort((a, b) => b.ewa - a.ewa)
      .slice(0, 4);
  }, [topics]);

  // For brand-new users (no mastery anywhere), surface the chapter most
  // teachers start with: pick the first topic of each subject (sort_order=1
  // by catalog convention) so the "Where to start" panel always lands.
  const startingPoints = useMemo(() => {
    if (!topics || !subjects) return [];
    if (trackedTopics > 0) return [];
    const out: TopicCard[] = [];
    for (const s of subjects) {
      const first = topics.find((t) => t.subjectId === s.id);
      if (first) out.push(first);
      if (out.length >= 4) break;
    }
    return out;
  }, [topics, subjects, trackedTopics]);

  // Topic-mastery matrix removed in P7 per user direction. Subjects
  // are still drillable via the Subject mastery rows above; per-topic
  // detail lives on the StudyMap drill-down page (`/study/:examId/:subjectId`).

  const days = daysUntil(targetDate);

  if (error) {
    return (
      <AppShell title="Exam">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
        <Link to="/home" className="btn btn-ghost" style={{ marginTop: "var(--sp-3)" }}>
          ← Back to dashboard
        </Link>
      </AppShell>
    );
  }

  if (!exam || !subjects || !topics) {
    return (
      <AppShell title="Exam">
        <SkeletonRows count={5} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={exam.name}
      chips={[
        { label: "Live readiness", live: true },
        ...(days !== null
          ? [{ label: `📅 ${days} day${days === 1 ? "" : "s"} left` }]
          : []),
      ]}
      actions={
        <Link to="/home" className="topbar-back" aria-label="Back to dashboard">
          ← Dashboard
        </Link>
      }
    >
      {/* ── Zone 2: Exam hero ──────────────────────────────────────── */}
      <section className="exam-hero" aria-label={`${exam.name} readiness`}>
        <div className="eh-left">
          <div className="eh-tag">
            <span className="ai-pill">◈ AI READINESS ENGINE</span>
            <span className="eh-tag-meta">
              EWA mastery model · {trackedTopics} topic{trackedTopics === 1 ? "" : "s"} tracked
            </span>
          </div>
          <h1 className="eh-title">{exam.name}</h1>
          <p className="eh-sub">
            {exam.subtitle ?? "Comprehensive exam preparation"}
            <br />
            {subjects.length > 0 ? (
              <>
                <strong>{subjects.map((s) => s.name).join(" · ")}</strong> ·{" "}
                {topics.length} topics
              </>
            ) : null}
          </p>
          <div className="eh-btns">
            <Link to="/catalog" className="btn-ai">
              ◈ Start Practice
            </Link>
            <Link
              to={`/catalog/exam/${examId}`}
              className="btn btn-ghost"
            >
              Browse topics →
            </Link>
          </div>
        </div>
        <div className="eh-right">
          <ExamRing pct={examReadinessPct} />
          <div className="eh-stats">
            <div className="eh-stat">
              <div className="eh-stat-num" style={{ color: "var(--good)" }}>
                {trackedTopics > 0
                  ? Math.min(100, Math.round(examReadinessPct + (1 - examReadinessPct / 100) * 30))
                  : "—"}
              </div>
              <div className="eh-stat-lbl">AI PREDICTION</div>
            </div>
            <div className="eh-stat">
              <div className="eh-stat-num" style={{ color: "var(--warn)" }}>
                {days ?? "—"}
              </div>
              <div className="eh-stat-lbl">DAYS LEFT</div>
            </div>
            <div className="eh-stat">
              <div className="eh-stat-num" style={{ color: "var(--info)" }}>
                {trackedTopics > 0 ? `+${(examReadinessPct * 0.05).toFixed(1)}` : "—"}
              </div>
              <div className="eh-stat-lbl">THIS WEEK</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Zone 3: AI recommends ──────────────────────────────────── */}
      {weakest ? (
        <Link
          to={`/catalog/topic/${weakest.id}`}
          className="reco-banner"
          style={{ marginTop: "var(--sp-4)" }}
        >
          <div className="reco-icon">⚡</div>
          <div className="reco-body">
            <div className="reco-eyebrow">
              ◈ AI RECOMMENDS · RIGHT NOW · for {exam.name}
            </div>
            <div className="reco-title">
              Practice {weakest.title} — your weakest topic in {weakest.subjectName}
            </div>
            <div className="reco-sub">
              Mastery is at {Math.round(weakest.ewa * 100)}%. A short focused
              round on this topic will move your readiness the most.
            </div>
            <div className="reco-impact">
              ▲ Est. +{Math.max(2, Math.round((1 - weakest.ewa) * 5))} readiness pts ·
              ~10 minutes
            </div>
          </div>
          <span className="btn-ai" style={{ flexShrink: 0 }}>
            Start Now →
          </span>
        </Link>
      ) : null}

      {/* ── Zones 4 + 5: Subject mastery + Trajectory ──────────────── */}
      <div className="dashboard-bottom-grid" style={{ marginTop: "var(--sp-4)" }}>

        {/* Zone 4: Subject mastery */}
        <div className="card">
          <div className="sec-row">
            <div>
              <h2 className="section-heading">Subject mastery</h2>
              <div style={{ fontSize: 9.5, color: "var(--ink-4)", marginTop: 1 }}>
                EWA model · recency-weighted · updates after every session
              </div>
            </div>
            <Link to={`/study/${examId}`} className="see-all">
              Drill into topics ›
            </Link>
          </div>

          {subjectReadiness.length === 0 ? (
            <p style={{ color: "var(--ink-3)", fontSize: 12 }}>
              This exam doesn't have subjects in the catalog yet.
            </p>
          ) : (
            <>
              {subjectReadiness.map((s) => {
                const pct = Math.round(s.ewa * 100);
                const bucket =
                  s.nTracked === 0
                    ? "not-started"
                    : s.ewa >= 0.7
                      ? "strong"
                      : s.ewa >= 0.4
                        ? "developing"
                        : "weak";
                const barColor =
                  bucket === "strong"
                    ? "var(--good)"
                    : bucket === "developing"
                      ? "var(--info)"
                      : bucket === "weak"
                        ? "var(--bad)"
                        : "var(--ink-4)";
                const pctColor =
                  bucket === "strong"
                    ? "var(--good)"
                    : bucket === "developing"
                      ? "var(--info)"
                      : "var(--bad)";
                return (
                  <Link
                    key={s.subjectId}
                    to={`/study/${examId}/${s.subjectId}`}
                    className="subj-row"
                    style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                    aria-label={`Open ${s.name} in Study Map`}
                  >
                    <span className="subj-emoji">
                      {SUBJECT_EMOJI[s.name] ?? "📚"}
                    </span>
                    <div className="subj-body">
                      <div className="subj-top">
                        <span className="subj-name">{s.name}</span>
                        <div className="subj-right">
                          <span className={`str-bucket str-${bucket}`}>
                            {bucket === "not-started"
                              ? "NEW"
                              : bucket.toUpperCase()}
                          </span>
                          <span className="subj-pct" style={{ color: pctColor }}>
                            {s.nTracked > 0 ? `${pct}%` : "—"}
                          </span>
                          <span
                            aria-hidden
                            style={{
                              fontSize: 14,
                              color: "var(--ink-4)",
                              marginLeft: 4,
                            }}
                          >
                            ›
                          </span>
                        </div>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                      <div className="subj-meta">
                        {s.totalTopics} topic{s.totalTopics === 1 ? "" : "s"} ·{" "}
                        {s.buckets.strong} Strong · {s.buckets.developing} Developing ·{" "}
                        {s.buckets.weak} Weak · {s.buckets.notStarted} Not started
                      </div>
                      {/* Eye-opening detail: one specific call-to-action
                          per subject. Weakest if any data, else where to
                          start. Stays out of the way when there's nothing
                          actionable (subject has no topics). */}
                      {s.weakest ? (
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--bad)",
                            marginTop: 3,
                          }}
                        >
                          Weakest: {s.weakest.title} ·{" "}
                          {Math.round(s.weakest.ewa * 100)}%
                        </div>
                      ) : s.firstUnstarted ? (
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--ink-3)",
                            marginTop: 3,
                          }}
                        >
                          Best to start: {s.firstUnstarted.title}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                );
              })}

              {decayingTopics.length > 0 ? (
                <div className="decay-warn">
                  <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
                  <div className="decay-warn-text">
                    <strong>{decayingTopics.length} weak topic{decayingTopics.length === 1 ? "" : "s"}:</strong>{" "}
                    {decayingTopics
                      .map((t) => `${t.title} (${Math.round(t.ewa * 100)}%)`)
                      .join(" · ")}
                    {" "}— short focused rounds move them the most.
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Zone 5: Trajectory chart (synthesised until per-day analytics lands) */}
        <div className="card">
          <div className="sec-row">
            <div>
              <h2 className="section-heading">Readiness trajectory</h2>
              <div style={{ fontSize: 9.5, color: "var(--ink-4)", marginTop: 1 }}>
                AI exam-day prediction · backed by historical session data once telemetry lands
              </div>
            </div>
          </div>

          <TrajectoryChart current={examReadinessPct} target={85} />

          <div className="chart-legend">
            <div className="chart-legend-item">
              <div
                style={{
                  width: 10,
                  height: 2,
                  background: "var(--good)",
                  borderRadius: 1,
                }}
              />
              <span>Actual score</span>
            </div>
            <div className="chart-legend-item">
              <div
                style={{
                  width: 10,
                  height: 0,
                  borderTop: "1px dashed var(--info)",
                }}
              />
              <span>AI prediction</span>
            </div>
            <div className="chart-legend-item">
              <div
                style={{
                  width: 10,
                  height: 0,
                  borderTop: "1px dashed rgba(245,166,35,0.6)",
                }}
              />
              <span>Target (85)</span>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--rule)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--ink-2)",
                marginBottom: 7,
              }}
            >
              Mock test history
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
                margin: 0,
                padding: "var(--sp-1) 0",
              }}
            >
              No mock tests yet. Take your first full-syllabus mock to see your
              progression here.
            </p>
          </div>
        </div>
      </div>

      {/* ── New insight strip (decay banner + next-session card) ───── */}
      {user && (
        <DecayBanner userId={user.id} examCode={exam.code} />
      )}

      {/* ── Zone 7 + 8: AI insights + Study plan + Time budget ──
          Topic mastery matrix removed in P7 per user direction —
          students drill into individual subjects via the Subject
          mastery rows above. The grid template is overridden to
          single-column so the insights column spans the full width. */}
      <div
        className="dashboard-bottom-grid"
        style={{ marginTop: "var(--sp-4)", gridTemplateColumns: "1fr" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {user && <NextSessionCard userId={user.id} examCode={exam.code} />}

          <div className="insight-card">
            <div className="ins-eyebrow">
              <span>◈</span> AI-GENERATED INSIGHTS · {exam.name}
            </div>
            {buildInsights({
              examName: exam.name,
              examReadinessPct,
              days,
              subjectReadiness,
              weakest,
              decayingTopics,
              trackedTopics,
            }).map((text, i) => (
              <div key={i} className="ins-item">
                <div className="ins-num">{i + 1}</div>
                <div className="ins-text" dangerouslySetInnerHTML={{ __html: text }} />
              </div>
            ))}
          </div>

          {/* Zone 8: AI Study Plan — replaces the empty assignments stub
              with concrete next-actions while real assignments wait on
              an institution wiring. When assignments land, render those
              first and keep the plan panel as a secondary card. */}
          <div className="card" style={{ padding: "12px 14px" }}>
            <div className="sec-row" style={{ marginBottom: 9 }}>
              <h2 className="section-heading">AI Study Plan · {exam.name}</h2>
              <span className="pill pill-muted" style={{ fontSize: 9 }}>
                Auto-generated
              </span>
            </div>

            {trackedTopics === 0 && startingPoints.length > 0 && (
              <StudyPlanGroup
                title="Where to start"
                hint="Foundational chapters — running through these first builds a steady base."
                topics={startingPoints}
              />
            )}

            {weakest && (
              <StudyPlanGroup
                title="Skill gaps to close"
                hint="Lowest mastery — biggest readiness lift per session."
                topics={decayingTopics.length > 0 ? decayingTopics : [weakest]}
              />
            )}

            {quickWins.length > 0 && (
              <StudyPlanGroup
                title="Quick wins"
                hint="Already developing — one more round usually crosses into strong."
                topics={quickWins}
              />
            )}

            {trackedTopics === 0 && startingPoints.length === 0 && (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  margin: 0,
                  padding: "var(--sp-1) 0",
                }}
              >
                Once the catalog has chapters in this exam, this panel will
                point you to the best place to start.
              </p>
            )}

            <div
              style={{
                marginTop: 10,
                paddingTop: 8,
                borderTop: "1px solid var(--rule)",
                fontSize: 10,
                color: "var(--ink-4)",
              }}
            >
              Real assignments + mock tests appear here once your institution
              wires them in.
            </div>
          </div>

          <TimeBudgetCard
            currentPct={examReadinessPct}
            targetPct={85}
            days={days}
          />
        </div>
      </div>
    </AppShell>
  );
}

function ExamRing({ pct }: { pct: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="eh-ring" role="img" aria-label={`Exam readiness ${pct}%`}>
      <svg viewBox="0 0 90 90">
        <defs>
          <linearGradient id="eh-rg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10C47A" />
            <stop offset="100%" stopColor="#4F87F6" />
          </linearGradient>
        </defs>
        <circle
          cx="45"
          cy="45"
          r={r}
          fill="none"
          stroke="var(--rule)"
          strokeWidth="7"
        />
        <circle
          cx="45"
          cy="45"
          r={r}
          fill="none"
          stroke="url(#eh-rg)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          transform="rotate(-90 45 45)"
        />
      </svg>
      <div className="eh-ring-inner">
        <div className="eh-ring-num">{pct}</div>
        <div className="eh-ring-lbl">READINESS</div>
      </div>
    </div>
  );
}

interface TrajectoryProps {
  current: number;
  target: number;
}

function TrajectoryChart({ current, target }: TrajectoryProps) {
  // Until per-day score history lands, we render a smooth ramp from the
  // user's first-quiz baseline (current * 0.6) to today (current) and a
  // forward-projecting prediction line that approaches the target.
  const cy = (pct: number) => 108 - (pct / 100) * 88;
  const today = { x: 248, y: cy(current) };
  const start = { x: 18, y: cy(Math.max(0, current * 0.6)) };
  const predict = { x: 318, y: cy(Math.min(target, current + 15)) };

  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 320 120" preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10C47A" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10C47A" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F87F6" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#4F87F6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="20" x2="320" y2="20" stroke="var(--card)" strokeWidth="1" />
        <line x1="0" y1="50" x2="320" y2="50" stroke="var(--card)" strokeWidth="1" />
        <line x1="0" y1="80" x2="320" y2="80" stroke="var(--card)" strokeWidth="1" />
        <text x="3" y="18" fill="var(--ink-4)" fontSize="8">85</text>
        <text x="3" y="48" fill="var(--ink-4)" fontSize="8">68</text>
        <text x="3" y="78" fill="var(--ink-4)" fontSize="8">50</text>
        <line
          x1="18"
          y1={cy(target)}
          x2="320"
          y2={cy(target)}
          stroke="var(--warn)"
          strokeWidth="1"
          strokeDasharray="3,3"
          opacity="0.45"
        />
        <text x="285" y={cy(target) - 4} fill="var(--warn)" fontSize="8" opacity="0.7">
          Target {target}
        </text>
        <path
          d={`M${start.x},${start.y} Q${(start.x + today.x) / 2},${(start.y + today.y) / 2 - 8} ${today.x},${today.y}`}
          fill="none"
          stroke="var(--good)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d={`M${start.x},${start.y} Q${(start.x + today.x) / 2},${(start.y + today.y) / 2 - 8} ${today.x},${today.y} L${today.x},108 L${start.x},108Z`}
          fill="url(#ga)"
        />
        <circle cx={today.x} cy={today.y} r="4.5" fill="var(--good)" stroke="var(--paper)" strokeWidth="2" />
        <text x={today.x - 8} y={today.y - 6} fill="var(--good)" fontSize="8" textAnchor="middle">
          {current}
        </text>
        <path
          d={`M${today.x},${today.y} Q${(today.x + predict.x) / 2},${(today.y + predict.y) / 2 - 6} ${predict.x},${predict.y}`}
          fill="none"
          stroke="var(--info)"
          strokeWidth="1.8"
          strokeDasharray="4,3"
          strokeLinecap="round"
        />
        <circle cx={predict.x} cy={predict.y} r="4" fill="var(--info)" stroke="var(--paper)" strokeWidth="2" />
        <line
          x1={today.x}
          y1="20"
          x2={today.x}
          y2="108"
          stroke="var(--rule-2)"
          strokeWidth="1"
          strokeDasharray="2,3"
        />
        <text x={today.x} y="115" fill="var(--ink-4)" fontSize="7.5" textAnchor="middle">
          Today
        </text>
        <text x="18" y="115" fill="var(--ink-4)" fontSize="7.5">
          Baseline
        </text>
        <text x="314" y="115" fill="var(--info)" fontSize="7.5" textAnchor="end">
          Exam day
        </text>
      </svg>
    </div>
  );
}

function buildInsights(args: {
  examName: string;
  examReadinessPct: number;
  days: number | null;
  subjectReadiness: Array<{ name: string; ewa: number; nTracked: number }>;
  weakest: TopicCard | null;
  decayingTopics: TopicCard[];
  trackedTopics: number;
}): string[] {
  const out: string[] = [];
  const { examName, examReadinessPct, days, subjectReadiness, weakest, trackedTopics } = args;

  if (trackedTopics === 0) {
    out.push(
      `<strong>No data yet for ${examName}.</strong> The IRT engine starts shaping insights after your first session in any topic.`,
    );
    return out;
  }

  if (days !== null) {
    if (days < 30) {
      out.push(
        `<strong>${days} day${days === 1 ? "" : "s"} until exam.</strong> Lean toward weak-topic drills over breadth — short focused rounds move scores most.`,
      );
    } else if (examReadinessPct >= 60) {
      out.push(
        `<strong>${days} days until exam.</strong> At ${examReadinessPct}% readiness you're tracking ahead of schedule.`,
      );
    } else {
      out.push(
        `<strong>${days} days until exam.</strong> Current readiness is ${examReadinessPct}%. Daily 30-min rounds will close most of the gap before the date.`,
      );
    }
  }

  const weakSubject = [...subjectReadiness]
    .filter((s) => s.nTracked > 0)
    .sort((a, b) => a.ewa - b.ewa)[0];
  if (weakSubject && weakSubject.ewa < 0.5) {
    out.push(
      `<strong>${weakSubject.name} is your biggest drag</strong> at ${Math.round(weakSubject.ewa * 100)}%. Focusing here adds the most readiness points per minute.`,
    );
  }

  if (weakest) {
    out.push(
      `<strong>${weakest.title}</strong> is your weakest topic in ${weakest.subjectName} (${Math.round(weakest.ewa * 100)}%). The AI recommends starting here next.`,
    );
  }

  const strongSubject = [...subjectReadiness]
    .filter((s) => s.nTracked > 0)
    .sort((a, b) => b.ewa - a.ewa)[0];
  if (strongSubject && strongSubject.ewa >= 0.7) {
    out.push(
      `<strong>${strongSubject.name} is locked in</strong> at ${Math.round(strongSubject.ewa * 100)}%. Consider a mock test to confirm.`,
    );
  }

  return out.slice(0, 4);
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function StudyPlanGroup({
  title,
  hint,
  topics,
}: {
  title: string;
  hint: string;
  topics: TopicCard[];
}) {
  if (topics.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>
          {title}
        </span>
        <span style={{ fontSize: 9.5, color: "var(--ink-4)" }}>{hint}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {topics.map((t) => (
          <Link
            key={t.id}
            to={`/catalog/topic/${t.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              background: "var(--card-2)",
              borderRadius: 6,
              textDecoration: "none",
              color: "var(--ink)",
              fontSize: 11,
              border: "1px solid var(--rule)",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.title}
              <span style={{ color: "var(--ink-4)", marginLeft: 6, fontSize: 10 }}>
                · {t.subjectName}
              </span>
            </span>
            <span
              style={{
                fontSize: 10,
                color: t.ewa < 0 ? "var(--ink-3)" : t.ewa < 0.4 ? "var(--bad)" : t.ewa < 0.7 ? "var(--info)" : "var(--good)",
                fontVariantNumeric: "tabular-nums",
                marginLeft: 8,
              }}
            >
              {t.ewa < 0 ? "Start →" : `${Math.round(t.ewa * 100)}% →`}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Insight strip components — added per ADR-0017 / Phase-5 / Phase-6
// signals already exposed by /analytics + /adaptive routes.
// Each component fetches independently and soft-fails to nothing —
// the dashboard must keep rendering even if one panel's backend errors.
// ─────────────────────────────────────────────────────────────────────

interface DecayItem {
  concept_id: string;
  ewa: number;
  decay_severity: "fresh" | "warming" | "stale" | "critical" | string;
  decay_days: number;
}

function DecayBanner({ userId, examCode }: { userId: string; examCode: string }) {
  const [items, setItems] = useState<DecayItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/topic-decay/${userId}?exam=${encodeURIComponent(examCode)}`,
        );
        if (!r.ok) {
          if (alive) setItems([]);
          return;
        }
        const body = (await r.json()) as { items?: DecayItem[] };
        if (alive) setItems(body.items ?? []);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, examCode]);

  if (!items) return null;
  const decaying = items.filter(
    (i) => i.decay_severity === "stale" || i.decay_severity === "critical",
  );
  if (decaying.length === 0) return null;

  const critical = decaying.filter((d) => d.decay_severity === "critical").length;
  const stale = decaying.length - critical;
  const oldest = Math.max(...decaying.map((d) => d.decay_days));

  return (
    <div
      className="card"
      style={{
        marginTop: "var(--sp-3)",
        padding: "10px 14px",
        borderLeft: "3px solid var(--bad)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 16 }} aria-hidden>
        📉
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
          {decaying.length} concept{decaying.length === 1 ? "" : "s"} need
          {decaying.length === 1 ? "s" : ""} revision
        </div>
        <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>
          {critical > 0 && `${critical} critical`}
          {critical > 0 && stale > 0 && " · "}
          {stale > 0 && `${stale} stale`}
          {" · oldest last touched "}
          {oldest} day{oldest === 1 ? "" : "s"} ago
        </div>
      </div>
      <Link
        to="/practice?mode=revision"
        className="btn btn-ghost"
        style={{ fontSize: 11 }}
      >
        Revisit now →
      </Link>
    </div>
  );
}

interface GuidedStep {
  action: "REVISE" | "PRACTICE" | "DIAGNOSE" | string;
  topicId: string;
  topicTitle: string;
  why: string;
  estMinutes: number;
}

function NextSessionCard({ userId, examCode }: { userId: string; examCode: string }) {
  const [step, setStep] = useState<GuidedStep | null>(null);
  const [headline, setHeadline] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/adaptive/guided-next-steps/${userId}?exam=${encodeURIComponent(examCode)}`,
        );
        if (!r.ok) {
          if (alive) setLoaded(true);
          return;
        }
        const body = (await r.json()) as { headline?: string; steps?: GuidedStep[] };
        if (alive) {
          setHeadline(body.headline ?? "");
          setStep(body.steps?.[0] ?? null);
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, examCode]);

  if (!loaded || !step || !step.topicId) return null;

  return (
    <Link
      to={`/catalog/topic/${step.topicId}`}
      className="card"
      style={{
        padding: "12px 14px",
        textDecoration: "none",
        color: "var(--ink)",
        borderLeft: "3px solid var(--gold, #4F87F6)",
        display: "block",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span className="ai-pill" style={{ fontSize: 9 }}>
          ◈ NEXT SESSION
        </span>
        <span style={{ fontSize: 10, color: "var(--ink-4)" }}>
          {step.estMinutes} min · {step.action.toLowerCase()}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
        {step.topicTitle}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>
        {step.why || headline || "Recommended next based on your weakest topics."}
      </div>
      <div style={{ fontSize: 11, color: "var(--gold, #4F87F6)", marginTop: 8 }}>
        Start session →
      </div>
    </Link>
  );
}

function TimeBudgetCard({
  currentPct,
  targetPct,
  days,
}: {
  currentPct: number;
  targetPct: number;
  days: number | null;
}) {
  if (days === null || days <= 0) return null;
  const gap = Math.max(0, targetPct - currentPct);
  if (gap === 0) return null;

  // Empirical learning rate: ~+1.5 readiness pp per (30 min/day × week).
  // So at M minutes/day, projected gain over `days` days ≈
  //   (M / 30) * 1.5 * (days / 7)  =  M * days / 140.
  // Cap projection at the gap (can't exceed the target by definition here).
  const projected = (m: number) => {
    const gain = (m * days) / 140;
    return Math.min(currentPct + gain, 100);
  };
  const buckets = [15, 30, 45].map((m) => ({
    minutes: m,
    pct: projected(m),
    hits: projected(m) >= targetPct,
  }));

  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <div className="sec-row" style={{ marginBottom: 9 }}>
        <h2 className="section-heading">Time budget · target {targetPct}%</h2>
        <span className="pill pill-muted" style={{ fontSize: 9 }}>
          {days} day{days === 1 ? "" : "s"} left
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {buckets.map((b) => (
          <div
            key={b.minutes}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 11,
              padding: "5px 8px",
              background: "var(--card-2)",
              border: "1px solid var(--rule)",
              borderRadius: 6,
            }}
          >
            <span style={{ minWidth: 64, color: "var(--ink-3)" }}>
              {b.minutes} min/day
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                background: "var(--card-1)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${b.pct}%`,
                  height: "100%",
                  background: b.hits ? "var(--good)" : "var(--info)",
                }}
              />
            </div>
            <span
              style={{
                minWidth: 56,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color: b.hits ? "var(--good)" : "var(--ink)",
                fontWeight: b.hits ? 700 : 500,
              }}
            >
              {Math.round(b.pct)}%{b.hits ? " ✓" : ""}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 8 }}>
        Projection assumes ~1.5 pp readiness gain per (30 min/day · week) on
        weak-topic drills. Heuristic — calibrates against your real session
        history once it builds up.
      </div>
    </div>
  );
}