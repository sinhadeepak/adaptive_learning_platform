// F8a — Friends page.
// URL: /friends
//
// Three sections: incoming requests / current friends / add by user id.
// The X-User-Id header is set by nginx based on the validated JWT
// (configured server-side); the SPA just calls /api/v1/social/* normally.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";
import { social } from "../lib/social";
import { useAuth } from "../lib/auth-provider";
import { useUserDirectory, formatUser } from "../lib/user_directory";

interface Friend {
  userId: string;
  acceptedAt: string | null;
}

interface PendingRequest {
  fromUserId: string;
  requestedAt: string;
}

export function Friends() {
  const { user, loading: authLoading } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [addEmail, setAddEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const allIds = useMemo(
    () => [...friends.map((f) => f.userId), ...pending.map((p) => p.fromUserId)],
    [friends, pending],
  );
  const dir = useUserDirectory(allIds);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [f, p] = await Promise.all([
        social.fetch("/api/v1/social/friends"),
        social.fetch("/api/v1/social/friends/pending"),
      ]);
      if (f.ok) {
        const body = (await f.json()) as { items: Friend[] };
        setFriends(body.items);
      }
      if (p.ok) {
        const body = (await p.json()) as { items: PendingRequest[] };
        setPending(body.items);
      }
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }, []);

  // Only load once auth is settled — firing earlier sends a request
  // with no X-User-Id header and the engagement service 401s.
  useEffect(() => {
    if (authLoading || !user) return;
    void load();
  }, [authLoading, user, load]);

  const sendRequest = useCallback(async () => {
    const email = addEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("That doesn't look like a valid email.");
      return;
    }
    setBusy("send");
    setError(null);
    setSuccess(null);
    try {
      const r = await social.fetch("/api/v1/social/friends/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientEmail: email }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const code = body?.detail?.code;
        if (code === "user_not_found") {
          setError(`No student is registered with ${email}.`);
        } else if (code === "self_friend") {
          setError("You can't send yourself a friend request.");
        } else {
          setError(body?.detail?.message ?? `HTTP ${r.status}`);
        }
        return;
      }
      const body = await r.json();
      setSuccess(
        body.alreadyExisted
          ? `You're already ${body.status.toLowerCase()} with this user.`
          : "Friend request sent.",
      );
      setAddEmail("");
      void load();
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [addEmail, load]);

  const accept = useCallback(
    async (otherId: string) => {
      setBusy("accept:" + otherId);
      try {
        const r = await social.fetch(`/api/v1/social/friends/${otherId}/accept`, {
          method: "POST",
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setError(body?.detail?.message ?? `HTTP ${r.status}`);
          return;
        }
        void load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const unfriend = useCallback(
    async (otherId: string) => {
      setBusy("unfriend:" + otherId);
      try {
        await social.fetch(`/api/v1/social/friends/${otherId}`, { method: "DELETE" });
        void load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const block = useCallback(
    async (otherId: string) => {
      setBusy("block:" + otherId);
      try {
        await social.fetch(`/api/v1/social/friends/${otherId}/block`, {
          method: "POST",
        });
        void load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return (
    <AppShell
      title="Friends"
      actions={
        <Link to="/battle" className="pg-btn pg-btn-ghost">
          Battle →
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 880 }}>
        {error && <Banner tone="danger">{error}</Banner>}
        {success && <Banner tone="info">{success}</Banner>}

        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Friends</h1>
            <p className="pg-header-sub">
              Add other students to challenge them to battles and compare
              progress. Add them by the email they registered with.
            </p>
          </div>
        </header>

        <section className="pg-section">
          <h2 className="pg-section-title">Add a friend</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendRequest();
              }}
              placeholder="friend@example.com"
              type="email"
              autoComplete="off"
              style={{ flex: 1, padding: 10, fontSize: 14 }}
            />
            <button
              type="button"
              className="pg-btn pg-btn-primary"
              onClick={sendRequest}
              disabled={busy === "send" || !addEmail.trim()}
            >
              Send request
            </button>
          </div>
        </section>

        <section className="pg-section">
          <h2 className="pg-section-title">
            Incoming requests
            <span className="pg-section-title-sub">
              {pending.length === 0 ? "none" : `${pending.length} pending`}
            </span>
          </h2>
          {pending.length > 0 && (
            <div className="pg-list">
              {pending.map((p) => (
                <div className="pg-row" key={p.fromUserId}>
                  <div className="pg-row-main">
                    <p className="pg-row-title">{formatUser(p.fromUserId, dir[p.fromUserId])}</p>
                    <div className="pg-row-meta">
                      <span>
                        Sent {new Date(p.requestedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pg-btn pg-btn-primary"
                    onClick={() => accept(p.fromUserId)}
                    disabled={busy === "accept:" + p.fromUserId}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="pg-btn pg-btn-ghost"
                    onClick={() => block(p.fromUserId)}
                  >
                    Block
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="pg-section">
          <h2 className="pg-section-title">
            Your friends
            <span className="pg-section-title-sub">
              {friends.length === 0 ? "none yet" : `${friends.length}`}
            </span>
          </h2>
          {friends.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-muted)",
                border: "1px dashed var(--border-subtle)",
                borderRadius: 8,
              }}
            >
              No friends yet. Send a request above.
            </div>
          )}
          {friends.length > 0 && (
            <div className="pg-list">
              {friends.map((f) => (
                <div className="pg-row" key={f.userId}>
                  <div className="pg-row-main">
                    <p className="pg-row-title">{formatUser(f.userId, dir[f.userId])}</p>
                    <div className="pg-row-meta">
                      <span>
                        Since{" "}
                        {f.acceptedAt
                          ? new Date(f.acceptedAt).toLocaleDateString()
                          : "?"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pg-btn pg-btn-ghost"
                    onClick={() => unfriend(f.userId)}
                  >
                    Unfriend
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
