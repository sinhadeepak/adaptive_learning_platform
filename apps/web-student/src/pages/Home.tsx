import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";

// ─────────────────────────────────────────────────────────────────────────
// Master Dashboard — React port of docs/ui/01_StudentPortal_Web/05_master-dashboard.html.
// Six zones, top-to-bottom:
//   1. AI hero header   — greeting + 3 stat columns + CTAs
//   2. My exams         — radio-card row of exams + "Add exam" tile
//   3. AI recommends    — single most-impactful action right now
//   4. Study health     — daily goal + weekly bars + streak + AI tips
//   5. Deadlines        — across all exams (placeholder until assignments service)
//   6. Recent activity  — feed (derived from streak + last quiz session)
// ─────────────────────────────────────────────────────────────────────────

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

interface TopicCard {
  topicId: string;
  title: string;
  subjectId: string;
  ewa: number;
  n: number;
}

export function Home() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [mastery, setMastery] = useState<TopicCard[] | null>(null);
  const [examsMeta, setExamsMeta] = useState<Record<string, ExamMeta>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/profile/me");
        if (res.ok) setProfile((await res.json()) as Profile);
      } catch {
        /* swallow */
      }
    })();
  }, []);

  // Hydrate exam metadata (name, subtitle) for cards.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (!r.ok) return;
        const all = (await r.json()) as ExamMeta[];
        const map: Record<string, ExamMeta> = {};
        all.forEach((e) => {
          map[e.id] = e;
        });
        setExamsMeta(map);
      } catch {
        /* swallow */
      }
    })();
  }, [profile]);

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
        const cards = await Promise.all(
          body.topics.map(async (t): Promise<TopicCard> => {
            try {
              const t2 = await auth.fetch(`/api/v1/catalog/topics/${t.topicId}`);
              if (t2.ok) {
                const tj = (await t2.json()) as {
                  title: string;
                  subjectId: string;
                };
                return {
                  topicId: t.topicId,
                  title: tj.title,
                  subjectId: tj.subjectId,
                  ewa: t.ewa,
                  n: t.n,
                };
              }
            } catch {
              /* fall through */
            }
            return {
              topicId: t.topicId,
              title: `Topic ${t.topicId.slice(0, 8)}`,
              subjectId: "",
              ewa: t.ewa,
              n: t.n,
            };
          }),
        );
        cards.sort((a, b) => b.ewa - a.ewa);
        setMastery(cards);
      } catch {
        setMastery([]);
      }
    })();
  }, [user]);

  const greeting = greetingFor(new Date());
  const firstName = profile?.user.firstName || user?.firstName || "there";
  const goalMinutes = profile?.preferences.dailyGoalMinutes ?? null;

  const hasReadiness = readiness !== null && readiness.nTopics > 0;
  const scorePct = readiness ? Math.round(readiness.score * 100) : 0;

  // Best subject = highest-EWA topic.
  const bestTopic = useMemo(() => {
    if (!mastery || mastery.length === 0) return null;
    return mastery[0]; // already sorted desc
  }, [mastery]);

  // Total session count across all topics — proxy for "questions answered" until
  // we have a real per-question telemetry counter. (n is sessions, not Qs;
  // typical session ≈ 10 Qs so we render the n value with a "sessions" label
  // instead of the mockup's "questions answered" copy.)
  const totalSessions = useMemo(
    () => mastery?.reduce((sum, m) => sum + m.n, 0) ?? 0,
    [mastery],
  );

  // Weakest topic for the AI recommendation banner.
  const weakest = useMemo(() => {
    if (!mastery || mastery.length === 0) return null;
    const sorted = [...mastery].sort((a, b) => a.ewa - b.ewa);
    return sorted[0].ewa < 0.5 ? sorted[0] : null;
  }, [mastery]);

  const exams = profile?.exams ?? [];
  const lastTouched = mastery && mastery.length > 0 ? mastery.reduce(
    (max, m) => (m.n > max ? m.n : max),
    0,
  ) : 0;

  // Daily goal completion — derived from today's session count vs goal.
  // We don't have per-day telemetry; estimate today's minutes as
  // streak.lastActiveDate === today ? min(goal, sessions*10*1.5) : 0.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastActive = streak?.lastActiveDate
    ? new Date(streak.lastActiveDate)
    : null;
  const studiedToday =
    lastActive && lastActive.getTime() >= today.getTime()
      ? Math.min(goalMinutes ?? 60, totalSessions * 12)
      : 0;
  const goalPct =
    goalMinutes && goalMinutes > 0
      ? Math.round((studiedToday / goalMinutes) * 100)
      : 0;
  const goalToneClass =
    goalPct >= 80 ? "goal-pct-high" : goalPct >= 40 ? "goal-pct-mid" : "goal-pct-low";

  return (
    <AppShell
      title="My Dashboard"
      chips={[
        ...(exams.length > 0
          ? [{ label: `${exams.length} active exam${exams.length === 1 ? "" : "s"}`, live: true }]
          : []),
        ...(streak && streak.currentStreak > 0
          ? [{ label: `🔥 ${streak.currentStreak}-day streak` }]
          : []),
      ]}
    >
      {/* ── Zone 1: AI hero header ─────────────────────────────────── */}
      <section className="ai-header" aria-label="Daily summary">
        <div className="ai-header-left">
          <span className="ai-pill">◈ AI INTELLIGENCE ENGINE</span>
          <h1 className="ai-header-name">
            {greeting},{" "}
            <span className="ai-header-name-accent">{firstName}</span> 👋
          </h1>
          <p className="ai-header-sub">
            {hasReadiness && bestTopic ? (
              <>
                You're tracking <strong>{mastery?.length ?? 0} topic{(mastery?.length ?? 0) === 1 ? "" : "s"}</strong>
                {" "}across{" "}
                <strong>{exams.length || 1} exam{exams.length === 1 ? "" : "s"}</strong>.
                {" "}<strong>{bestTopic.title}</strong> is your highest-mastery
                topic right now. {weakest ? <>{weakest.title} needs attention.</> : null}
              </>
            ) : (
              <>
                Take your first quiz so the IRT engine can start measuring readiness.
                {exams.length > 0 ? (
                  <>{" "}You're prepping for <strong>{examsMeta[exams[0].examId]?.name || "your exam"}</strong>.</>
                ) : null}
              </>
            )}
          </p>
          <div className="ai-header-btns">
            <Link to="/catalog" className="btn-ai">
              ◈ Start Practice
            </Link>
            <Link to="/catalog" className="btn btn-ghost">
              View Full Analysis →
            </Link>
          </div>
        </div>
        <div className="ai-header-stats">
          <div className="ai-stat">
            <div className="ai-stat-num" style={{ color: "var(--color-green)" }}>
              {bestTopic ? `${Math.round(bestTopic.ewa * 100)}%` : "—"}
            </div>
            <div className="ai-stat-lbl">BEST TOPIC</div>
            <div className="ai-stat-foot">
              {bestTopic ? bestTopic.title.slice(0, 18) : "no data yet"}
            </div>
          </div>
          <div className="ai-divider" />
          <div className="ai-stat">
            <div className="ai-stat-num" style={{ color: "var(--color-ai)" }}>
              {totalSessions}
            </div>
            <div className="ai-stat-lbl">SESSIONS</div>
            <div className="ai-stat-foot" style={{ color: "var(--color-green)" }}>
              {lastTouched > 0 ? `top topic: ${lastTouched}` : "—"}
            </div>
          </div>
          <div className="ai-divider" />
          <div className="ai-stat">
            <div className="ai-stat-num" style={{ color: "var(--color-purple)" }}>
              {hasReadiness ? `${scorePct}%` : "—"}
            </div>
            <div className="ai-stat-lbl">READINESS</div>
            <div className="ai-stat-foot">
              {hasReadiness && readiness
                ? `${readiness.nTopics} topic${readiness.nTopics === 1 ? "" : "s"}`
                : "first quiz to start"}
            </div>
          </div>
        </div>
      </section>

      {/* ── Zone 2: My exams + courses ─────────────────────────────── */}
      <section style={{ marginTop: "var(--sp-5)" }}>
        <div className="sec-row">
          <h2 className="section-heading">My exams &amp; courses</h2>
          <Link to="/onboarding/exam" className="auth-link" style={{ fontSize: 11 }}>
            + Add exam
          </Link>
        </div>
        {exams.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-state-title">No exam selected</div>
            <p>
              Pick the exam you're preparing for and we'll personalise your readiness
              tracker. <Link to="/onboarding/exam" className="auth-link">Pick now →</Link>
            </p>
          </div>
        ) : (
          <div className="exams-row">
            {exams.map((e, idx) => {
              const meta = examsMeta[e.examId];
              const days = daysUntil(e.targetDate);
              const onTrack = scorePct >= 60;
              const variantClass = onTrack
                ? "exam-card-on-track"
                : "exam-card-needs-focus";
              return (
                <Link
                  key={e.examId}
                  to={`/exams/${e.examId}`}
                  className={`exam-card ${variantClass} ${idx === 0 ? "exam-card-active" : ""}`.trim()}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="exam-card-top">
                    <div>
                      <div className="exam-card-title">
                        {meta?.name ?? "Exam"}
                      </div>
                      <div className="exam-card-sub">
                        {meta?.subtitle ?? "—"}
                      </div>
                    </div>
                    <ExamRing pct={hasReadiness ? scorePct : 0} />
                  </div>
                  <div className="exam-card-days-row">
                    <div className="exam-card-days">
                      {days !== null ? (
                        <>
                          <strong>{days}</strong> day{days === 1 ? "" : "s"} remaining
                        </>
                      ) : (
                        "no target date"
                      )}
                    </div>
                  </div>
                  <div className="exam-card-bar-track">
                    <div
                      className="exam-card-bar-fill"
                      style={{
                        width: `${hasReadiness ? scorePct : 0}%`,
                        background: onTrack
                          ? "linear-gradient(90deg, var(--color-green), var(--color-blue))"
                          : "linear-gradient(90deg, var(--color-amber), var(--color-red))",
                      }}
                    />
                  </div>
                  <div className="exam-card-foot">
                    <span className="exam-card-last">
                      {streak?.lastActiveDate
                        ? `Last studied: ${formatLastDate(streak.lastActiveDate)}`
                        : "Not started"}
                    </span>
                    <span className={`pill pill-${onTrack ? "success" : "warning"}`}>
                      {hasReadiness ? (onTrack ? "On track" : "Needs focus") : "Get started"}
                    </span>
                  </div>
                </Link>
              );
            })}
            <Link to="/onboarding/exam" className="exam-add-card">
              <div className="exam-add-icon">+</div>
              <div className="exam-add-label">Add exam or course</div>
              <div className="exam-add-sub">UPSC · CBSE · Skill courses</div>
            </Link>
          </div>
        )}
      </section>

      {/* ── Zone 3: AI recommends ──────────────────────────────────── */}
      {weakest ? (
        <Link
          to={`/catalog/topic/${weakest.topicId}`}
          className="reco-banner"
          style={{ marginTop: "var(--sp-5)" }}
        >
          <div className="reco-icon">⚡</div>
          <div className="reco-body">
            <div className="reco-eyebrow">
              ◈ AI RECOMMENDS · RIGHT NOW
            </div>
            <div className="reco-title">
              Practice {weakest.title} — your weakest topic
            </div>
            <div className="reco-sub">
              Mastery is at {Math.round(weakest.ewa * 100)}%. A short focused
              round on this topic will move your readiness the most.
            </div>
            <div className="reco-impact">
              ▲ Est. + {Math.max(2, Math.round((1 - weakest.ewa) * 5))} readiness pts ·
              ~10 minutes
            </div>
          </div>
          <span className="btn-ai" style={{ flexShrink: 0 }}>
            Start Now →
          </span>
        </Link>
      ) : null}

      {/* ── Zones 4-6: Study health + Deadlines + Activity ─────────── */}
      <section className="dashboard-bottom-grid" style={{ marginTop: "var(--sp-5)" }}>

        {/* Zone 4: Study health */}
        <div className="card">
          <div className="sec-row">
            <h2 className="section-heading">Study health</h2>
            <span className="pill pill-info">◈ AI coaching</span>
          </div>
          <div className="health-grid">
            <div className="health-left">
              {/* Daily goal */}
              <div>
                <div className="goal-row">
                  <span className="goal-lbl">Today's goal</span>
                  <span className={`goal-pct ${goalToneClass}`}>{goalPct}%</span>
                </div>
                <div className="goal-bar">
                  <div className="goal-fill" style={{ width: `${Math.min(100, goalPct)}%` }} />
                </div>
                <div className="goal-nums">
                  <span className="goal-actual">
                    {goalMinutes
                      ? `${studiedToday}m / ${goalMinutes}m`
                      : "—"}
                  </span>
                  <span className="goal-target">
                    {goalMinutes ? `${goalMinutes} min` : "set in onboarding"}
                  </span>
                </div>
              </div>
              {/* Weekly bars — placeholder shape since per-day telemetry isn't wired. */}
              <div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 5 }}>
                  This week (sessions per day)
                </div>
                <div className="week-bars">
                  {weekDayMockBars(streak?.currentStreak ?? 0).map((b, i) => (
                    <div key={i} className="wb-col">
                      <div
                        className="wb"
                        style={{ height: `${b.h}px`, background: b.color, opacity: b.opacity }}
                      />
                      <div
                        className="wb-lbl"
                        style={{
                          color: b.color === "var(--color-red)" ? "var(--color-red)" : undefined,
                        }}
                      >
                        {b.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Streak + AI tips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="streak-card">
                <div className="streak-num">
                  {streak?.currentStreak ?? 0} 🔥
                </div>
                <div className="streak-best">
                  day streak
                  {streak && streak.longestStreak > 0
                    ? ` · best: ${streak.longestStreak}`
                    : ""}
                </div>
                <div className="streak-dots">
                  {streakDayDots(streak?.currentStreak ?? 0).map((d, i) => (
                    <div key={i} className={`sd ${d.cls}`}>
                      {d.lbl}
                    </div>
                  ))}
                </div>
              </div>

              <div className="ai-tip">
                <span className="ai-tip-glyph">◈</span>
                <span className="ai-tip-text">
                  {bestTopic ? (
                    <>
                      <strong>{bestTopic.title}</strong> is at{" "}
                      {Math.round(bestTopic.ewa * 100)}% — try a mock to lock it in.
                    </>
                  ) : (
                    <>
                      <strong>Start a 5-minute round.</strong> The IRT engine
                      shapes recommendations after the first session.
                    </>
                  )}
                </span>
              </div>

              {weakest ? (
                <div className="ai-tip">
                  <span className="ai-tip-glyph">◈</span>
                  <span className="ai-tip-text">
                    <strong>Weak link: {weakest.title}.</strong> Short focused
                    rounds move it more than long mixed sessions.
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Zone 5 + 6 stacked */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Zone 5: Deadlines */}
          <div className="card">
            <div className="sec-row">
              <h2 className="section-heading">Upcoming deadlines</h2>
            </div>
            {exams.some((e) => e.targetDate) ? (
              <div className="dl-list">
                {exams
                  .filter((e) => e.targetDate)
                  .map((e) => {
                    const d = daysUntil(e.targetDate);
                    const meta = examsMeta[e.examId];
                    const tone = d !== null && d < 30 ? "warn" : "info";
                    return (
                      <Link
                        key={e.examId}
                        to="/catalog"
                        className="dl-item"
                      >
                        <div className={`dl-icon dl-icon-${tone}`}>📝</div>
                        <div className="dl-body">
                          <div className="dl-name">{meta?.name ?? "Exam"}</div>
                          <div className="dl-meta">
                            {d !== null
                              ? `Target date · ${d} day${d === 1 ? "" : "s"} remaining`
                              : "No target date set"}
                          </div>
                        </div>
                        <span
                          className={`pill pill-${tone === "warn" ? "danger" : "info"}`}
                        >
                          {tone === "warn" ? "Soon" : "Ahead"}
                        </span>
                      </Link>
                    );
                  })}
              </div>
            ) : (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  margin: 0,
                  padding: "var(--sp-2) 0",
                }}
              >
                No deadlines yet. Add a target date in onboarding to see your exam
                here.
              </p>
            )}
          </div>

          {/* Zone 6: Recent activity */}
          <div className="card">
            <div className="sec-row">
              <h2 className="section-heading">Recent activity</h2>
            </div>
            <div className="act-list">
              {streak?.lastActiveDate ? (
                <div className="act-item">
                  <div
                    className="act-avatar"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--color-ai), var(--color-blue))",
                      color: "#fff",
                    }}
                  >
                    Q
                  </div>
                  <div className="act-text">
                    <strong>Quiz session completed</strong> — keep the streak alive,
                    next item picked by the IRT engine.
                  </div>
                  <div className="act-time">
                    {formatLastDate(streak.lastActiveDate)}
                  </div>
                </div>
              ) : null}
              {bestTopic ? (
                <div className="act-item">
                  <div
                    className="act-avatar"
                    style={{
                      background: "rgba(79,135,246,0.15)",
                      color: "var(--color-blue)",
                      fontSize: 13,
                    }}
                  >
                    ◈
                  </div>
                  <div className="act-text">
                    <strong>Mastery update:</strong>{" "}
                    {bestTopic.title} climbed to{" "}
                    {Math.round(bestTopic.ewa * 100)}% — strongest in your set.
                  </div>
                  <div className="act-time">live</div>
                </div>
              ) : null}
              {streak && streak.currentStreak >= 7 ? (
                <div className="act-item">
                  <div
                    className="act-avatar"
                    style={{
                      background: "rgba(245,166,35,0.15)",
                      color: "var(--color-amber)",
                    }}
                  >
                    🔥
                  </div>
                  <div className="act-text">
                    <strong>{streak.currentStreak}-day streak</strong> — top quartile
                    for consistency. Keep going.
                  </div>
                  <div className="act-time">today</div>
                </div>
              ) : null}
              {!streak?.lastActiveDate && !bestTopic ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    margin: 0,
                    padding: "var(--sp-2) 0",
                  }}
                >
                  No activity yet. Your first quiz will appear here.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Topic mastery list — kept from prior version, scroll-to section */}
      {mastery && mastery.length > 0 ? (
        <section style={{ marginTop: "var(--sp-6)", marginBottom: "var(--sp-6)" }}>
          <h2 className="section-heading">All topics</h2>
          <ul className="row-list">
            {mastery.map((m) => (
              <li key={m.topicId}>
                <Link to={`/catalog/topic/${m.topicId}`} className="row-link">
                  <div className="row-link-body">
                    <p className="row-link-title">{m.title}</p>
                    <p className="row-link-meta">
                      {m.n} session{m.n === 1 ? "" : "s"} · mastery{" "}
                      {Math.round(m.ewa * 100)}%
                    </p>
                  </div>
                  <div className="row-link-trail">
                    <span
                      className={`pill pill-${
                        m.ewa >= 0.7 ? "success" : m.ewa >= 0.4 ? "info" : "danger"
                      }`}
                    >
                      {m.ewa >= 0.7 ? "Strong" : m.ewa >= 0.4 ? "Developing" : "Weak"}
                    </span>
                    <span className="chevron" aria-hidden>
                      ›
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}

// ── ExamRing — small SVG ring used in zone 2 cards ──
function ExamRing({ pct }: { pct: number }) {
  const r = 21;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const stroke = pct >= 60 ? "#10C47A" : pct >= 30 ? "#4F87F6" : "#F43F5E";
  return (
    <div className="exam-card-ring" role="img" aria-label={`Score ${pct}`}>
      <svg viewBox="0 0 52 52">
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="5"
        />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <div className="exam-card-ring-inner">
        <div className="exam-card-ring-num" style={{ color: stroke }}>
          {pct}
        </div>
        <div className="exam-card-ring-lbl">/100</div>
      </div>
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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

function formatLastDate(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(then);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

// Synthesize a 7-bar weekly chart from the streak. Until per-day session
// telemetry exists, this conveys "consistency" via the streak shape.
function weekDayMockBars(streak: number) {
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const today = new Date().getDay(); // 0=Sun..6=Sat
  // Convert to monday-anchored index (0=Mon..6=Sun)
  const mondayIdx = (today + 6) % 7;
  return labels.map((label, i) => {
    const isToday = i === mondayIdx;
    const isPast = i < mondayIdx;
    const inStreak = streak > 0 && i >= mondayIdx - streak + 1 && i <= mondayIdx;
    let h = 12;
    let color = "var(--bg-surface3)";
    let opacity = 1;
    if (inStreak) {
      h = 28 + ((i * 7) % 14);
      color = isToday ? "var(--color-amber)" : "var(--color-blue)";
      opacity = 0.8;
    } else if (isPast) {
      h = 14;
      color = "var(--color-red)";
      opacity = 0.5;
    } else {
      h = 8;
      color = "var(--bg-surface3)";
      opacity = 1;
    }
    return { label, h, color, opacity };
  });
}

// 7-day calendar dot row for streak card.
function streakDayDots(streak: number) {
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const today = new Date().getDay(); // 0=Sun..6=Sat
  const mondayIdx = (today + 6) % 7;
  return labels.map((lbl, i) => {
    const isToday = i === mondayIdx;
    const inStreak = streak > 0 && i >= mondayIdx - streak + 1 && i <= mondayIdx;
    if (isToday) return { lbl, cls: inStreak ? "sd-today" : "sd-future" };
    if (inStreak) return { lbl, cls: "sd-done" };
    if (i > mondayIdx) return { lbl, cls: "sd-future" };
    return { lbl, cls: "sd-miss" };
  });
}
