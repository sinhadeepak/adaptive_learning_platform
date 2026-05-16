// Leaderboards — Aurora redesign (F8b).
//
// Spec: docs/02-design/redesign/leaderboards.md
// ADR:  docs/adr/0028-design-system-v2-aurora.md (S7 deliverable)
//
// Data: GET /api/v1/social/leaderboards/{boardId} (rows of {userId, rank, score})
// refreshed every 15 min by engagement service.
//
// Aurora restructure:
//   * Tabs replace the legacy `.pg-tabs` button row
//   * PodiumCard for top-3 (gold/silver/bronze rings + scores + names)
//   * Card-styled rows for the remaining ranks
//   * EmptyState when board is empty
//   * Skeleton rows while loading

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Tag,
} from "@alp/ui";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";
import { useUserDirectory, formatUser } from "../lib/user_directory";

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

  const board = BOARDS.find((b) => b.id === boardId);
  const ids = useMemo(() => (rows ?? []).map((r) => r.userId), [rows]);
  const dir = useUserDirectory(ids);

  const top3 = rows ? rows.slice(0, 3) : [];
  const rest = rows ? rows.slice(3) : [];

  return (
    <AppShell
      title="Leaderboards"
      actions={
        <Link to="/clans" style={{ textDecoration: "none" }}>
          <Button variant="ghost" size="sm">Clans →</Button>
        </Link>
      }
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <header style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--t-h1-size)",
            lineHeight: "var(--t-h1-line)",
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          Leaderboards
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--ink-3)" }}>
          Rankings refresh every 15 minutes. New battles need ~1 cycle before
          they affect the boards.
        </p>
      </header>

      {/* ── Board picker — segmented-style tabs ── */}
      <div
        role="tablist"
        aria-label="Leaderboard"
        style={{
          display: "inline-flex",
          gap: 0,
          backgroundColor: "var(--rule)",
          borderRadius: "var(--r-pill)",
          padding: 2,
          marginBottom: 12,
        }}
      >
        {BOARDS.map((b) => {
          const active = boardId === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setBoardId(b.id)}
              style={{
                appearance: "none",
                border: 0,
                background: active ? "var(--paper)" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-3)",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                padding: "6px 16px",
                borderRadius: "var(--r-pill)",
                cursor: "pointer",
                boxShadow: active ? "var(--shadow-sm)" : "none",
                transition: "all 120ms var(--m-ease)",
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>
      {board ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}>
          {board.hint}
        </div>
      ) : null}

      {/* ── Loading skeletons ── */}
      {rows === null ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[0, 1, 2].map((i) => (
              <Card key={i} padding="md">
                <div style={{ height: 96 }}>
                  <Skeleton shape="circle" width={56} height={56} />
                </div>
              </Card>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Card key={i} padding="sm">
                <Skeleton shape="text" width="60%" />
              </Card>
            ))}
          </div>
        </>
      ) : rows.length === 0 ? (
        <EmptyState
          illustration={<span aria-hidden style={{ fontSize: 40 }}>🏅</span>}
          title="No entries yet"
          description="The first refresh will populate the board — practice or battle to earn your spot."
          actions={
            <Link to="/catalog" style={{ textDecoration: "none" }}>
              <Button variant="aurora" iconLeft={<span aria-hidden>✦</span>}>
                Start practice
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* ── Podium for top 3 ── */}
          {top3.length > 0 ? (
            <section
              aria-label="Top 3"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(3, top3.length)}, 1fr)`,
                gap: 12,
                marginBottom: 20,
              }}
            >
              {top3.map((r) => {
                const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉";
                const ring =
                  r.rank === 1
                    ? "var(--reward-500)"
                    : r.rank === 2
                      ? "var(--ink-4)"
                      : "#A16207";
                return (
                  <Card key={r.userId} padding="md">
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 32, lineHeight: 1 }} aria-hidden>
                        {medal}
                      </div>
                      <span
                        style={{
                          padding: 3,
                          borderRadius: "50%",
                          background: ring,
                          display: "inline-block",
                        }}
                      >
                        <Avatar
                          name={formatUser(r.userId, dir[r.userId])}
                          size="lg"
                        />
                      </span>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--ink)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                          fontSize: 13,
                        }}
                      >
                        {formatUser(r.userId, dir[r.userId])}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 20,
                          fontWeight: 700,
                          color: "var(--ink)",
                          fontFeatureSettings: '"tnum"',
                        }}
                      >
                        {Math.round(r.score).toLocaleString()}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </section>
          ) : null}

          {/* ── Remaining ranks ── */}
          {rest.length > 0 ? (
            <section aria-label="Other rankings">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "var(--t-h3-size)",
                    lineHeight: "var(--t-h3-line)",
                    fontWeight: 600,
                    color: "var(--ink-2)",
                  }}
                >
                  All rankings
                </h2>
                <Tag size="sm" tone="neutral" variant="soft">
                  {rows.length}
                </Tag>
              </div>
              <Card padding="sm">
                <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {rest.map((r, idx) => (
                    <li
                      key={r.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 8px",
                        borderTop:
                          idx === 0 ? "none" : "1px solid var(--rule-2)",
                      }}
                    >
                      <span
                        style={{
                          minWidth: 32,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          color: "var(--ink-2)",
                          fontFeatureSettings: '"tnum"',
                          textAlign: "right",
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
                          color: "var(--ink)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: 13,
                        }}
                      >
                        {formatUser(r.userId, dir[r.userId])}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                          color: "var(--ink-2)",
                          fontFeatureSettings: '"tnum"',
                        }}
                      >
                        {Math.round(r.score).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}