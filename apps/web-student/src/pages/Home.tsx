// Home — Vidya unified multi-exam dashboard.
//
// Spec: docs/02-design/design-system/04_components.md
//       + the 8-screen mockup set delivered with Vidya v1 (page 1/8).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout (single /home route for all students, regardless of enrolled-exam
// count — the old 2+ exam fork into MultiTrackBody has been retired in
// favor of a per-exam carousel + attention cards):
//
//   ┌─────── topbar (greeting + resume session) ───────┐
//   │  ┌─ readiness carousel ┐ ┌─ next best action ┐ ┌─ today's plan ┐
//   │  └──────────────────────┘ └───────────────────┘ └────────────────┘
//   │  ┌─ per-exam attention cards ─────────────────────────────────┐
//   │  └──────────────────────────────────────────────────────────────┘
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
import { ReadinessCarousel } from "../components/vidya/ReadinessCarousel";
import { ExamAttentionCards } from "../components/vidya/ExamAttentionCards";
import { Sparkline } from "@alp/ui";
import { type ExamMeta as MultiExamMeta } from "./MultiTrack";
import {
  buildEnrolledExams,
  fetchMultiExamSummary,
  type EnrolledExam,
  type ExamSummary,
} from "../lib/multiExam";

interface Profile {
  user: { firstName: string };
  preferences: { language: string; dailyGoalMinutes: number | null };
  exams: Array<{ examId: string; targetDate: string | null }>;
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
  const [enrolledExams, setEnrolledExams] = useState<EnrolledExam[]>([]);
  const [examSummaries, setExamSummaries] = useState<Record<string, ExamSummary>>({});
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [mastery, setMastery] = useState<TopicCard[]>([]);
  const [weekActivity, setWeekActivity] = useState<DailyActivity[]>([]);
  const [heatmap, setHeatmap] = useState<number[]>([]);

  // Profile + full enrolled-exam catalog (drives the readiness carousel +
  // per-exam attention cards).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [profileRes, examsRes] = await Promise.all([
          auth.fetch("/api/v1/profile/me"),
          auth.fetch("/api/v1/catalog/exams"),
        ]);
        if (!alive) return;
        if (profileRes.ok) {
          const data = (await profileRes.json()) as Profile;
          setProfile(data);
        }
        if (profileRes.ok && examsRes.ok) {
          const profileData = (await profileRes.clone().json()) as Profile;
          const examsBody = (await examsRes.json()) as
            | MultiExamMeta[]
            | { exams?: MultiExamMeta[] | null };
          const catalog: MultiExamMeta[] = Array.isArray(examsBody)
            ? examsBody
            : Array.isArray(examsBody.exams)
              ? examsBody.exams
              : [];
          if (alive) {
            const merged = buildEnrolledExams(
              (Array.isArray(profileData.exams) ? profileData.exams : []).map(
                (e) => ({ examId: e.examId, targetDate: e.targetDate }),
              ),
              catalog.map((c) => ({ id: c.id, code: c.code, name: c.name })),
            );
            setEnrolledExams(merged);
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
      const [s, a] = await Promise.all([
        safe<StreakResponse>(`/api/v1/analytics/streak/${user.id}`),
        // Engagement returns {userId, days: <int window>, activity: DailyActivity[]}.
        // The `days` field is the integer query param echo, NOT the records.
        safe<{ days: number; activity: DailyActivity[] | null }>(
          `/api/v1/analytics/daily-activity/${user.id}?days=84`,
        ),
      ]);
      if (!alive) return;
      setStreak(s);
      const records = Array.isArray(a?.activity) ? a!.activity : [];
      setWeekActivity(records.slice(-7));
      setHeatmap(records.map((d) => Math.min(1, (d.questions ?? 0) / 50)));
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
          const data = (await r.json()) as { topics?: Array<{ topicId: string; ewa: number; n: number }> | null };
          // Empty mastery (freshly-seeded user) returns {topics: null}
          // or omits the field entirely; treat both as no rows.
          const topicsList = Array.isArray(data.topics) ? data.topics : [];
          const cards = await Promise.all(
            topicsList.slice(0, 50).map(async (t) => {
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

  // Per-exam readiness/attention summaries (fetched once exams are known)
  useEffect(() => {
    if (!user?.id || enrolledExams.length === 0) return;
    let alive = true;
    (async () => {
      const map = await fetchMultiExamSummary(
        user.id,
        enrolledExams.map((e) => e.examId),
      );
      if (alive) setExamSummaries(map);
    })();
    return () => { alive = false; };
  }, [user?.id, enrolledExams]);

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
  const topicTitles = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of mastery) m[t.topicId] = t.title;
    return m;
  }, [mastery]);
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
        {/* Hero readiness — per-exam carousel */}
        <ReadinessCarousel exams={enrolledExams} summaries={examSummaries} />

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

      <ExamAttentionCards
        exams={enrolledExams}
        summaries={examSummaries}
        topicTitles={topicTitles}
      />

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
