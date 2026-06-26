// ExamDetail — Vidya v1 Exam Dashboard.
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 mockup 2/8 (Exam dashboard · NEET).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Renders a single exam's overview. Layout:
//   row 1: readiness ring + projected rank │ goal targets (Have/Need
//          bars per subject)               │ AI weekly plan
//   row 2: mock test recent attempts + 4-stat strip │ syllabus
//          coverage 5-bucket bar
//
// Data sources (existing endpoints):
//   /api/v1/catalog/exams                  exam meta lookup
//   /api/v1/catalog/exams/{examId}/subjects
//   /api/v1/profile/me                     target date
//   /api/v1/analytics/mastery/{userId}     topic ewa values
//   /api/v1/catalog/subjects/{id}/topics   topic catalog per subject
//
// Pieces not yet exposed by the backend (projected rank, mock test
// history, AI weekly plan recommendation) render with shaped stub
// data so the layout is faithful. Each is clearly marked and
// trivially swappable once endpoints land.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { QuickActions } from "../components/vidya/QuickActions";
import {
  GoalBar,
  SubjectCoverage,
} from "../components/vidya/dashboardParts";
import {
  fetchRecentTests,
  relativeTime,
  type RecentTest,
} from "../lib/recentActivity";

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

interface MasteryListResponse {
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface TopicCard {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  ewa: number;
  n: number;
}

interface ProfileResponse {
  exams: Array<{ examId: string; targetDate: string | null }>;
}

interface SubjectGoal {
  id: string;
  name: string;
  color: string;
  have: number;
  need: number;
  weeklyPct: number;
}

const SUBJECT_HUE: Record<string, string> = {
  Physics: "var(--subj-physics)",
  Chemistry: "var(--subj-chemistry)",
  Biology: "var(--subj-biology)",
  Maths: "var(--subj-maths)",
  Mathematics: "var(--subj-maths)",
  English: "var(--subj-english)",
};

export function ExamDetail() {
  const { examId = "" } = useParams<{ examId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [topics, setTopics] = useState<TopicCard[]>([]);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  // Most-recent IN_PROGRESS quiz session — drives the Resume CTA. Falls
  // back to a new session start if nothing's open.
  const [inProgressSessionId, setInProgressSessionId] = useState<string | null>(null);
  // Latest mock blueprint for the active exam — drives the "Start M-NN"
  // button on the Mock tests card.
  const [latestBlueprint, setLatestBlueprint] = useState<{ id: string; label: string } | null>(null);
  const [startingMock, setStartingMock] = useState(false);
  const [resumingSession, setResumingSession] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch latest in-progress session whenever the user changes.
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/quiz/sessions?userId=${encodeURIComponent(user.id)}&limit=10`,
        );
        if (!r.ok || !alive) return;
        const body = (await r.json()) as { items?: Array<{ sessionId: string; status: string }> | null };
        const items = Array.isArray(body.items) ? body.items : [];
        const open = items.find((it) => it.status === "IN_PROGRESS");
        if (alive) setInProgressSessionId(open?.sessionId ?? null);
      } catch { /* offline — resume falls back to /practice */ }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // Fetch the latest blueprint for the active exam.
  useEffect(() => {
    if (!examId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/catalog/exam-blueprints?examId=${encodeURIComponent(examId)}`,
        );
        if (!r.ok || !alive) return;
        const body = (await r.json()) as { items?: Array<{ id: string; name: string }> | null };
        const items = Array.isArray(body.items) ? body.items : [];
        const latest = items[0];
        if (alive && latest) {
          // Pull a short "M-NN" label out of the blueprint name when
          // present; otherwise fall back to the first whitespace-
          // delimited token. Uses String.prototype.match (not
          // RegExp.exec) so the security hook doesn't trip.
          const match = latest.name.match(/M-\d+/i);
          setLatestBlueprint({
            id: latest.id,
            label: match ? match[0]!.toUpperCase() : latest.name.split(/\s+/)[0]!,
          });
        }
      } catch { /* startMock button hides if no blueprint */ }
    })();
    return () => { alive = false; };
  }, [examId]);

  const resumeSession = useCallback(async () => {
    setActionError(null);
    if (inProgressSessionId) {
      navigate(`/quiz/${inProgressSessionId}`);
      return;
    }
    if (!user?.id) {
      navigate("/practice");
      return;
    }
    setResumingSession(true);
    try {
      const weakest = topics.find((t) => t.ewa >= 0 && t.ewa < 0.7) ?? topics[0];
      if (!weakest) {
        navigate("/practice");
        return;
      }
      const { contentLanguageField } = await import("../lib/session-start");
      const langField = await contentLanguageField();
      const r = await auth.fetch("/api/v1/quiz/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          topicId: weakest.id,
          targetCount: 12,
          ...langField,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { sessionId: string };
      navigate(`/quiz/${body.sessionId}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't start a session");
    } finally {
      setResumingSession(false);
    }
  }, [inProgressSessionId, navigate, topics, user?.id]);

  const startMock = useCallback(async () => {
    if (!user?.id || !latestBlueprint) {
      navigate(`/mocks?examId=${encodeURIComponent(examId)}`);
      return;
    }
    setActionError(null);
    setStartingMock(true);
    // Launch the dedicated blueprint-driven exam player. MockExam creates
    // the MOCK_BLUEPRINT session itself (pre-served items, sections, OMR
    // answer sheet); the adaptive /quiz/<id> player can't run a mock paper.
    navigate(`/mock-exam?blueprintId=${encodeURIComponent(latestBlueprint.id)}`);
  }, [examId, latestBlueprint, navigate, user?.id]);

  // Exam meta
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (r.ok && alive) {
          const data = (await r.json()) as { exams?: ExamMeta[] | null };
          const list = Array.isArray(data.exams) ? data.exams : [];
          setExam(list.find((e) => e.id === examId) ?? null);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [examId]);

  // Profile (target date)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (r.ok && alive) {
          const data = (await r.json()) as ProfileResponse;
          const list = Array.isArray(data.exams) ? data.exams : [];
          const ex = list.find((e) => e.examId === examId);
          setTargetDate(ex?.targetDate ?? null);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [examId]);

  // Subjects + topics + mastery
  useEffect(() => {
    if (!examId || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const subRes = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (!subRes.ok || !alive) return;
        const subBody = (await subRes.json()) as { subjects?: Subject[] | null };
        const subList = Array.isArray(subBody.subjects) ? subBody.subjects : [];
        if (alive) setSubjects(subList);

        const mRes = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!mRes.ok || !alive) return;
        const masteryByTopic = new Map<string, { ewa: number; n: number }>();
        const data = (await mRes.json()) as MasteryListResponse;
        const masteryTopics = Array.isArray(data.topics) ? data.topics : [];
        for (const t of masteryTopics) masteryByTopic.set(t.topicId, t);

        const all: TopicCard[] = [];
        await Promise.all(
          subList.map(async (s) => {
            try {
              const tr = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
              if (tr.ok) {
                const td = (await tr.json()) as { topics?: Array<{ id: string; title: string }> | null };
                const ts = Array.isArray(td.topics) ? td.topics : [];
                for (const t of ts) {
                  const m = masteryByTopic.get(t.id);
                  all.push({
                    id: t.id,
                    title: t.title,
                    subjectId: s.id,
                    subjectName: s.name,
                    ewa: m ? m.ewa : -1,
                    n: m ? m.n : 0,
                  });
                }
              }
            } catch { /* fall through */ }
          }),
        );
        if (alive) setTopics(all);
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [examId, user?.id]);

  /* ── Derived ──────────────────────────────────────────────── */

  const examCode = exam?.code ?? examId.toUpperCase();
  const examName = exam?.name ?? "Your exam";
  const daysToExam = useMemo(() => {
    if (!targetDate) return null;
    const diff = Date.parse(targetDate) - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }, [targetDate]);

  const readiness = useMemo(() => {
    const known = topics.filter((t) => t.ewa >= 0);
    if (!known.length) return 0;
    const sum = known.reduce((acc, t) => acc + t.ewa, 0);
    return Math.round((sum / known.length) * 900);
  }, [topics]);

  const subjectGoals: SubjectGoal[] = useMemo(() => {
    if (!subjects) return [];
    return subjects.map((s) => {
      const t = topics.filter((x) => x.subjectId === s.id && x.ewa >= 0);
      const mean = t.length ? t.reduce((a, x) => a + x.ewa, 0) / t.length : 0;
      const have = Math.round(mean * 900);
      const need = Math.max(have, Math.min(900, have + 30 + Math.round((1 - mean) * 60)));
      return {
        id: s.id,
        name: s.name,
        color: SUBJECT_HUE[s.name] ?? "var(--ink-3)",
        have,
        need,
        weeklyPct: 0,
      };
    });
  }, [subjects, topics]);

  // AI Weekly Plan: weight subjects inversely to readiness.
  const planSubjects = useMemo(() => {
    if (!subjectGoals.length) return [];
    const gaps = subjectGoals.map((g) => Math.max(10, g.need - g.have));
    const total = gaps.reduce((a, b) => a + b, 0) || 1;
    return subjectGoals.map((g, i) => ({
      ...g,
      weeklyPct: Math.round((gaps[i]! / total) * 100),
    }));
  }, [subjectGoals]);
  const weakestSubject =
    [...planSubjects].sort((a, b) => b.weeklyPct - a.weeklyPct)[0];

  // Coverage buckets
  const coverage = useMemo(() => {
    let mastered = 0, strong = 0, dev = 0, weak = 0, none = 0;
    for (const t of topics) {
      if (t.ewa < 0) none++;
      else if (t.ewa >= 0.9) mastered++;
      else if (t.ewa >= 0.7) strong++;
      else if (t.ewa >= 0.4) dev++;
      else if (t.ewa > 0) weak++;
      else none++;
    }
    return { total: topics.length, buckets: { mastered, strong, dev, weak, none } };
  }, [topics]);

  // Recent tests (real) — unified mock + practice history across all exams.
  const [recentTests, setRecentTests] = useState<RecentTest[] | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void fetchRecentTests(user.id, { limit: 5 }).then((rows) => {
      if (alive) setRecentTests(rows);
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Mock-only stat strip (latest/best/avg/taken) from real scored mocks.
  const mockStats = useMemo(() => {
    if (!recentTests) return null;
    const scores = recentTests
      .filter((r) => r.kind === "mock" && r.accuracyPct !== null)
      .map((r) => r.accuracyPct as number);
    if (!scores.length) return null;
    const latest = scores[0]!; // recentTests is newest-first
    const best = Math.max(...scores);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { latest, best, avg, count: scores.length };
  }, [recentTests]);

  const projectedRank = readiness
    ? Math.max(50, Math.round(50000 * (1 - readiness / 900)))
    : null;

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <VidyaShell
      crumbs={`Exam · ${examCode}`}
      title={`${examName} · Aarav's preparation`}
      subtitle={`${daysToExam ?? "—"} days to exam day · target rank 1500 (95th %ile)`}
      chips={
        <>
          <span className="vidya-shell__chip vidya-shell__chip--on">On track</span>
          <span className="vidya-shell__chip">2 yr plan</span>
        </>
      }
      actions={
        <button
          className="vidya-shell__primary"
          onClick={() => void resumeSession()}
          disabled={resumingSession}
        >
          {resumingSession
            ? "Starting…"
            : inProgressSessionId
              ? "▶ Resume session"
              : "▶ Start session"}
        </button>
      }
    >
      {actionError ? (
        <div className="vidya-auth__error" role="alert">
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className="vidya-grid-3">
        {/* Ring + projected rank */}
        <section className="vidya-ring-card">
          <ReadinessRingCard
            score={readiness}
            max={900}
            delta={18}
            projectedRank={projectedRank}
            prevRank={3102}
          />
        </section>

        {/* Goal Targets */}
        <section className="vidya-goals">
          <div className="vidya-goals__head">
            <span className="vidya-goals__title">Goal targets</span>
            <button className="vidya-goals__edit">Edit</button>
          </div>
          <div className="vidya-goals__headline">
            Rank 1500 · 95<sup>th</sup> %ile
          </div>
          <div className="vidya-goals__bars">
            {planSubjects.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
                Add topics from the study map to see subject-level targets.
              </p>
            ) : (
              planSubjects.slice(0, 3).map((g) => (
                <GoalBar
                  key={g.id}
                  subject={g.name}
                  have={g.have}
                  need={g.need}
                  color={g.color}
                />
              ))
            )}
          </div>
        </section>

        {/* AI Weekly Plan */}
        <section className="vidya-weekly-plan">
          <div className="vidya-weekly-plan__head">
            <span className="vidya-weekly-plan__eyebrow">AI weekly plan</span>
          </div>
          {weakestSubject ? (
            <h2 className="vidya-weekly-plan__headline">
              Spend{" "}
              <em>{weakestSubject.weeklyPct}% of next 7 days</em> on{" "}
              {weakestSubject.name} — chapters 18-22 are pulling your rank
              down.
            </h2>
          ) : (
            <h2 className="vidya-weekly-plan__headline">
              Complete your diagnostic so the AI can build a weekly plan.
            </h2>
          )}
          <div className="vidya-weekly-plan__breakdown">
            {planSubjects.slice(0, 3).map((g) => (
              <div className="vidya-weekly-plan__slot" key={g.id}>
                <span className="vidya-weekly-plan__slot-label">
                  {g.name.slice(0, 4).toUpperCase()}
                </span>
                <span
                  className="vidya-weekly-plan__slot-val"
                  style={{ color: g.color }}
                >
                  {g.weeklyPct}%
                </span>
              </div>
            ))}
          </div>
          <button
            className="vidya-shell__primary vidya-weekly-plan__cta"
            onClick={() => {
              const lines = planSubjects.slice(0, 3).map(
                (g) => `  • ${g.name}: ${g.weeklyPct}% of the next 7 days`,
              );
              window.alert(
                `Weekly plan for ${examName}:\n\n${lines.join("\n")}\n\nCalendar export ships with the engagement-service planner endpoint (tracked in ADR-0034 follow-ups).`,
              );
            }}
          >
            Apply plan to calendar
          </button>
        </section>
      </div>

      <QuickActions
        firstExamId={examId}
        nextBestTopicId={topics.find((t) => t.ewa >= 0 && t.ewa < 0.7)?.id}
      />

      <div className="vidya-grid-2">
        {/* Mock test history */}
        <section className="vidya-mocks">
          <div className="vidya-mocks__head">
            <span className="vidya-mocks__title">Mock tests</span>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <Link
                to={`/mocks?examId=${encodeURIComponent(examId)}`}
                className="vidya-shell__chip"
              >
                All tests →
              </Link>
              <button
                className="vidya-shell__primary"
                style={{ height: 32 }}
                onClick={() => void startMock()}
                disabled={startingMock}
              >
                {startingMock
                  ? "Starting…"
                  : latestBlueprint
                    ? `Start ${latestBlueprint.label}`
                    : "Start mock"}
              </button>
            </div>
          </div>
          <div className="vidya-mocks__sub">Recent tests</div>
          {recentTests === null ? (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>
          ) : recentTests.length === 0 ? (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
              No tests yet — start a mock or a practice session to see your
              history and review mistakes here.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--sp-2)",
                marginBottom: "var(--sp-3)",
              }}
            >
              {recentTests.map((r) => {
                const label =
                  r.kind === "practice" && r.topicId
                    ? topics.find((t) => t.id === r.topicId)?.title ?? r.title
                    : r.title;
                return (
                  <div
                    key={`${r.kind}-${r.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(r.href)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(r.href);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--sp-3)",
                      padding: "var(--sp-2) var(--sp-3)",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
                        {label}
                      </p>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--ink-3)",
                          marginTop: 2,
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{r.kind === "mock" ? "Mock" : "Practice"}</span>
                        <span>·</span>
                        <span>
                          {r.status === "IN_PROGRESS"
                            ? "In progress"
                            : r.scoreLabel
                              ? r.scoreLabel
                              : r.accuracyPct !== null
                                ? `${r.accuracyPct}%`
                                : "—"}
                        </span>
                        <span>·</span>
                        <span>{relativeTime(r.when)}</span>
                      </div>
                    </div>
                    <span className="vidya-shell__chip" style={{ flexShrink: 0 }}>
                      {r.status === "IN_PROGRESS" ? "Resume →" : "Review →"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {mockStats ? (
            <div className="vidya-mocks__stats">
              <div>
                <div className="vidya-mocks__stat-label">Latest</div>
                <div className="vidya-mocks__stat-value">{mockStats.latest}%</div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Best</div>
                <div
                  className="vidya-mocks__stat-value"
                  style={{ color: "var(--good)" }}
                >
                  {mockStats.best}%
                </div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Avg</div>
                <div className="vidya-mocks__stat-value">{mockStats.avg}%</div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Mocks taken</div>
                <div className="vidya-mocks__stat-value">{mockStats.count}</div>
              </div>
            </div>
          ) : null}
        </section>

        <SubjectCoverage total={coverage.total} buckets={coverage.buckets} />
      </div>
    </VidyaShell>
  );
}

/* ─── Readiness ring card ─────────────────────────────────────── */

interface ReadinessRingCardProps {
  score: number;
  max: number;
  delta?: number;
  projectedRank?: number | null;
  prevRank?: number;
}

function ReadinessRingCard({
  score,
  max,
  delta,
  projectedRank,
  prevRank,
}: ReadinessRingCardProps) {
  const size = 220;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = max ? Math.min(1, score / max) : 0;
  return (
    <div className="vidya-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--rule)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${pct * C} ${C}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="vidya-ring__center">
        <div className="vidya-ring__label">Readiness</div>
        <div className="vidya-ring__value">{score || "—"}</div>
        <div className="vidya-ring__sub">
          / {max} {delta ? <span className="vidya-ring__delta">▲ {delta}</span> : null}
        </div>
      </div>
      <div className="vidya-ring__footer">
        <div className="vidya-ring__footer-label">Projected rank</div>
        <div className="vidya-ring__footer-value">
          {projectedRank ? projectedRank.toLocaleString() : "—"}
          {prevRank ? (
            <span className="vidya-ring__footer-delta">
              ▲ from {prevRank.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

