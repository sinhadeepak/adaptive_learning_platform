// Phase 1D-9 — League standings page (Vidya rewrite).

import { useEffect, useState, Fragment } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

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

// Tier colour tokens — no hex literals; map to CSS colour tokens.
const TIER_TOKEN: Record<string, string> = {
  BRONZE: "var(--ink-3)",
  SILVER: "var(--ink-3)",
  GOLD: "var(--gold)",
  PLATINUM: "var(--info)",
  DIAMOND: "var(--accent)",
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

  const tierToken = TIER_TOKEN[status?.current_league ?? ""] ?? "var(--ink-3)";
  const xpPct = status
    ? Math.min(100, (status.total_xp / Math.max(1, status.next_level_xp)) * 100)
    : 0;

  // Promotion / demotion thresholds (top 10% promote, bottom 20% drop).
  const total = standings.length;
  const promotionCutoff = Math.ceil(total * 0.1);
  const demotionCutoff = Math.floor(total * 0.8);

  const leagueIdx = LEAGUES.indexOf(status?.current_league ?? "BRONZE");
  const promoteTo = LEAGUES[Math.min(4, leagueIdx + 1)];
  const demoteTo = LEAGUES[Math.max(0, leagueIdx - 1)];

  return (
    <VidyaShell
      crumbs="COMPETE · LEAGUE"
      title="Weekly league"
      subtitle="Promotes Sunday 23:59 IST"
    >
      {/* STATUS card */}
      <section className="vidya-heat-card">
        <div className="vidya-heat-card__head">
          <div>
            <div className="vidya-heat-card__eyebrow">
              Current tier · {status?.current_league ?? "—"}
            </div>
            <div className="vidya-heat-card__title">
              {status?.weekly_xp ?? 0} XP this week
            </div>
          </div>
          {/* Tier badge */}
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: tierToken,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 800,
              color: "var(--paper)",
              flexShrink: 0,
            }}
          >
            {status?.current_level ?? "—"}
          </div>
        </div>

        {/* Progress bar toward next level */}
        {status && (
          <div style={{ marginTop: "var(--sp-4)" }}>
            <div
              role="progressbar"
              aria-valuenow={Math.round(xpPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${status.total_xp} of ${status.next_level_xp} XP to next level`}
              style={{
                height: 8,
                background: "var(--rule)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${xpPct}%`,
                  height: "100%",
                  background: "var(--gold)",
                  borderRadius: 4,
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: "var(--sp-1)" }}>
              {status.total_xp} / {status.next_level_xp} XP to next level
            </p>
          </div>
        )}

        {/* Promotion / demotion legend */}
        {total > 0 && (
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: "var(--sp-2)" }}>
            Top 10% promote to {promoteTo} · bottom 20% drop to {demoteTo}
          </p>
        )}
      </section>

      {/* STANDINGS card */}
      <section className="vidya-card-block" aria-label="League standings">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">League standings — this week</h2>
        </div>

        {standings.length === 0 ? (
          <p style={{ color: "var(--ink-3)", marginTop: "var(--sp-3)" }}>
            No standings yet — earn XP from quizzes, flashcards, and streaks to enter the leaderboard.
          </p>
        ) : (
          <ul
            style={{ listStyle: "none", padding: 0, margin: "var(--sp-3) 0 0" }}
          >
            {/* Promotion-line marker */}
            {promotionCutoff > 0 && (
              <li
                aria-hidden
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--good)",
                  padding: "2px 0 4px",
                }}
              >
                ▲ Promotion zone
              </li>
            )}

            {standings.map((s, idx) => {
              const isMe = user?.id === s.userId;
              const isPromotionBoundary = s.rank === promotionCutoff;
              const isDemotionBoundary = s.rank === demotionCutoff + 1;

              return (
                <Fragment key={s.userId}>
                  {isPromotionBoundary && promotionCutoff < total && (
                    <li
                      aria-hidden
                      style={{
                        height: 2,
                        background: "var(--good)",
                        margin: "4px 0",
                        borderRadius: 1,
                      }}
                    />
                  )}
                  {isDemotionBoundary && (
                    <li
                      aria-hidden
                      style={{
                        height: 2,
                        background: "var(--bad)",
                        margin: "4px 0",
                        borderRadius: 1,
                      }}
                    />
                  )}
                  <li
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      background: isMe ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--paper-2)",
                      border: `1px solid ${isMe ? "var(--accent)" : "var(--rule)"}`,
                      borderRadius: 8,
                      marginBottom: 6,
                    }}
                    aria-current={isMe ? "true" : undefined}
                  >
                    {/* Rank badge */}
                    <div
                      aria-hidden
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background:
                          idx < 3 ? tierToken : "var(--paper)",
                        border: `1px solid ${idx < 3 ? "transparent" : "var(--rule)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 13,
                        color: idx < 3 ? "var(--paper)" : "var(--ink)",
                        flexShrink: 0,
                      }}
                    >
                      {s.rank}
                    </div>

                    {/* User ID */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <code style={{ fontSize: 13, color: "var(--ink)" }}>
                        {s.userId.slice(0, 8)}
                      </code>
                      {isMe && (
                        <span
                          style={{
                            marginLeft: 8,
                            color: "var(--accent)",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          (you)
                        </span>
                      )}
                    </div>

                    {/* XP */}
                    <div style={{ fontWeight: 700, color: "var(--gold)", flexShrink: 0 }}>
                      {s.weeklyXp} XP
                    </div>
                  </li>
                </Fragment>
              );
            })}

            {/* Demotion-zone label */}
            {demotionCutoff < total && (
              <li
                aria-hidden
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--bad)",
                  padding: "4px 0 2px",
                }}
              >
                ▼ Demotion zone
              </li>
            )}
          </ul>
        )}
      </section>
    </VidyaShell>
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

  const tierToken = TIER_TOKEN[status.current_league] ?? "var(--ink-3)";

  return (
    <Link
      to="/league"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 999,
        textDecoration: "none",
        color: "var(--ink)",
        fontSize: 12,
      }}
      title={`${status.total_xp} XP total · ${status.weekly_xp} this week`}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: tierToken,
          color: "var(--paper)",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {status.current_level}
      </span>
      <span style={{ fontWeight: 700 }}>{status.weekly_xp} XP</span>
      <span style={{ color: "var(--ink-3)" }}>{status.current_league}</span>
    </Link>
  );
}
