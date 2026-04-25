import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, tokens } from "@alp/design-system";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";

interface Profile {
  user: { firstName: string };
  preferences: { language: string; dailyGoalMinutes: number | null };
  exams: Array<{ examId: string; targetDate: string | null }>;
}

interface ReadinessResponse {
  userId: string;
  scope: string;
  score: number;        // 0..1
  nTopics: number;
  updatedAt: string | null;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface TopicCard {
  topicId: string;
  title: string;
  ewa: number;
  n: number;
}

export function Home() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [mastery, setMastery] = useState<TopicCard[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/profile/me");
        if (res.ok) setProfile((await res.json()) as Profile);
      } catch {
        // silent — profile is non-blocking on home
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Readiness — synthesizes a 0/0 row even for fresh users so we never 404 here.
      try {
        const r = await auth.fetch(`/api/v1/analytics/readiness/${user.id}`);
        if (r.ok) setReadiness((await r.json()) as ReadinessResponse);
      } catch { /* swallow */ }

      // Mastery list — empty array for fresh users.
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
        // Resolve titles — small N (<= 9 in closed beta), parallel-fetch is fine.
        // Falls back to a truncated id if a topic lookup fails.
        const cards = await Promise.all(
          body.topics.map(async (t): Promise<TopicCard> => {
            try {
              const t2 = await auth.fetch(`/api/v1/catalog/topics/${t.topicId}`);
              if (t2.ok) {
                const tj = (await t2.json()) as { title: string };
                return { topicId: t.topicId, title: tj.title, ewa: t.ewa, n: t.n };
              }
            } catch { /* fall through */ }
            return { topicId: t.topicId, title: `Topic ${t.topicId.slice(0, 8)}`, ewa: t.ewa, n: t.n };
          })
        );
        // Highest mastery first.
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
  const hasData = readiness !== null && readiness.nTopics > 0;
  const scorePct = readiness ? Math.round(readiness.score * 100) : 0;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <span style={styles.brand}>ALP</span>
        <button type="button" onClick={() => logout()} style={styles.signOutBtn}>
          Sign out
        </button>
      </header>

      <section style={styles.section}>
        <h1 style={styles.greeting}>
          {greeting}, {firstName}
        </h1>
        {targetDate && daysRemaining !== null ? (
          <p style={styles.subtitle}>
            🎯 Exam in {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
          </p>
        ) : null}
      </section>

      <section style={styles.cardSection}>
        <div style={styles.card}>
          <div style={styles.firstQuizRow}>
            <ScoreRing pct={hasData ? scorePct : null} />
            <div style={{ flex: 1 }}>
              {hasData ? (
                <>
                  <div style={styles.cardTitle}>Readiness {scorePct}%</div>
                  <p style={styles.cardSubtitle}>
                    Across {readiness!.nTopics} topic{readiness!.nTopics === 1 ? "" : "s"}.
                    Updated {timeAgo(readiness!.updatedAt)}.
                  </p>
                  <Link to="/catalog" style={{ textDecoration: "none" }}>
                    <Button>Practice another topic →</Button>
                  </Link>
                </>
              ) : (
                <>
                  <div style={styles.cardTitle}>Take your first quiz</div>
                  <p style={styles.cardSubtitle}>
                    We'll start measuring your readiness once you've answered some questions.
                  </p>
                  <Link to="/catalog" style={{ textDecoration: "none" }}>
                    <Button>Browse subjects →</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {mastery && mastery.length > 0 ? (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Topic mastery</h2>
          <ul style={styles.masteryList}>
            {mastery.map((m) => {
              const pct = Math.round(m.ewa * 100);
              return (
                <li key={m.topicId} style={styles.masteryRow}>
                  <Link to={`/catalog/topic/${m.topicId}`} style={styles.masteryLink}>
                    <div style={styles.masteryHeader}>
                      <span style={styles.masteryTitle}>{m.title}</span>
                      <span style={styles.masteryPct}>{pct}%</span>
                    </div>
                    <div style={styles.masteryBarOuter}>
                      <div
                        style={{
                          ...styles.masteryBarFill,
                          width: `${pct}%`,
                          background: barColor(pct),
                        }}
                      />
                    </div>
                    <span style={styles.masteryMeta}>
                      {m.n} session{m.n === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>Your goal</h2>
        <p style={styles.goalText}>
          {goal ? (
            <>
              <Badge tone="info">{goal} min/day</Badge> &nbsp;Set during onboarding. You can change it in Settings (coming soon).
            </>
          ) : (
            "No daily goal set yet."
          )}
        </p>
      </section>

      <nav style={styles.bottomNav} aria-label="Primary">
        <Link to="/home" style={navStyle(true)}>🏠 Home</Link>
        <Link to="/catalog" style={navStyle(false)}>📚 Catalog</Link>
        <Link to="/search" style={navStyle(false)}>🔍 Search</Link>
      </nav>
    </main>
  );
}

function ScoreRing({ pct }: { pct: number | null }) {
  const empty = pct === null;
  const tone = empty ? tokens.colors.text.muted : pct >= 80 ? tokens.colors.semantic.success.fg : pct >= 50 ? tokens.colors.semantic.warning.fg : tokens.colors.semantic.danger.fg;
  return (
    <div
      style={{
        ...styles.scoreRing,
        borderColor: empty ? tokens.colors.surface.tertiary : tone,
      }}
      aria-label={empty ? "Readiness score (no data yet)" : `Readiness score ${pct}%`}
      role="img"
    >
      <span style={{ fontSize: empty ? 18 : 22, fontWeight: 700, color: tone }}>
        {empty ? "—" : `${pct}%`}
      </span>
    </div>
  );
}

function barColor(pct: number): string {
  if (pct >= 80) return tokens.colors.semantic.success.fg;
  if (pct >= 50) return tokens.colors.semantic.warning.fg;
  return tokens.colors.semantic.danger.fg;
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
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
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

function navStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    textAlign: "center",
    padding: tokens.spacing[3],
    color: active ? tokens.colors.brand.primary : tokens.colors.text.secondary,
    fontWeight: active ? 500 : 400,
    textDecoration: "none",
    fontSize: tokens.typography.scale.body.size,
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: tokens.colors.surface.secondary,
    fontFamily: tokens.typography.family.ui,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: `${tokens.spacing[4]}px ${tokens.spacing[6]}px`,
    background: tokens.colors.surface.primary,
    borderBottom: `1px solid ${tokens.colors.border.default}`,
    height: 56,
  },
  brand: {
    fontSize: tokens.typography.scale.subheading.size,
    fontWeight: 600,
    color: tokens.colors.brand.primary,
  },
  signOutBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: tokens.colors.text.secondary,
    fontSize: tokens.typography.scale.body.size,
    fontFamily: "inherit",
  },
  section: {
    padding: tokens.spacing[5],
    maxWidth: 720,
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },
  cardSection: {
    padding: `0 ${tokens.spacing[5]}px`,
    maxWidth: 720,
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },
  greeting: {
    margin: 0,
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
  },
  subtitle: {
    color: tokens.colors.text.secondary,
    fontSize: tokens.typography.scale.body.size,
    marginTop: tokens.spacing[1],
  },
  card: {
    background: tokens.colors.surface.primary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.card,
    padding: tokens.spacing[5],
  },
  firstQuizRow: { display: "flex", gap: tokens.spacing[5], alignItems: "center" },
  scoreRing: {
    width: 96,
    height: 96,
    borderRadius: "50%",
    border: "4px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: tokens.typography.scale.subheading.size,
    fontWeight: tokens.typography.scale.subheading.weight,
    color: tokens.colors.text.primary,
  },
  cardSubtitle: {
    color: tokens.colors.text.secondary,
    fontSize: tokens.typography.scale.body.size,
    margin: `${tokens.spacing[1]}px 0 ${tokens.spacing[3]}px 0`,
  },
  sectionHeading: {
    margin: 0,
    fontSize: tokens.typography.scale.sectionHeading.size,
    fontWeight: tokens.typography.scale.sectionHeading.weight,
    color: tokens.colors.text.primary,
    marginBottom: tokens.spacing[3],
  },
  goalText: {
    fontSize: tokens.typography.scale.body.size,
    color: tokens.colors.text.secondary,
    marginTop: tokens.spacing[2],
    display: "flex",
    alignItems: "center",
  },
  masteryList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacing[3],
  },
  masteryRow: {
    background: tokens.colors.surface.primary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.panel,
    overflow: "hidden",
  },
  masteryLink: {
    display: "block",
    padding: tokens.spacing[3],
    textDecoration: "none",
    color: "inherit",
  },
  masteryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: tokens.spacing[2],
  },
  masteryTitle: {
    fontSize: tokens.typography.scale.body.size,
    fontWeight: 500,
    color: tokens.colors.text.primary,
  },
  masteryPct: {
    fontSize: tokens.typography.scale.body.size,
    fontWeight: 600,
    color: tokens.colors.text.primary,
  },
  masteryBarOuter: {
    width: "100%",
    height: 6,
    background: tokens.colors.surface.tertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  masteryBarFill: {
    height: "100%",
    transition: "width 200ms ease-out",
  },
  masteryMeta: {
    display: "block",
    marginTop: tokens.spacing[2],
    fontSize: tokens.typography.scale.hint.size,
    color: tokens.colors.text.muted,
  },
  bottomNav: {
    marginTop: "auto",
    display: "flex",
    background: tokens.colors.surface.primary,
    borderTop: `1px solid ${tokens.colors.border.default}`,
  },
};
