// ClanDetail — Vidya v1 redesign.
// URL: /clans/:clanId

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button, Card, Tag } from "@alp/ui";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { social } from "../lib/social";
import { useAuth } from "../lib/auth-provider";
import { useUserDirectory, formatUser } from "../lib/user_directory";

interface ClanDetail {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  visibility: string;
  memberCap: number;
  memberCount: number;
  createdAt: string;
  members: Array<{ userId: string; role: string; joinedAt: string }>;
}

export function ClanDetailPage() {
  const { clanId } = useParams<{ clanId: string }>();
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [clan, setClan] = useState<ClanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = user?.id ?? "";
  const isMember = !!clan?.members.find((m) => m.userId === me);
  const authReady = !authLoading && !!user;
  const memberIds = useMemo(
    () => (clan?.members ?? []).map((m) => m.userId),
    [clan],
  );
  const dir = useUserDirectory(memberIds);

  const load = useCallback(async () => {
    if (!clanId) return;
    setError(null);
    try {
      const r = await fetch(`/api/v1/social/clans/${clanId}`);
      if (r.status === 404) {
        setError("Clan not found.");
        return;
      }
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        return;
      }
      setClan(await r.json());
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }, [clanId]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = useCallback(async () => {
    if (!clanId) return;
    if (!authReady) {
      setError("You need to be signed in to join a clan.");
      return;
    }
    const r = await social.fetch(`/api/v1/social/clans/${clanId}/join`, {
      method: "POST",
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setError(body?.detail?.code ?? `HTTP ${r.status}`);
      return;
    }
    void load();
  }, [clanId, load, authReady]);

  const leave = useCallback(async () => {
    if (!clanId) return;
    if (!authReady) return;
    const r = await social.fetch(`/api/v1/social/clans/${clanId}/leave`, {
      method: "POST",
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setError(body?.detail?.code ?? `HTTP ${r.status}`);
      return;
    }
    nav("/clans");
  }, [clanId, nav, authReady]);

  const subtitle = clan
    ? `${clan.memberCount} / ${clan.memberCap} members · ${clan.visibility}`
    : undefined;

  return (
    <VidyaShell
      crumbs={`COMPETE · CLAN${clan?.name ? ` · ${clan.name.toUpperCase()}` : ""}`}
      title={clan?.name ?? "Clan"}
      subtitle={subtitle}
      actions={
        <Link to="/clans" className="vidya-shell__chip">
          ← All clans
        </Link>
      }
    >
      {error ? (
        <div
          role="alert"
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            marginBottom: "var(--sp-4)",
            background: "var(--bad)",
            color: "var(--paper)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {clan && (
        <>
          <Card padding="md">
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  {clan.description || "No description."}
                </div>
              </div>
              <div>
                {isMember ? (
                  <Button variant="ghost" onClick={leave}>
                    Leave clan
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={join}
                    disabled={clan.memberCount >= clan.memberCap || !authReady}
                  >
                    {clan.memberCount >= clan.memberCap ? "Clan is full" : "Join clan"}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginTop: 16,
              marginBottom: 20,
            }}
          >
            <Card padding="md">
              <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase" }}>
                Members
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
                {clan.memberCount} / {clan.memberCap}
              </div>
            </Card>
            <Card padding="md">
              <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase" }}>
                Visibility
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
                {clan.visibility}
              </div>
            </Card>
            <Card padding="md">
              <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase" }}>
                Founded
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                {new Date(clan.createdAt).toLocaleDateString()}
              </div>
            </Card>
          </div>

          <section aria-label="Members">
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
                Members
              </h2>
              <Tag size="sm" tone="neutral" variant="soft">
                {clan.members.length}
              </Tag>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clan.members.map((m) => (
                <Card key={m.userId} padding="md">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                        {m.role === "OWNER" ? "👑 " : m.role === "OFFICER" ? "⭐ " : ""}
                        {formatUser(m.userId, dir[m.userId])}
                        {m.userId === me && (
                          <span style={{ marginLeft: 8, color: "var(--info)", fontSize: 12 }}>
                            you
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                        Joined {new Date(m.joinedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Tag size="sm" tone="neutral" variant="soft">
                      {m.role}
                    </Tag>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </VidyaShell>
  );
}
