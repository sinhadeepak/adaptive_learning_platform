import { useEffect, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";

// 30-day activity heatmap — GitHub-style intensity ramp by sessions/day.
// Renders 6 columns × 5 rows = 30 cells, anchored on today's column-bottom.
// Uses /api/v1/analytics/daily-activity?days=30. Days with no row read as zero.

interface DayCell {
  date: string;
  sessions: number;
  minutes: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

const COLS = 6;
const ROWS = 5;

export function ActivityHeatmap({ days = 30 }: { days?: number }) {
  const { user } = useAuth();
  const [cells, setCells] = useState<DayCell[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/daily-activity/${user.id}?days=${days}`,
        );
        if (!r.ok) {
          if (alive) setCells([]);
          return;
        }
        const body = (await r.json()) as {
          activity: Array<{ date: string; sessions: number; minutes: number }>;
        };
        const map = new Map(body.activity.map((a) => [a.date, a]));
        const out: DayCell[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Walk back N-1 days inclusive of today, oldest first.
        const total = COLS * ROWS;
        for (let i = total - 1; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const row = map.get(key);
          out.push({
            date: key,
            sessions: row?.sessions ?? 0,
            minutes: row?.minutes ?? 0,
            intensity: 0,
          });
        }
        // Calibrate intensity buckets against the visible window so a
        // student with 1 session/day still gets a visible mid-tone.
        const max = Math.max(0, ...out.map((c) => c.sessions));
        for (const c of out) {
          if (c.sessions === 0) c.intensity = 0;
          else if (max <= 1) c.intensity = 2;
          else if (c.sessions / max >= 0.75) c.intensity = 4;
          else if (c.sessions / max >= 0.5) c.intensity = 3;
          else if (c.sessions / max >= 0.25) c.intensity = 2;
          else c.intensity = 1;
        }
        if (alive) setCells(out);
      } catch {
        if (alive) setCells([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, days]);

  if (cells === null) {
    return (
      <div style={{ height: 96, display: "flex", alignItems: "center", color: "var(--ink-3)", fontSize: 12 }}>
        Loading activity…
      </div>
    );
  }
  if (cells.length === 0) {
    return (
      <div style={{ color: "var(--ink-3)", fontSize: 12 }}>
        No activity data yet — your first quiz will start filling this map.
      </div>
    );
  }

  // Column-major layout: each column is a 5-day vertical stack so the
  // rightmost column ends at "today" at the bottom-right.
  const cols: DayCell[][] = [];
  for (let c = 0; c < COLS; c++) {
    cols.push(cells.slice(c * ROWS, (c + 1) * ROWS));
  }

  const sessionsLast30 = cells.reduce((s, c) => s + c.sessions, 0);
  const minutesLast30 = cells.reduce((s, c) => s + c.minutes, 0);
  const activeDays = cells.filter((c) => c.sessions > 0).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "flex-end",
        }}
      >
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {col.map((c, ri) => (
              <div
                key={`${ci}-${ri}`}
                title={`${c.date} · ${c.sessions} session${c.sessions === 1 ? "" : "s"} · ${c.minutes}m`}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: heatColor(c.intensity),
                  border: "1px solid var(--card)",
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
          fontSize: 11,
          color: "var(--ink-3)",
        }}
      >
        <span>
          {activeDays}/{cells.length} active days · {sessionsLast30} sessions ·{" "}
          {minutesLast30} min
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Less
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                width: 11,
                height: 11,
                borderRadius: 2,
                background: heatColor(i as DayCell["intensity"]),
              }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

function heatColor(intensity: DayCell["intensity"]): string {
  switch (intensity) {
    case 0:
      // Typo-bug fix: the original used --card-3 (with dashes) which
      // never resolves; the rgba fallback always rendered. Use the actual
      // token name so the empty heatmap cells re-theme.
      return "var(--paper-2)";
    case 1:
      return "rgba(99, 102, 241, 0.30)";
    case 2:
      return "rgba(99, 102, 241, 0.55)";
    case 3:
      return "rgba(99, 102, 241, 0.78)";
    case 4:
      return "rgba(99, 102, 241, 1)";
  }
}