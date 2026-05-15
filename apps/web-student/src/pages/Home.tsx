// Home — Master Dashboard (Aurora v2).
//
// Spec: docs/02-design/redesign/home.md
// ADR:  docs/adr/0028-design-system-v2-aurora.md (S4.5 deliverable)
//
// Restructured from the v1 13-zone stack into the Aurora layout:
//
//   ┌──────────────────────────────────────────────┐
//   │  Greeting + status strip (4 StatCards)        │
//   ├──────────────────────────────────────────────┤
//   │  AI Insight  (Aurora gradient)                │
//   ├──────────────────────────────────────────────┤
//   │  Today's plan  (DailyPlanCard — preserved)    │
//   │  Today's mission  (MissionCard — preserved)   │
//   │  Resume practice                              │
//   │  Weak topics                                  │
//   │  This week                                    │
//   │  Photo a doubt  (PhotoDoubt — preserved)      │
//   └──────────────────────────────────────────────┘
//
// All API calls + data fetches identical to the v1 Home. The fetched
// state is the same; only the rendering surface changed.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { AppShell } from "../components/AppShell";
import { PhotoDoubt } from "../components/PhotoDoubt";
import { MissionCard } from "../components/MissionCard";
import { DailyPlanCard } from "../components/DailyPlanCard";
import {
  WeeklyNarrativeCard,
  WeeklyNarrativeEmpty,
} from "../components/WeeklyNarrativeCard";
import { AdaptsExplainerCard } from "../components/AdaptsExplainerCard";
import { ReadinessBandCard } from "../components/ReadinessBandCard";
import { RecoveryBanner } from "../components/RecoveryBanner";
import {
  fetchCurrentWeeklyNarrative,
  generateWeeklyNarrative,
  type NarrativeRecord,
} from "../lib/weekly-narrative";

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

interface InProgressSession {
  sessionId: string;
  topicId: string;
  targetCount: number;
  servedCount: number;
  correctCount: number;
  startedAt: string;
}

interface DailyActivity {
  date: string;
  minutes: number;
  sessions: number;
  questions: number;
}

