// Clans — Aurora redesign (F8b).
//
// Spec: docs/02-design/redesign/clans.md
// ADR:  docs/adr/0028-design-system-v2-aurora.md (S7 deliverable)
//
// API surface preserved: GET /api/v1/social/clans, POST /api/v1/social/clans,
// POST /api/v1/social/clans/{id}/join.

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Tag,
} from "@alp/ui";
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
  const [createOpen, setCreateOpen] = useState<boolean>(false);

  const load = useCallback(async () => {
    setError(null);
    try {
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

  const authReady = !authLoading && !!user;

  return (
    <AppShell
      title="Clans"
      actions={
        <Link to="/leaderboards" style={{ textDecoration: "none" }}>
          <Button variant="ghost" size="sm">Leaderboards →</Button>
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
          Clans
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--ink-3)" }}>
          Form a study group of up to 30 members. Compete in clan-vs-clan
          battles and climb the clan leaderboard together.
        </p>
      </header>

      {/* ── Start your own — collapsible per redesign brief (browse-first IA) ── */}
      <section aria-label="Start your own clan" style={{ marginBottom: 20 }}>
        {!createOpen ? (
          <Card padding="md">
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                  Start your own clan
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  Invite friends to study with you — name it, ship it.
                </div>
              </div>
              <Button
                variant="aurora"
                onClick={() => setCreateOpen(true)}
                disabled={!authReady}
              >
                + Start a clan
              </Button>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Start your own clan</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <FormField label="Clan name" required>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Clan name (must be unique)"
                  maxLength={120}
                  name="clan-name"
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormField>
              <FormField label="About (optional)">
                <Input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What's the clan about?"
                  maxLength={500}
                  name="clan-description"
                  autoComplete="off"
                />
              </FormField>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="primary"
                  loading={creating}
                  onClick={create}
                  disabled={creating || !newName.trim() || !authReady}
                >
                  {creating ? "Creating…" : "Create clan"}
                </Button>
                <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}
      </section>

      {/* ── Browse public clans ── */}
      <section aria-label="Browse public clans">
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
            Browse public clans
          </h2>
          <Tag size="sm" tone="neutral" variant="soft">
            {clans === null ? "loading…" : clans.length}
          </Tag>
        </div>

        {clans === null ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} padding="md">
                <div style={{ height: 80 }} />
              </Card>
            ))}
          </div>
        ) : clans.length === 0 ? (
          <EmptyState
            illustration={<span aria-hidden style={{ fontSize: 40 }}>🏰</span>}
            title="No public clans yet"
            description="Be the first — start a clan above and invite your friends to join."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {clans.map((c) => {
              const full = c.memberCount >= c.memberCap;
              return (
                <Card key={c.id} padding="md">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
                    <Link
                      to={`/clans/${c.id}`}
                      style={{
                        textDecoration: "none",
                        color: "var(--ink)",
                        fontWeight: 700,
                        fontSize: 15,
                      }}
                    >
                      {c.name}
                    </Link>
                    {c.description ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--ink-3)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {c.description}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Tag size="sm" tone={full ? "danger" : "brand"} variant="soft">
                        👥 {c.memberCount}/{c.memberCap}
                      </Tag>
                      <Tag size="sm" tone="neutral" variant="soft">
                        {c.visibility}
                      </Tag>
                    </div>
                    <div style={{ marginTop: "auto" }}>
                      <Button
                        variant={full ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => join(c.id)}
                        disabled={full || !authReady}
                        fullWidth
                      >
                        {full ? "Full" : "Join"}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}