// Leaderboards — Vidya v1 redesign (mockup 05).
//
// Spec: docs/02-design/redesign/leaderboards.md
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Data: GET /api/v1/social/leaderboards/{boardId} (rows of {userId, rank, score})
// refreshed every 15 min by engagement service.
//
// Vidya layout:
//   * VidyaShell with COMPETE · LEADERBOARDS crumbs
//   * Board chips (Global XP / Weekly wins) in topbar
//   * Hero card: selected board name + your standing
//   * Top-20 standings table (current user row highlighted)
//   * Other rankings links (/league, /rank, /clans)

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Avatar } from "@alp/ui";
import { useAuth } from "../lib/auth-provider";
import { useUserDirectory, formatUser } from "../lib/user_directory";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface Row {
  userId: string;
  rank: number;
  score: number;
}

const BOARDS: Array<{ id: string; label: string; hint: string }> = [
  { id: "xp:global", label: "Global XP", hint: "Total XP earned across all activities" },
  { id: "wins:weekly", label: "Weekly wins", hint: "Rolling 7-day battle wins (populated after first battles play out)" },
];

export function Leaderboards() {
  const [boardId, setBoardId] = useState<string>(BOARDS[0]!.id);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const r = await fetch(
        `/api/v1/social/leaderboards/${encodeURIComponent(boardId)}`,
      );
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        return;
      }
      const body = (await r.json()) as { items: Row[] };
      setRows(body.items);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { user } = useAuth();
  const ids = useMemo(() => (rows ?? []).map((r) => r.userId), [rows]);
  const dir = useUserDirectory(ids);

  // Top 20 for the standings table
  const top20 = rows ? rows.slice(0, 20) : [];

  // Current user's row (for hero standing)
  const myRow = rows?.find((r) => r.userId === user?.id) ?? null;

  return (
    <VidyaShell
      crumbs="COMPETE · LEADERBOARDS"
      title="Leaderboards"
      chips={
        <>
          {BOARDS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`vidya-shell__chip${b.id === boardId ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setBoardId(b.id)}
            >
              {b.label}
            </button>
          ))}
        </>
      }
      actions={
        <button type="button" className="vidya-shell__chip" onClick={() => { void load(); }}>
          Refresh
        </button>
      }
    >
      {/* Error banner */}
      {error ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            marginBottom: "var(--sp-4)",
            background: "var(--bad)",
            color: "var(--paper)",
            borderRadius: "var(--r-md)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* HERO — selected board name + your standing */}
      <section className="vidya-heat-card">
        <div className="vidya-heat-card__head">
          <div>
            <div className="vidya-heat-card__eyebrow">
              {BOARDS.find((b) => b.id === boardId)?.label}
            </div>
            <div className="vidya-heat-card__title">Your standing</div>
          </div>
        </div>

        {rows === null ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>
        ) : myRow ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-6)",
              marginTop: "var(--sp-4)",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Rank
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 36,
                  fontWeight: 700,
                  color: "var(--accent)",
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1,
                }}
              >
                #{myRow.rank}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {boardId === "xp:global" ? "XP" : "Wins"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 36,
                  fontWeight: 700,
                  color: "var(--ink)",
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1,
                }}
              >
                {Math.round(myRow.score).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Name
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
                {formatUser(myRow.userId, dir[myRow.userId])}
              </div>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: "var(--sp-3)" }}>
            No entries yet — practice or battle to earn your spot.
          </p>
        ) : (
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: "var(--sp-3)" }}>
            {/* TODO(leaderboards): show "not ranked yet" delta once /me endpoint returns rank */}
            You are not yet ranked on this board. Keep practising!
          </p>
        )}
      </section>

      {/* STANDINGS table */}
      <section className="vidya-card-block" aria-label="Top players">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">Top 20</h2>
        </div>

        {rows === null ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13, padding: "var(--sp-3) 0" }}>Loading…</p>
        ) : top20.length === 0 ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13, padding: "var(--sp-3) 0" }}>
            No entries yet. Rankings refresh every 15 minutes.
          </p>
        ) : (
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {top20.map((r, idx) => {
              const isMe = r.userId === user?.id;
              return (
                <li
                  key={r.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-3)",
                    padding: "var(--sp-3) var(--sp-2)",
                    borderTop: idx === 0 ? "none" : "1px solid var(--rule-2)",
                    background: isMe ? "var(--accent)" : "transparent",
                    borderRadius: isMe ? "var(--r-md)" : 0,
                    color: isMe ? "var(--paper)" : "var(--ink)",
                  }}
                >
                  <span
                    style={{
                      minWidth: 28,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      fontFeatureSettings: '"tnum"',
                      textAlign: "right",
                      color: isMe ? "var(--paper)" : "var(--ink-2)",
                    }}
                  >
                    {r.rank}
                  </span>
                  <Avatar
                    name={formatUser(r.userId, dir[r.userId])}
                    size="sm"
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontSize: 13,
                      fontWeight: isMe ? 700 : 500,
                    }}
                  >
                    {formatUser(r.userId, dir[r.userId])}
                    {isMe ? " (you)" : ""}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      fontFeatureSettings: '"tnum"',
                      color: isMe ? "var(--paper)" : "var(--ink-2)",
                    }}
                  >
                    {Math.round(r.score).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* OTHER RANKINGS */}
      <section className="vidya-card-block" aria-label="Other rankings">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">Other rankings</h2>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          <li>
            <Link
              to="/league"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-3)",
                padding: "var(--sp-3) var(--sp-2)",
                color: "var(--accent)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: "var(--r-md)",
              }}
            >
              League table →
            </Link>
          </li>
          <li>
            <Link
              to="/rank"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-3)",
                padding: "var(--sp-3) var(--sp-2)",
                color: "var(--accent)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: "var(--r-md)",
              }}
            >
              National rank →
            </Link>
          </li>
          <li>
            <Link
              to="/clans"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-3)",
                padding: "var(--sp-3) var(--sp-2)",
                color: "var(--accent)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: "var(--r-md)",
              }}
            >
              Clans →
            </Link>
          </li>
        </ul>
      </section>
    </VidyaShell>
  );
}
