// Phase 1D-9 — League standings page.

import { useEffect, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";

interface XpStatus {
  user_id: string;
  total_xp: number;
  weekly_xp: number;
  current_level: number;
  current_league: string;
  weekly_resets_at: string;
  next_level_xp: number;
}

interface StandingsEntry {
  rank: number;
  userId: string;
  weeklyXp: number;
}

const LEAGUES = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"];
const COLORS: Record<string, string> = {
  BRONZE: "#CD7F32",
  SILVER: "#C0C0C0",
  GOLD: "#FFD700",
  PLATINUM: "#E5E4E2",
  DIAMOND: "#B9F2FF",
};

export function League() {
  const { user } = useAuth();
  const [status, setStatus] = useState<XpStatus | null>(null);
  const [standings, setStandings] = useState<StandingsEntry[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const r = await auth.fetch(`/api/v1/gamification/users/${user.id}/xp`);
      if (alive && r.ok) setStatus((await r.json()) as XpStatus);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!status) return;
    let alive = true;
    (async () => {
      const r = await auth.fetch(`/api/v1/gamification/leagues/${status.current_league}`);
      if (alive && r.ok) {
        const body = (await r.json()) as { standings: StandingsEntry[] };
        setStandings(body.standings);
      }
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  return (
    <AppShell title="League">
      <main className="page" style={{ padding: 24, maxWidth: 800 }}>
        {status && (
          <section
            style={{
              padding: 24,
              background: "var(--bg-surface1)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: COLORS[status.current_league] ?? "#888",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#000",
                }}
              >
                {status.current_level}
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {status.current_league} League
                </div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  Level {status.current_level}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {status.total_xp} XP total · {status.weekly_xp} this week
                </div>
              </div>
            </div>
            <div
              style={{
                height: 8,
                background: "var(--bg-surface)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (status.total_xp / Math.max(1, status.next_level_xp)) * 100)}%`,
                  height: "100%",
                  background: "var(--color-ai)",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {status.total_xp} / {status.next_level_xp} XP to next level
            </div>
          </section>
        )}

        <h2 style={{ marginTop: 0 }}>League standings — this week</h2>
        {standings.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No standings yet — earn XP from quizzes, flashcards, and streaks to enter the leaderboard.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {standings.map((s) => (
              <li
                key={s.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background:
                    user?.id === s.userId ? "var(--color-ai-soft, rgba(167,139,250,0.15))" : "var(--bg-surface1)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: s.rank <= 3 ? COLORS[status?.current_league ?? "BRONZE"] : "var(--bg-surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    color: s.rank <= 3 ? "#000" : "var(--text-primary)",
                  }}
                >
                  {s.rank}
                </div>
                <div style={{ flex: 1 }}>
                  <code style={{ fontSize: 13 }}>{s.userId.slice(0, 8)}</code>
                  {user?.id === s.userId && (
                    <span style={{ marginLeft: 8, color: "var(--color-ai)", fontSize: 11 }}>
                      (you)
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 700, color: "var(--color-ai)" }}>
                  {s.weeklyXp} XP
                </div>
              </li>
            ))}
          </ul>
        )}

        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16 }}>
          Top 10% promote to {LEAGUES[Math.min(4, LEAGUES.indexOf(status?.current_league ?? "BRONZE") + 1)]} ·
          bottom 20% drop to {LEAGUES[Math.max(0, LEAGUES.indexOf(status?.current_league ?? "BRONZE") - 1)]}.
        </p>
      </main>
    </AppShell>
  );
}

// Compact XP header pill for the dashboard top-right.
export function XPHeader() {
  const { user } = useAuth();
  const [status, setStatus] = useState<XpStatus | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/gamification/users/${user.id}/xp`);
        if (alive && r.ok) setStatus((await r.json()) as XpStatus);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  if (!status) return null;
  return (
    <a
      href="/league"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: "var(--bg-surface1)",
        border: "1px solid var(--border-default)",
        borderRadius: 999,
        textDecoration: "none",
        color: "var(--text-primary)",
        fontSize: 12,
      }}
      title={`${status.total_xp} XP total · ${status.weekly_xp} this week`}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: COLORS[status.current_league] ?? "#888",
          color: "#000",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {status.current_level}
      </span>
      <span style={{ fontWeight: 700 }}>{status.weekly_xp} XP</span>
      <span style={{ color: "var(--text-muted)" }}>{status.current_league}</span>
    </a>
  );
}
