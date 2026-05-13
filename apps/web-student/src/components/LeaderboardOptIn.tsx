// Phase 1D-7 — National leaderboard opt-in toggle for Profile page.

import { useEffect, useState } from "react";
import { auth } from "../lib/api";

export function LeaderboardOptIn() {
  const [optIn, setOptIn] = useState(false);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/profile/me/leaderboard-opt-in`);
        if (alive && r.ok) {
          const body = (await r.json()) as { optIn: boolean; publicDisplayName: string | null };
          setOptIn(body.optIn);
          setName(body.publicDisplayName ?? "");
        }
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setSaved(false);
    const r = await auth.fetch(`/api/v1/profile/me/leaderboard-opt-in`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        optIn,
        publicDisplayName: name.trim() || null,
      }),
    });
    if (r.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (!loaded) return null;

  return (
    <section
      className="card"
      style={{
        padding: 16,
        background: "var(--bg-surface1)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        marginTop: 16,
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: 14 }}>National mock leaderboard</h3>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Opt in to be ranked against students across India on submitted mocks.
        Your name shows as a redacted handle unless you set a public display name.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
        />
        <span>Show me on the national leaderboard</span>
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Public display name (optional)"
          disabled={!optIn}
          style={{
            flex: 1,
            minWidth: 200,
            padding: 8,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            borderRadius: 6,
            opacity: optIn ? 1 : 0.5,
          }}
        />
        <button type="button" className="btn btn-primary" onClick={save}>
          Save
        </button>
        {saved && <span style={{ color: "var(--color-green)", fontSize: 12 }}>✓ saved</span>}
      </div>
    </section>
  );
}
