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
      return {
        subjectId: s.id,
        name: s.name,
        ewa: ewaMean,
        nTracked: tracked.length,
        buckets,
        totalTopics: inSubject.length,
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
              <div className="eh-stat-num" style={{ color: "var(--color-green)" }}>
                {trackedTopics > 0
                  ? Math.min(100, Math.round(examReadinessPct + (1 - examReadinessPct / 100) * 30))
                  : "—"}
              </div>
              <div className="eh-stat-lbl">AI PREDICTION</div>
            </div>
            <div className="eh-stat">
              <div className="eh-stat-num" style={{ color: "var(--color-amber)" }}>
                {days ?? "—"}
              </div>
              <div className="eh-stat-lbl">DAYS LEFT</div>
            </div>
            <div className="eh-stat">
              <div className="eh-stat-num" style={{ color: "var(--color-blue)" }}>
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
              <div style={{ fontSize: 9.5, color: "var(--text-faint)", marginTop: 1 }}>
                EWA model · recency-weighted · updates after every session
              </div>
            </div>
            <Link to={`/catalog/exam/${examId}`} className="see-all">
              Drill into topics ›
            </Link>
          </div>

          {subjectReadiness.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
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
                    ? "var(--color-green)"
                    : bucket === "developing"
                      ? "var(--color-blue)"
                      : bucket === "weak"
                        ? "var(--color-red)"
                        : "var(--text-faint)";
                const pctColor =
                  bucket === "strong"
                    ? "var(--color-green)"
                    : bucket === "developing"
                      ? "var(--color-blue)"
                      : "var(--color-red)";
                return (
                  <div key={s.subjectId} className="subj-row">
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
                    </div>
                  </div>
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
              <div style={{ fontSize: 9.5, color: "var(--text-faint)", marginTop: 1 }}>
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
                  background: "var(--color-green)",
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
                  borderTop: "1px dashed var(--color-blue)",
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
              borderTop: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 7,
              }}
            >
              Mock test history
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
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

      {/* ── Zones 6 + 7: Topic matrix + AI insights ────────────────── */}
      <div className="dashboard-bottom-grid" style={{ marginTop: "var(--sp-4)" }}>

        {/* Zone 6: Topic mastery matrix */}
        <div className="card">
          <div className="sec-row">
            <div>
              <h2 className="section-heading">Topic mastery matrix</h2>
              <div style={{ fontSize: 9.5, color: "var(--text-faint)", marginTop: 1 }}>
                {topics.length} topics · click any to practice
              </div>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <span className="pill pill-success" style={{ fontSize: 9 }}>Strong</span>
              <span className="pill pill-info" style={{ fontSize: 9 }}>Developing</span>
              <span className="pill pill-danger" style={{ fontSize: 9 }}>Weak</span>
              <span className="pill pill-muted" style={{ fontSize: 9 }}>New</span>
            </div>
          </div>
          {topics.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
              No topics in this exam yet.
            </p>
          ) : (
            <div className="topic-matrix">
              {topics.map((t) => {
                const bucket =
                  t.ewa < 0
                    ? "new"
                    : t.ewa >= 0.7
                      ? "strong"
                      : t.ewa >= 0.4
                        ? "developing"
                        : "weak";
                const lbl =
                  bucket === "new"
                    ? "NEW"
                    : bucket === "strong"
                      ? "STRONG"
                      : bucket === "developing"
                        ? "DEV."
                        : "WEAK";
                return (
                  <Link
                    key={t.id}
                    to={`/catalog/topic/${t.id}`}
                    className={`tm-cell tm-${bucket}`}
                  >
                    <div className="tm-topic">
                      {t.title.length > 18 ? `${t.title.slice(0, 17)}…` : t.title}
                    </div>
                    <div className="tm-pct">
                      {t.ewa < 0 ? "—" : `${Math.round(t.ewa * 100)}%`}
                    </div>
                    <div className="tm-lbl">{lbl}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Zone 7 + 8: AI insights + Assignments */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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

          {/* Zone 8: Assignments — placeholder until assignments service lands */}
          <div className="card" style={{ padding: "12px 14px" }}>
            <div className="sec-row" style={{ marginBottom: 9 }}>
              <h2 className="section-heading">Assignments · {exam.name}</h2>
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: 0,
                padding: "var(--sp-1) 0",
              }}
            >
              No assignments yet. Mock tests + class assignments will appear here
              once your institution wires them in.
            </p>
          </div>
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
          stroke="rgba(255,255,255,0.06)"
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
        <line x1="0" y1="20" x2="320" y2="20" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1="0" y1="50" x2="320" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1="0" y1="80" x2="320" y2="80" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <text x="3" y="18" fill="#4A5570" fontSize="8">85</text>
        <text x="3" y="48" fill="#4A5570" fontSize="8">68</text>
        <text x="3" y="78" fill="#4A5570" fontSize="8">50</text>
        <line
          x1="18"
          y1={cy(target)}
          x2="320"
          y2={cy(target)}
          stroke="#F5A623"
          strokeWidth="1"
          strokeDasharray="3,3"
          opacity="0.45"
        />
        <text x="285" y={cy(target) - 4} fill="#F5A623" fontSize="8" opacity="0.7">
          Target {target}
        </text>
        <path
          d={`M${start.x},${start.y} Q${(start.x + today.x) / 2},${(start.y + today.y) / 2 - 8} ${today.x},${today.y}`}
          fill="none"
          stroke="#10C47A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d={`M${start.x},${start.y} Q${(start.x + today.x) / 2},${(start.y + today.y) / 2 - 8} ${today.x},${today.y} L${today.x},108 L${start.x},108Z`}
          fill="url(#ga)"
        />
        <circle cx={today.x} cy={today.y} r="4.5" fill="#10C47A" stroke="#07090F" strokeWidth="2" />
        <text x={today.x - 8} y={today.y - 6} fill="#10C47A" fontSize="8" textAnchor="middle">
          {current}
        </text>
        <path
          d={`M${today.x},${today.y} Q${(today.x + predict.x) / 2},${(today.y + predict.y) / 2 - 6} ${predict.x},${predict.y}`}
          fill="none"
          stroke="#4F87F6"
          strokeWidth="1.8"
          strokeDasharray="4,3"
          strokeLinecap="round"
        />
        <circle cx={predict.x} cy={predict.y} r="4" fill="#4F87F6" stroke="#07090F" strokeWidth="2" />
        <line
          x1={today.x}
          y1="20"
          x2={today.x}
          y2="108"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
          strokeDasharray="2,3"
        />
        <text x={today.x} y="115" fill="#4A5570" fontSize="7.5" textAnchor="middle">
          Today
        </text>
        <text x="18" y="115" fill="#4A5570" fontSize="7.5">
          Baseline
        </text>
        <text x="314" y="115" fill="#4F87F6" fontSize="7.5" textAnchor="end">
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