export function Home() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [mastery, setMastery] = useState<TopicCard[] | null>(null);
  const [todayMinutes, setTodayMinutes] = useState<number>(0);
  const [todaySessions, setTodaySessions] = useState<number>(0);
  const [weekActivity, setWeekActivity] = useState<DailyActivity[]>([]);
  const [inProgress, setInProgress] = useState<InProgressSession[]>([]);
  const [inProgressTitles, setInProgressTitles] = useState<Map<string, string>>(new Map());
  const [examsMeta, setExamsMeta] = useState<Record<string, ExamMeta>>({});

  // Phase 6 S53 — weekly narrative card. Three states:
  //   - loading: fetch in flight, nothing rendered
  //   - found: render WeeklyNarrativeCard
  //   - absent: render WeeklyNarrativeEmpty with a Generate button
  const [weeklyNarrative, setWeeklyNarrative] = useState<
    | { kind: "loading" }
    | { kind: "found"; record: NarrativeRecord }
    | { kind: "absent"; reason: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [generatingNarrative, setGeneratingNarrative] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchCurrentWeeklyNarrative(user.id);
        if (cancelled) return;
        setWeeklyNarrative(
          res.kind === "found"
            ? { kind: "found", record: res.record }
            : { kind: "absent", reason: res.reason },
        );
      } catch (e) {
        if (cancelled) return;
        setWeeklyNarrative({
          kind: "error",
          message:
            e instanceof Error ? e.message : "Couldn't load weekly narrative.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onGenerateNarrative() {
    if (!user || generatingNarrative) return;
    setGeneratingNarrative(true);
    try {
      const record = await generateWeeklyNarrative(user.id);
      setWeeklyNarrative({ kind: "found", record });
    } catch (e) {
      setWeeklyNarrative({
        kind: "error",
        message:
          e instanceof Error ? e.message : "Couldn't generate narrative.",
      });
    } finally {
      setGeneratingNarrative(false);
    }
  }

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
        const r = await auth.fetch(`/api/v1/analytics/daily-activity/${user.id}?days=7`);
        if (r.ok) {
          const body = (await r.json()) as { activity: DailyActivity[] };
          setWeekActivity(body.activity);
          const todayKey = new Date().toISOString().slice(0, 10);
          const today = body.activity.find((a) => a.date === todayKey) ?? null;
          setTodayMinutes(today?.minutes ?? 0);
          setTodaySessions(today?.sessions ?? 0);
        }
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(`/api/v1/quiz/sessions?userId=${user.id}&limit=20`);
        if (r.ok) {
          const body = (await r.json()) as {
            items: Array<InProgressSession & { status: string }>;
          };
          const ip = body.items.filter((i) => i.status === "IN_PROGRESS");
          setInProgress(ip);
          const titles = new Map<string, string>();
          await Promise.all(
            Array.from(new Set(ip.map((s) => s.topicId))).map(async (id) => {
              try {
                const t = await auth.fetch(`/api/v1/catalog/topics/${id}`);
                if (t.ok) {
                  const body2 = (await t.json()) as { title: string };
                  titles.set(id, body2.title);
                }
              } catch {
                /* swallow */
              }
            }),
          );
          setInProgressTitles(titles);
        }
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
                const tj = (await t2.json()) as { title: string; subjectId: string };
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
  const scorePct = readiness ? Math.round(readiness.score * 100) : 0;
  const hasReadiness = readiness !== null && readiness.nTopics > 0;

  const weakest = useMemo(() => {
    if (!mastery || mastery.length === 0) return null;
    const sorted = [...mastery].sort((a, b) => a.ewa - b.ewa);
    const first = sorted[0];
    return first && first.ewa < 0.5 ? first : null;
  }, [mastery]);

  const weakTopics = useMemo(() => {
    if (!mastery) return null;
    return [...mastery].sort((a, b) => a.ewa - b.ewa).slice(0, 4);
  }, [mastery]);

  const exams = profile?.exams ?? [];
  const firstExam = exams[0];
  const firstExamMeta = firstExam ? examsMeta[firstExam.examId] : undefined;
  const daysToExam = daysUntil(firstExam?.targetDate ?? null);

  const goalPct =
    goalMinutes && goalMinutes > 0
      ? Math.min(100, Math.round((todayMinutes / goalMinutes) * 100))
      : 0;

  const examChips = [
    ...(exams.length > 0
      ? [{ label: `${exams.length} active exam${exams.length === 1 ? "" : "s"}`, live: true }]
      : []),
    ...(streak && streak.currentStreak > 0
      ? [{ label: `🔥 ${streak.currentStreak}-day streak` }]
      : []),
  ];

  return (
    <AppShell title="My Dashboard" chips={examChips}>
      {/* ── Greeting ───────────────────────────────────────── */}
      <header style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--t-h1-size)",
            lineHeight: "var(--t-h1-line)",
            fontWeight: 700,
            color: "var(--neutral-900)",
          }}
        >
          {greeting},{" "}
          <span style={{ color: "var(--brand-600)" }}>{firstName}</span> 👋
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--neutral-600)" }}>
          {firstExamMeta ? (
            <>
              <strong>{firstExamMeta.name}</strong>
              {daysToExam !== null ? <> · {daysToExam} days to exam</> : null}
            </>
          ) : (
            <>Let's get you set up with your first exam.</>
          )}
        </p>
      </header>

      {/* ── Status strip ───────────────────────────────────── */}
      <section
        aria-label="Today's status"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard
          size="sm"
          label="Streak"
          value={streak ? streak.currentStreak : "—"}
          deltaLabel={
            streak && streak.longestStreak > streak.currentStreak
              ? `Best ${streak.longestStreak}`
              : null
          }
          icon={<span>🔥</span>}
          tone="reward"
        />
        <StatCard
          size="sm"
          label="Readiness"
          value={hasReadiness ? `${scorePct}%` : "—"}
          deltaLabel={
            hasReadiness ? `${readiness!.nTopics} topic${readiness!.nTopics === 1 ? "" : "s"}` : null
          }
          tone={scorePct >= 70 ? "success" : scorePct >= 40 ? "warning" : "danger"}
        />
        <StatCard
          size="sm"
          label="Topics"
          value={mastery ? mastery.length : "—"}
          deltaLabel={mastery && mastery.length > 0 ? "tracked" : null}
          tone="brand"
        />
        <StatCard
          size="sm"
          label="Today"
          value={`${todayMinutes}m`}
          deltaLabel={
            goalMinutes
              ? `${goalPct}% of ${goalMinutes}m goal`
              : todaySessions > 0
                ? `${todaySessions} session${todaySessions === 1 ? "" : "s"}`
                : null
          }
          tone={goalPct >= 80 ? "success" : goalPct >= 40 ? "warning" : "neutral"}
        />
      </section>

      {/* ── AI insight (when we have a weak topic to recommend) ─── */}
      {weakest ? (
        <div style={{ marginBottom: 20 }}>
          <AIInsightCard
            headline={
              <>
                <strong>{weakest.title}</strong> is your weakest topic right now (
                {Math.round(weakest.ewa * 100)}% mastery).
              </>
            }
            description={
              weakest.n > 0
                ? `You've practiced ${weakest.n} session${weakest.n === 1 ? "" : "s"} on this — a focused 10-minute drill would move your readiness fastest.`
                : "A 10-minute targeted drill on this topic moves your readiness more than any other action right now."
            }
            action={
              <Link to={`/catalog/topic/${weakest.topicId}`}>
                <Button variant="aurora" iconLeft={<span aria-hidden>✦</span>}>
                  Start a focused drill
                </Button>
              </Link>
            }
          />
        </div>
      ) : !hasReadiness ? (
        <div style={{ marginBottom: 20 }}>
          <AIInsightCard
            headline="Take your first quiz so the AI can start measuring readiness."
            description={
              firstExamMeta
                ? `You're prepping for ${firstExamMeta.name}. A 10-minute diagnostic unlocks personalised practice.`
                : "Pick an exam from the catalog, take a 10-minute diagnostic, and the engine will personalise practice."
            }
            action={
              <Link to="/catalog">
                <Button variant="aurora" iconLeft={<span aria-hidden>✦</span>}>
                  Browse exams
                </Button>
              </Link>
            }
          />
        </div>
      ) : null}

      {/* ── Today's plan (Phase B3 — IGS, legacy component preserved) ── */}
      {firstExam?.examId ? <DailyPlanCard examId={firstExam.examId} /> : null}

      {/* ── Recovery proposal (P6 S57 UX-29) ──────────────────────
          Renders a banner when the recovery FSM has a pending catch-
          up after 2+ missed planned sessions. Self-hides when none. */}
      <RecoveryBanner />

      {/* ── Readiness band (P6 S56) ──────────────────────────────
          Renders the user's current band + recovery actions. Hidden
          until the fetch resolves so the page doesn't flash an empty
          card. */}
      {user && <ReadinessBandCard userId={user.id} />}

      {/* ── How adaptive practice works (P6 S54 — first-quiz only) ────
          The card self-gates on a localStorage flag set when the
          student first dismisses it. Renders nothing for returning
          users so the home page doesn't keep nagging. */}
      <AdaptsExplainerCard />

      {/* ── Today's mission (Phase 6 S50 — legacy component preserved) ── */}
      <MissionCard />

      {/* ── Weekly narrative (Phase 6 S53) ─────────────────────────
          Loads via GET /adaptive/weekly-narrative/current/{user_id}.
          Renders the 5-section card on hit; offers a Generate button
          when the week's narrative hasn't been written yet. We hide
          the slot completely while loading so the home page doesn't
          flash an empty card. */}
      {weeklyNarrative.kind === "found" && (
        <WeeklyNarrativeCard record={weeklyNarrative.record} />
      )}
      {weeklyNarrative.kind === "absent" && (
        <WeeklyNarrativeEmpty
          onGenerate={onGenerateNarrative}
          generating={generatingNarrative}
        />
      )}
      {weeklyNarrative.kind === "error" && (
        <WeeklyNarrativeEmpty error={weeklyNarrative.message} />
      )}

      {/* ── Resume practice (when in-progress sessions exist) ── */}
      {inProgress.length > 0 ? (
        <section aria-label="Resume practice" style={{ margin: "20px 0" }}>
          <SectionHeading
            title="Resume practice"
            chip={
              inProgress.length > 1 ? (
                <Tag size="sm" tone="brand" variant="soft">
                  +{inProgress.length - 1} more
                </Tag>
              ) : null
            }
          />
          <ResumeCard
            session={inProgress[0]!}
            topicTitle={inProgressTitles.get(inProgress[0]!.topicId) ?? "your last round"}
          />
        </section>
      ) : null}

      {/* ── Weak topics ── */}
      {weakTopics && weakTopics.length > 0 ? (
        <section aria-label="Weak topics" style={{ margin: "20px 0" }}>
          <SectionHeading
            title="Topics to strengthen"
            chip={<Tag size="sm" tone="warning" variant="soft">{weakTopics.length}</Tag>}
            link={{ to: "/analysis", label: "See all" }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {weakTopics.map((t) => (
              <WeakTopicCard key={t.topicId} topic={t} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── This week (7-day activity) ── */}
      {weekActivity.length > 0 || goalMinutes ? (
        <section aria-label="This week" style={{ margin: "20px 0" }}>
          <SectionHeading title="This week" />
          <WeekActivityCard
            activity={weekActivity}
            goalMinutes={goalMinutes ?? 0}
          />
        </section>
      ) : null}

      {/* ── Photo a doubt (preserved feature) ── */}
      <section aria-label="Snap a doubt" style={{ margin: "20px 0" }}>
        <SectionHeading title="Stuck on a problem?" />
        <PhotoDoubt />
      </section>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Local presentational helpers — keep the page file self-contained for now.
// As more pages adopt these patterns, they'll graduate to @alp/ui organisms.
// ─────────────────────────────────────────────────────────────────────────

function SectionHeading({
  title,
  chip,
  link,
}: {
  title: string;
  chip?: React.ReactNode;
  link?: { to: string; label: string };
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "var(--t-h3-size)",
          lineHeight: "var(--t-h3-line)",
          fontWeight: 600,
          color: "var(--neutral-800)",
        }}
      >
        {title}
      </h2>
      {chip}
      <span style={{ flex: 1 }} />
      {link ? (
        <Link
          to={link.to}
          style={{
            color: "var(--brand-600)",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {link.label} →
        </Link>
      ) : null}
    </div>
  );
}

function ResumeCard({
  session,
  topicTitle,
}: {
  session: InProgressSession;
  topicTitle: string;
}) {
  const remaining = Math.max(0, session.targetCount - session.servedCount);
  const accPct =
    session.servedCount > 0
      ? Math.round((session.correctCount / session.servedCount) * 100)
      : 0;
  return (
    <Card padding="md" interactive>
      <Link
        to={`/quiz/${session.sessionId}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <ProgressRing
          value={session.servedCount / Math.max(1, session.targetCount)}
          size={56}
          thickness={6}
          tone="aurora"
        >
          {`${session.servedCount}/${session.targetCount}`}
        </ProgressRing>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--neutral-900)" }}>
            {topicTitle}
          </div>
          <div style={{ color: "var(--neutral-600)", fontSize: 13 }}>
            {remaining} questions left · {accPct}% accuracy so far
          </div>
        </div>
        <Button variant="primary">Continue →</Button>
      </Link>
    </Card>
  );
}

function WeakTopicCard({ topic }: { topic: TopicCard }) {
  const pct = Math.round(topic.ewa * 100);
  const tone: "weak" | "developing" | "strong" =
    topic.ewa < 0.4 ? "weak" : topic.ewa < 0.7 ? "developing" : "strong";
  const tagTone: "danger" | "warning" | "success" =
    tone === "weak" ? "danger" : tone === "developing" ? "warning" : "success";
  return (
    <Link
      to={`/catalog/topic/${topic.topicId}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
      aria-label={`Practice ${topic.title}, mastery ${pct} percent`}
    >
      <Card interactive padding="md">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ProgressRing value={topic.ewa} size={56} thickness={6} tone={tone}>
            {`${pct}%`}
          </ProgressRing>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                color: "var(--neutral-900)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {topic.title}
            </div>
            <div style={{ color: "var(--neutral-600)", fontSize: 13 }}>
              {topic.n} session{topic.n === 1 ? "" : "s"} ·{" "}
              <Tag size="sm" tone={tagTone} variant="soft">
                {tone === "weak" ? "weak" : tone === "developing" ? "developing" : "strong"}
              </Tag>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function WeekActivityCard({
  activity,
  goalMinutes,
}: {
  activity: DailyActivity[];
  goalMinutes: number;
}) {
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7;

  const map = new Map<string, DailyActivity>();
  for (const a of activity) map.set(a.date, a);

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - todayIdx);

  const visible = labels.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    return map.get(key) ?? { date: key, minutes: 0, sessions: 0, questions: 0 };
  });
  const maxMin = Math.max(60, ...visible.map((v) => v.minutes));

  const totalMin = visible.reduce((s, v) => s + v.minutes, 0);
  const hitDays = visible.filter(
    (v, i) => i <= todayIdx && goalMinutes > 0 && v.minutes >= goalMinutes,
  ).length;

  return (
    <Card padding="md">
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height: 96,
          marginBottom: 8,
        }}
      >
        {visible.map((v, i) => {
          const isToday = i === todayIdx;
          const isFuture = i > todayIdx;
          const heightPct = isFuture ? 0 : Math.max(6, (v.minutes / maxMin) * 100);
          const color =
            goalMinutes > 0 && v.minutes >= goalMinutes
              ? "var(--success-500)"
              : v.minutes > 0
                ? "var(--brand-500)"
                : "var(--neutral-300)";
          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
              aria-label={`${labels[i]}: ${v.minutes} minutes`}
            >
              <div
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: isFuture ? 4 : 6,
                  background: color,
                  opacity: isFuture ? 0.3 : isToday ? 1 : 0.8,
                  borderRadius: 4,
                  transition: "height var(--m-base) var(--m-ease)",
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isToday ? "var(--brand-600)" : "var(--neutral-500)",
                  fontWeight: isToday ? 700 : 500,
                }}
              >
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          color: "var(--neutral-600)",
          fontSize: 13,
        }}
      >
        <span>
          <strong style={{ color: "var(--neutral-900)" }}>{totalMin}m</strong> this week
        </span>
        {goalMinutes > 0 ? (
          <span>
            <strong style={{ color: "var(--success-600)" }}>{hitDays}</strong> goal day
            {hitDays === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </Card>
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
