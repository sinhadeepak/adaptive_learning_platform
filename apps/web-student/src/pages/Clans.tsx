// F8b — Clans landing.
// URL: /clans
//
// Browse public clans, create your own, join one. Clan detail is a
// separate route (/clans/:id) so you can deep-link.

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";
import { social } from "../lib/social";
import { useAuth } from "../lib/auth-provider";

interface ClanRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  memberCap: number;
  visibility: string;
}

export function Clans() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [clans, setClans] = useState<ClanRow[] | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>("");
  const [newDesc, setNewDesc] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Public endpoint — no auth required to browse.
      const r = await fetch("/api/v1/social/clans");
      if (r.ok) {
        const body = (await r.json()) as { items: ClanRow[] };
        setClans(body.items);
      } else {
        setError(`HTTP ${r.status}`);
      }
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    if (!user) {
      setError("You need to be signed in to create a clan.");
      return;
    }
    if (!newName.trim()) {
      setError("Give your clan a name.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const r = await social.fetch("/api/v1/social/clans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          visibility: "PUBLIC",
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body?.detail?.message ?? body?.detail?.code ?? `HTTP ${r.status}`);
        return;
      }
      const body = await r.json();
      nav(`/clans/${body.id}`);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  }, [user, newName, newDesc, nav]);

  const join = useCallback(
    async (clanId: string) => {
      if (!user) {
        setError("You need to be signed in to join a clan.");
        return;
      }
      try {
        const r = await social.fetch(`/api/v1/social/clans/${clanId}/join`, {
          method: "POST",
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setError(body?.detail?.code ?? `HTTP ${r.status}`);
          return;
        }
        nav(`/clans/${clanId}`);
      } catch (e) {
        setError(`Network error: ${(e as Error).message}`);
      }
    },
    [user, nav],
  );

  // Disable create/join buttons until auth is settled so the user
  // doesn't fire a request that 401s with missing_user_header.
  const authReady = !authLoading && !!user;

  return (
    <AppShell
      title="Clans"
      actions={
        <Link to="/leaderboards" className="pg-btn pg-btn-ghost">
          Leaderboards →
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 1080 }}>
        {error && <Banner tone="danger">{error}</Banner>}

        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Clans</h1>
            <p className="pg-header-sub">
              Form a study group of up to 30 members. Compete in
              clan-vs-clan battles (3v3 or 5v5) and climb the clan
              leaderboard together.
            </p>
          </div>
        </header>

        <section className="pg-section">
          <h2 className="pg-section-title">Start your own</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Clan name (must be unique)"
              maxLength={120}
              name="clan-name"
              autoComplete="off"
              spellCheck={false}
              style={{ padding: 10, fontSize: 14 }}
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What's the clan about? (optional)"
              maxLength={500}
              rows={2}
              name="clan-description"
              autoComplete="off"
              style={{ padding: 10, fontSize: 13 }}
            />
            <button
              type="button"
              className="pg-btn pg-btn-primary"
              onClick={create}
              disabled={creating || !newName.trim() || !authReady}
              style={{ alignSelf: "flex-start" }}
            >
              {creating ? "Creating…" : "Create clan"}
            </button>
          </div>
        </section>

        <section className="pg-section">
          <h2 className="pg-section-title">
            Browse public clans
            <span className="pg-section-title-sub">
              {clans === null ? "loading…" : `${clans.length}`}
            </span>
          </h2>
          {clans !== null && clans.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-muted)",
                border: "1px dashed var(--border-subtle)",
                borderRadius: 8,
              }}
            >
              No public clans yet. Start one above.
            </div>
          )}
          {clans !== null && clans.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {clans.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: 16,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <Link
                    to={`/clans/${c.id}`}
                    style={{ fontWeight: 700, fontSize: 15, color: "inherit" }}
                  >
                    {c.name}
                  </Link>
                  {c.description && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {c.description}
                    </div>
                  )}
                  <div className="pg-row-meta">
                    <span>
                      👥 {c.memberCount} / {c.memberCap}
                    </span>
                    <span className="pg-row-meta-dot">·</span>
                    <span>{c.visibility}</span>
                  </div>
                  <div style={{ marginTop: "auto" }}>
                    <button
                      type="button"
                      className="pg-btn pg-btn-primary"
                      onClick={() => join(c.id)}
                      disabled={c.memberCount >= c.memberCap || !authReady}
                    >
                      {c.memberCount >= c.memberCap ? "Full" : "Join"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
