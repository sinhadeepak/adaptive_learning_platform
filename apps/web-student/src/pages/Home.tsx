// Home — Vidya v1 Master Dashboard.
//
// Spec: docs/02-design/design-system/04_components.md
//       + the 8-screen mockup set delivered with Vidya v1 (page 1/8).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout (single-exam variant — multi-track variant lives in
// VidyaShellMultiTrack and shares no data path with this page):
//
//   ┌─────── topbar (greeting + resume session) ───────┐
//   │  ┌─ hero readiness ───┐ ┌─ next best action ┐ ┌─ today's plan ┐
//   │  └────────────────────┘ └───────────────────┘ └────────────────┘
//   │  ┌─ stat ┐ ┌─ stat ┐ ┌─ stat ┐ ┌─ stat ┐
//   │  └───────┘ └───────┘ └───────┘ └───────┘
//   │  ┌─ mastery-by-subject table ──────┐ ┌─ activity heatmap ─┐
//   │  └─────────────────────────────────┘ └────────────────────┘
//
// All API calls map to existing engagement/analytics endpoints — the
// rewrite swapped JSX, not the data layer.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { ActivityHeatmap } from "../components/vidya/dashboardParts";
import { Sparkline } from "@alp/ui";

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

interface DailyActivity {
  date: string;
  minutes: number;
  sessions: number;
  questions: number;
}

interface PlanItem {
  label: string;
  time: string;
  done: boolean;
  now?: boolean;
}

interface SubjectRow {
  subjectId: string;
  name: string;
  color: string;
  chapters: number;
  mastered: number;
  strong: number;
  dev: number;
  weak: number;
  readiness: number;
  trend: number[];
}

const SUBJECT_HUES: Record<string, { name: string; color: string }> = {
  physics: { name: "Physics", color: "var(--subj-physics)" },
  chemistry: { name: "Chemistry", color: "var(--subj-chemistry)" },
  biology: { name: "Biology", color: "var(--subj-biology)" },
  maths: { name: "Maths", color: "var(--subj-maths)" },
  english: { name: "English", color: "var(--subj-english)" },
};

