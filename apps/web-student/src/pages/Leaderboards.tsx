// F8b — Leaderboards.
// URL: /leaderboards
//
// Tabs for the well-known boards. Backed by /social/leaderboards/{id};
// the engagement service populates rows every 15 min from the job at
// engagement/jobs/leaderboards.py.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
  const [boardId, setBoardId] = useState<string>(BOARDS[0].id);
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

  return (
    <AppShell
      title="Leaderboards"
      actions={
        <Link to="/clans" className="pg-btn pg-btn-ghost">
          Clans →
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 880 }}>
        {error && <Banner tone="danger">{error}</Banner>}

        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Leaderboards</h1>
            <p className="pg-header-sub">
              Rankings refresh every 15 minutes. New battles need ~1 cycle
              before they affect the boards.
            </p>
          </div>
        </header>

        <section className="pg-section">
          <div className="pg-tabs" role="tablist">
            {BOARDS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={"pg-tab" + (boardId === b.id ? " pg-tab-active" : "")}
                onClick={() => setBoardId(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
          {board && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 16px" }}>
              {board.hint}
            </div>
          )}

          {rows === null && <div>Loading…</div>}
          {rows !== null && rows.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-muted)",
                border: "1px dashed var(--border-subtle)",
                borderRadius: 8,
              }}
            >
              No entries yet. The first refresh will populate the board.
            </div>
          )}
          {rows !== null && rows.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <th style={{ padding: 8, width: 60 }}>Rank</th>
                  <th style={{ padding: 8 }}>User</th>
                  <th style={{ padding: 8, textAlign: "right" }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: 8, fontWeight: 700 }}>
                      {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
                    </td>
                    <td style={{ padding: 8, fontSize: 13 }}>
                      {formatUser(r.userId, dir[r.userId])}
                    </td>
                    <td style={{ padding: 8, textAlign: "right", fontSize: 13 }}>
                      {Math.round(r.score).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AppShell>
  );
}
