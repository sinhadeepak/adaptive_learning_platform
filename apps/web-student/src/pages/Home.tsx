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

export function Home() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

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

  const greeting = greetingFor(new Date());
  const firstName = profile?.user.firstName || user?.firstName || "there";
  const goal = profile?.preferences.dailyGoalMinutes;
  const targetDate = profile?.exams[0]?.targetDate ?? null;
  const daysRemaining = daysUntil(targetDate);

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
            <div style={styles.scoreRing} aria-label="Readiness score (no data yet)">
              <span style={{ fontSize: 18, color: tokens.colors.text.muted }}>—</span>
            </div>
            <div>
              <div style={styles.cardTitle}>Take your first quiz</div>
              <p style={styles.cardSubtitle}>
                We'll start measuring your readiness once you've answered some questions.
              </p>
              <Link to="/catalog" style={{ textDecoration: "none" }}>
                <Button>Browse subjects →</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

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
    border: `4px solid ${tokens.colors.surface.tertiary}`,
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
  },
  goalText: {
    fontSize: tokens.typography.scale.body.size,
    color: tokens.colors.text.secondary,
    marginTop: tokens.spacing[2],
    display: "flex",
    alignItems: "center",
  },
  bottomNav: {
    marginTop: "auto",
    display: "flex",
    background: tokens.colors.surface.primary,
    borderTop: `1px solid ${tokens.colors.border.default}`,
  },
};