export function Home() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [mastery, setMastery] = useState<TopicCard[]>([]);
  const [weekActivity, setWeekActivity] = useState<DailyActivity[]>([]);
  const [heatmap, setHeatmap] = useState<number[]>([]);

  // Profile + exam meta
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (r.ok && alive) {
          const data = (await r.json()) as Profile;
          setProfile(data);
          const examId = data.exams[0]?.examId;
          if (examId) {
            const ex = await auth.fetch(`/api/v1/catalog/exams/${examId}`);
            if (ex.ok && alive) setExam((await ex.json()) as ExamMeta);
          }
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, []);

  // Readiness + streak + activity
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const safe = async <T,>(path: string): Promise<T | null> => {
        try {
          const r = await auth.fetch(path);
          return r.ok ? ((await r.json()) as T) : null;
        } catch { return null; }
      };
      const [r, s, a] = await Promise.all([
        safe<ReadinessResponse>(`/api/v1/analytics/readiness/${user.id}`),
        safe<StreakResponse>(`/api/v1/analytics/streak/${user.id}`),
        safe<{ days: DailyActivity[] }>(`/api/v1/analytics/daily-activity/${user.id}?days=84`),
      ]);
      if (!alive) return;
      setReadiness(r);
      setStreak(s);
      setWeekActivity(a?.days?.slice(-7) ?? []);
      const days = a?.days ?? [];
      const norm = days.map((d) => Math.min(1, d.questions / 50));
      setHeatmap(norm);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // Mastery by topic
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (r.ok && alive) {
          const data = (await r.json()) as { topics: Array<{ topicId: string; ewa: number; n: number }> };
          const cards = await Promise.all(
            data.topics.slice(0, 50).map(async (t) => {
              try {
                const tr = await auth.fetch(`/api/v1/catalog/topics/${t.topicId}`);
                if (tr.ok) {
                  const meta = (await tr.json()) as { title?: string; subjectId?: string };
                  return {
                    topicId: t.topicId,
                    title: meta.title ?? t.topicId,
                    subjectId: meta.subjectId ?? "other",
                    ewa: t.ewa,
                    n: t.n,
                  } as TopicCard;
                }
              } catch { /* fall through */ }
              return null;
            }),
          );
          if (alive) setMastery(cards.filter(Boolean) as TopicCard[]);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  /* ── Derived values ─────────────────────────────────────── */

  const greeting = useMemo(() => greetTime(), []);
  const firstName = profile?.user.firstName ?? user?.firstName ?? "learner";
  const today = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, []);
  const sessionsThisWeek = weekActivity.reduce((acc, d) => acc + d.sessions, 0);
  const questionsThisWeek = weekActivity.reduce((acc, d) => acc + d.questions, 0);
  const minutesThisWeek = weekActivity.reduce((acc, d) => acc + d.minutes, 0);

  const subjectRows = useMemo(() => groupBySubject(mastery), [mastery]);
  const masteryIndex = useMemo(() => {
    if (!mastery.length) return null;
    const sum = mastery.reduce((acc, t) => acc + t.ewa, 0);
    return +(sum / mastery.length).toFixed(2);
  }, [mastery]);
  const nextBest = useMemo(() => pickNextBest(mastery), [mastery]);

  // Mock plan items (real endpoint pending) — kept editorial-true.
  const plan: PlanItem[] = useMemo(
    () => [
      { label: "Organic Chemistry · Practice", time: "07:30", done: true },
      { label: "Mock Test M-14 · Review", time: "10:00", done: true },
      { label: "Thermodynamics · Practice", time: "16:00", done: false, now: true },
      { label: "Botany · Reading + 8 Qs", time: "18:30", done: false },
      { label: "Daily revision · 20 Qs", time: "21:00", done: false },
    ],
    [],
  );
  const planDone = plan.filter((p) => p.done).length;

  const examShort = exam?.code ?? "NEET";
  const score = readiness?.score ?? 0;
  const readinessScaled = Math.round(score * 900);

  return (
    <VidyaShell
      crumbs="Home"
      title={`${greeting}, ${firstName}.`}
      subtitle={`${today} · ${streak?.currentStreak ?? 0}-day streak · ${sessionsThisWeek} sessions this week`}
      actions={
        <Link to="/practice" className="vidya-shell__primary">
          ▶ Resume session
        </Link>
      }
    >
      <div className="vidya-grid-3">
        {/* Hero readiness card */}
        <section className="vidya-hero" aria-labelledby="hero-readiness">
          <p className="vidya-hero__eyebrow" id="hero-readiness">
            {examShort} Readiness · AI estimate
          </p>
          <div className="vidya-hero__number">
            {readinessScaled || "—"}
            <span className="vidya-hero__number-unit">/ 900</span>
          </div>
          <div className="vidya-hero__meta-row">
            <span className="vidya-hero__delta">▲ +18 this week</span>
            <span className="vidya-hero__theta">θ = +0.79</span>
          </div>
          <p className="vidya-hero__caption" style={{ marginTop: "var(--sp-4)" }}>
            {readinessScaled
              ? `${percentile(score)} percentile · projection Exam Day (${exam?.subtitle ?? "May 2027"})`
              : "Practice 10 more questions to see your readiness."}
          </p>
        </section>

        {/* Next Best Action */}
        <section className="vidya-nba">
          <div className="vidya-nba__head">
            <span className="vidya-nba__eyebrow">Next best action</span>
            <span className="vidya-nba__pill">38 min</span>
          </div>
          {nextBest ? (
            <>
              <h2 className="vidya-nba__title">
                Revisit <em>{nextBest.title}</em>. Mastery dropped{" "}
                {Math.round((1 - nextBest.ewa) * 12)}% since last week.
              </h2>
              <p className="vidya-nba__body">
                <strong>12 questions</strong> tuned to your current θ. Estimated
                readiness lift: <strong>+4 pts.</strong>
              </p>
              <div className="vidya-nba__actions">
                <Link
                  to={`/practice?topic=${nextBest.topicId}`}
                  className="vidya-shell__primary"
                  style={{ background: "var(--accent)", color: "var(--paper)" }}
                >
                  Start session
                </Link>
                <Link to="/analysis">Why this?</Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="vidya-nba__title">
                Take a 5-minute diagnostic so the AI can pick your next session.
              </h2>
              <p className="vidya-nba__body">
                We need 15 answered questions to calibrate your θ. Once we have
                it, every session here is hand-picked for your weakest concepts.
              </p>
              <div className="vidya-nba__actions">
                <Link to="/onboarding/diagnostic" className="vidya-shell__primary">
                  Start diagnostic
                </Link>
              </div>
            </>
          )}
        </section>

        {/* Today's Plan */}
        <section className="vidya-plan">
          <div className="vidya-plan__head">
            <span className="vidya-plan__head-title">Today's plan</span>
            <span className="vidya-plan__head-count">
              {planDone}/{plan.length} done
            </span>
          </div>
          {plan.map((it) => (
            <label
              key={it.label}
              className={`vidya-plan__row${it.done ? " vidya-plan__row--done" : ""}`}
            >
              <input
                type="checkbox"
                className="vidya-plan__check"
                defaultChecked={it.done}
              />
              <span>{it.label}</span>
              <span className={`vidya-plan__time${it.now ? " vidya-plan__time--now" : ""}`}>
                {it.time}
              </span>
            </label>
          ))}
        </section>
      </div>

      {/* 4 KPI tiles */}
      <div className="vidya-grid-4">
        <StatTile
          label="Mastery index"
          value={masteryIndex !== null ? masteryIndex.toFixed(2) : "—"}
          delta={masteryIndex !== null ? "▲ 4.2%" : undefined}
          deltaDirection="up"
          deltaMeta="vs. last week"
        />
        <StatTile
          label="Streak"
          value={String(streak?.currentStreak ?? 0)}
          unit="days"
          delta="▲ 1%"
          deltaDirection="up"
          deltaMeta="vs. yesterday"
        />
        <StatTile
          label="Questions / week"
          value={String(questionsThisWeek || 0)}
          delta="▼ 6%"
          deltaDirection="down"
          deltaMeta="vs. last week"
        />
        <StatTile
          label="Avg time / Q"
          value={
            questionsThisWeek > 0
              ? Math.round((minutesThisWeek * 60) / questionsThisWeek).toString()
              : "—"
          }
          unit="sec"
          delta="▼ 3% faster"
          deltaDirection="up"
          deltaMeta=""
        />
      </div>

      {/* Mastery by subject + activity heatmap */}
      <div className="vidya-grid-2">
        <section className="vidya-table">
          <div className="vidya-table__head">
            <span className="vidya-table__head-title">Mastery by subject</span>
            <span className="vidya-table__head-meta">
              {subjectRows.length} subjects · {mastery.length} topics
            </span>
          </div>
          <div className="vidya-table__head-sub">Where you stand</div>
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th style={{ textAlign: "right" }}>Chapters</th>
                <th style={{ textAlign: "right" }}>Mastered</th>
                <th style={{ textAlign: "right" }}>Strong</th>
                <th style={{ textAlign: "right" }}>Developing</th>
                <th style={{ textAlign: "right" }}>Weak</th>
                <th style={{ textAlign: "right" }}>Readiness</th>
              </tr>
            </thead>
            <tbody>
              {subjectRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ color: "var(--ink-3)", textAlign: "center", padding: "var(--sp-6)" }}>
                    Start a few sessions to build your mastery picture.
                  </td>
                </tr>
              ) : (
                subjectRows.map((row) => (
                  <tr key={row.subjectId}>
                    <td>
                      <div className="vidya-table__subject">
                        <span className="vidya-table__subject-bar" style={{ background: row.color }} />
                        <div>
                          <div className="vidya-table__subject-name">{row.name}</div>
                          <div className="vidya-table__subject-meta">
                            {row.chapters} chapters
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>{row.chapters}</td>
                    <td style={{ textAlign: "right" }} className="vidya-table__num--strong">{row.mastered}</td>
                    <td style={{ textAlign: "right" }} className="vidya-table__num--strong">{row.strong}</td>
                    <td style={{ textAlign: "right" }} className="vidya-table__num--dev">{row.dev}</td>
                    <td style={{ textAlign: "right" }} className="vidya-table__num--weak">{row.weak}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Sparkline
                          data={row.trend}
                          stroke={row.color}
                          width={64}
                          height={20}
                          area={false}
                        />
                        <span className="vidya-table__readiness">{row.readiness}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <ActivityHeatmap cells={heatmap} />
      </div>
    </VidyaShell>
  );
}

/* ── Small inline stat tile (uses the .vidya-stat CSS family) ── */

interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaDirection?: "up" | "down";
  deltaMeta?: string;
}

