import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import {
  AiInsightPanel,
  KpiTile,
  ReadinessRing,
  SubjectRow,
  type InsightItem,
} from "../components/dashboard";

interface Profile {
  user: { firstName: string };
  preferences: { language: string; dailyGoalMinutes: number | null };
  exams: Array<{ examId: string; targetDate: string | null }>;
}

interface ReadinessResponse {
  userId: string;
  scope: string;
  score: number; // 0..1
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
  ewa: number;
  n: number;
}

export function Home() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [mastery, setMastery] = useState<TopicCard[] | null>(null);

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
                const tj = (await t2.json()) as { title: string };
                return { topicId: t.topicId, title: tj.title, ewa: t.ewa, n: t.n };
              }
            } catch {
              /* fall through */
            }
            return {
              topicId: t.topicId,
              title: `Topic ${t.topicId.slice(0, 8)}`,
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
  const goal = profile?.preferences.dailyGoalMinutes;
  const targetDate = profile?.exams[0]?.targetDate ?? null;
  const daysRemaining = daysUntil(targetDate);
  const hasReadiness = readiness !== null && readiness.nTopics > 0;
  const scorePct = readiness ? Math.round(readiness.score * 100) : 0;

  // AI insights derived from whatever signals we already have today.
  // Mirrors the canonical "◈ AI INSIGHTS" panel from the design.
  const insights: InsightItem[] = buildInsights({
    hasReadiness,
    streak: streak?.currentStreak ?? 0,
    mastery: mastery ?? [],
    daysRemaining,
  });

  return (
    <AppShell
      title="Home"
      chips={[
        ...(daysRemaining !== null
          ? [{ label: `Exam in ${daysRemaining}d`, live: false }]
          : []),
        ...(streak && streak.currentStreak > 0
          ? [{ label: `🔥 ${streak.currentStreak}-day streak` }]
          : []),
      ]}
      actions={
        <Link to="/catalog" className="btn btn-primary">
          Practice →
        </Link>
      }
    >
      <h1 className="page-greeting">
        {greeting}, {firstName}
      </h1>
      <p className="page-subhead">
        {hasReadiness && readiness
          ? `Updated ${timeAgo(readiness.updatedAt)} · ${readiness.nTopics} topic${readiness.nTopics === 1 ? "" : "s"} tracked`
          : "Take your first quiz so we can start measuring readiness."}
      </p>

      <section className="kpi-grid" aria-label="Headline metrics">
        <KpiTile
          value={hasReadiness ? `${scorePct}%` : "—"}
          label="Readiness"
        />
        <KpiTile
          value={streak?.currentStreak ?? 0}
          label="Current streak"
          delta={
            streak && streak.longestStreak > streak.currentStreak
              ? `Longest: ${streak.longestStreak}`
              : undefined
          }
          deltaTone="neutral"
        />
        <KpiTile value={mastery?.length ?? 0} label="Topics in motion" />
        <KpiTile
          value={goal ?? "—"}
          label="Daily goal · min"
          delta={goal ? "from onboarding" : "set in settings"}
          deltaTone="neutral"
        />
      </section>

      <section className="dashboard-grid">
        <div className="card">
          <h2 className="section-heading">Readiness today</h2>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <ReadinessRing score={hasReadiness ? scorePct : 0} size={108} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
                {hasReadiness && readiness
                  ? `You're at ${scorePct}% readiness across ${readiness.nTopics} topic${readiness.nTopics === 1 ? "" : "s"}. Keep your streak alive — adaptive practice picks the next item where you'll learn most.`
                  : "Once you've completed a few quizzes the readiness ring fills in automatically."}
              </p>
              <Link to="/catalog" className="btn btn-primary">
                {hasReadiness ? "Practice another topic →" : "Browse subjects →"}
              </Link>
            </div>
          </div>
        </div>

        <AiInsightPanel items={insights} />
      </section>

      <section style={{ marginBottom: "var(--sp-6)" }}>
        <h2 className="section-heading">Topic mastery</h2>
        {mastery && mastery.length > 0 ? (
          <div className="subject-list">
            {mastery.map((m) => (
              <SubjectRow
                key={m.topicId}
                name={m.title}
                pct={Math.round(m.ewa * 100)}
                meta={`${m.n} session${m.n === 1 ? "" : "s"}`}
                href={`/catalog/topic/${m.topicId}`}
              />
            ))}
          </div>
        ) : (
          <div className="card empty-state">
            <div className="empty-state-title">Nothing tracked yet</div>
            <p>
              Start a practice quiz on any topic and your mastery will appear here.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function buildInsights(args: {
  hasReadiness: boolean;
  streak: number;
  mastery: TopicCard[];
  daysRemaining: number | null;
}): InsightItem[] {
  const out: InsightItem[] = [];
  if (!args.hasReadiness) {
    out.push({
      tone: "ai",
      text:
        "Take a 10-question practice round on any topic. The 3PL IRT engine starts shaping your readiness after the first session.",
    });
  } else {
    const weakest = [...args.mastery].sort((a, b) => a.ewa - b.ewa)[0];
    if (weakest && weakest.ewa < 0.4) {
      out.push({
        tone: "warning",
        text: `${weakest.title} is your weakest topic at ${Math.round(weakest.ewa * 100)}%. A short focused round can move it the most.`,
      });
    }
    const strongest = [...args.mastery].sort((a, b) => b.ewa - a.ewa)[0];
    if (strongest && strongest.ewa >= 0.7) {
      out.push({
        tone: "success",
        text: `You're strong on ${strongest.title} (${Math.round(strongest.ewa * 100)}%). Try a mock test to lock it in.`,
      });
    }
  }
  if (args.streak === 0) {
    out.push({
      tone: "ai",
      text:
        "No streak yet today. A 5-minute quiz keeps it ticking — most students see big gains around day 7.",
    });
  } else if (args.streak >= 7) {
    out.push({
      tone: "success",
      text: `${args.streak}-day streak — you're in the top quartile for consistency.`,
    });
  }
  if (args.daysRemaining !== null && args.daysRemaining < 30) {
    out.push({
      tone: "warning",
      text: `Exam in ${args.daysRemaining} day${args.daysRemaining === 1 ? "" : "s"}. Lean toward weak-topic drills over breadth.`,
    });
  }
  return out.slice(0, 4);
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

function timeAgo(iso: string | null): string {
  if (!iso) return "just now";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
