// F8b — Single clan detail.
// URL: /clans/:clanId

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";
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

  return (
    <AppShell
      title="Clan"
      actions={
        <Link to="/clans" className="pg-btn pg-btn-ghost">
          ← All clans
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 880 }}>
        {error && <Banner tone="danger">{error}</Banner>}
        {clan && (
          <>
            <header className="pg-header">
              <div className="pg-header-main">
                <h1 className="pg-header-title">{clan.name}</h1>
                <p className="pg-header-sub">
                  {clan.description || "No description."}
                </p>
              </div>
              <div>
                {isMember ? (
                  <button
                    type="button"
                    className="pg-btn pg-btn-ghost"
                    onClick={leave}
                  >
                    Leave clan
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pg-btn pg-btn-primary"
                    onClick={join}
                    disabled={clan.memberCount >= clan.memberCap || !authReady}
                  >
                    {clan.memberCount >= clan.memberCap ? "Clan is full" : "Join clan"}
                  </button>
                )}
              </div>
            </header>

            <div className="pg-stat-strip">
              <div className="pg-stat">
                <div className="pg-stat-label">Members</div>
                <div className="pg-stat-value">
                  {clan.memberCount} / {clan.memberCap}
                </div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Visibility</div>
                <div className="pg-stat-value" style={{ fontSize: 16 }}>
                  {clan.visibility}
                </div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Founded</div>
                <div className="pg-stat-value" style={{ fontSize: 14 }}>
                  {new Date(clan.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            <section className="pg-section">
              <h2 className="pg-section-title">Members</h2>
              <div className="pg-list">
                {clan.members.map((m) => (
                  <div className="pg-row" key={m.userId}>
                    <div className="pg-row-main">
                      <p className="pg-row-title">
                        {m.role === "OWNER" ? "👑 " : m.role === "OFFICER" ? "⭐ " : ""}
                        {formatUser(m.userId, dir[m.userId])}
                        {m.userId === me && (
                          <span style={{ marginLeft: 8, color: "var(--color-blue)", fontSize: 12 }}>
                            you
                          </span>
                        )}
                      </p>
                      <div className="pg-row-meta">
                        <span>{m.role}</span>
                        <span className="pg-row-meta-dot">·</span>
                        <span>
                          Joined {new Date(m.joinedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