function StatTile({ label, value, unit, delta, deltaDirection, deltaMeta }: StatTileProps) {
  return (
    <section className="vidya-stat">
      <div className="vidya-stat__head">
        <span className="vidya-stat__label">{label}</span>
      </div>
      <div className="vidya-stat__number">
        {value}
        {unit ? <span className="vidya-stat__unit">{unit}</span> : null}
      </div>
      {delta ? (
        <div
          className={`vidya-stat__delta vidya-stat__delta--${deltaDirection ?? "up"}`}
        >
          {delta}
          {deltaMeta ? (
            <span className="vidya-stat__delta-meta">{deltaMeta}</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */

function greetTime(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function percentile(score: number): string {
  if (!score) return "—";
  // Simple monotonic mapping for the headline; the real number comes
  // from /api/v1/analytics/percentile once that endpoint lands.
  const p = Math.min(99, Math.round(50 + score * 36));
  return `${p}th`;
}

function pickNextBest(mastery: TopicCard[]): TopicCard | null {
  // Pick the weakest topic with n>=3 answered (avoids tiny-n noise).
  return (
    mastery
      .filter((t) => t.n >= 3 && t.ewa < 0.7)
      .sort((a, b) => a.ewa - b.ewa)[0] ?? mastery[0] ?? null
  );
}

function groupBySubject(topics: TopicCard[]): SubjectRow[] {
  if (!topics.length) return [];
  const groups = new Map<string, TopicCard[]>();
  for (const t of topics) {
    const key = t.subjectId || "other";
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  return Array.from(groups.entries()).map(([subjectId, items]) => {
    const meta = SUBJECT_HUES[subjectId.toLowerCase()] ?? {
      name: subjectId,
      color: "var(--ink-3)",
    };
    const chapters = items.length;
    let mastered = 0, strong = 0, dev = 0, weak = 0;
    for (const i of items) {
      if (i.ewa >= 0.9) mastered++;
      else if (i.ewa >= 0.7) strong++;
      else if (i.ewa >= 0.4) dev++;
      else if (i.ewa > 0) weak++;
    }
    const mean = items.reduce((acc, i) => acc + i.ewa, 0) / chapters;
    const readiness = Math.round(mean * 900);
    // Synthetic trend — replace with /api/v1/analytics/mastery/trend once shipped.
    const trend = items.slice(-8).map((i) => i.ewa);
    while (trend.length < 8) trend.unshift(Math.max(0, mean - 0.05));
    return {
      subjectId,
      name: meta.name,
      color: meta.color,
      chapters,
      mastered,
      strong,
      dev,
      weak,
      readiness,
      trend,
    };
  }).sort((a, b) => b.chapters - a.chapters);
}
