// Friends — Aurora redesign (F8a).
//
// Spec: docs/02-design/redesign/friends.md
// ADR:  docs/adr/0028-design-system-v2-aurora.md (S7 deliverable)
//
// API surface preserved exactly: /api/v1/social/friends (list),
// /api/v1/social/friends/pending (incoming), POST request, POST accept,
// DELETE unfriend, POST block.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Avatar,
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

  const isEmpty = friends.length === 0 && pending.length === 0;

  return (
    <AppShell
      title="Friends"
      actions={
        <Link to="/battle" style={{ textDecoration: "none" }}>
          <Button variant="ghost" size="sm">Battle →</Button>
        </Link>
      }
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {success ? <Banner tone="info">{success}</Banner> : null}

      <header style={{ maxWidth: 880, marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--t-h1-size)",
            lineHeight: "var(--t-h1-line)",
            fontWeight: 700,
            color: "var(--neutral-900)",
          }}
        >
          Friends
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--neutral-600)" }}>
          Add other students to challenge them to battles and compare progress.
        </p>
      </header>

      {/* ── Empty hero — full illustrated EmptyState when nothing to show ── */}
      {isEmpty ? (
        <Card padding="lg" style={{ maxWidth: 880, marginBottom: 20 }}>
          <EmptyState
            illustration={<span aria-hidden style={{ fontSize: 40 }}>👥</span>}
            title="Add friends. Battle. Climb the leaderboard."
            description="Study together — even when you're studying alone. Add a friend by their registered email below."
          />
        </Card>
      ) : null}

      {/* ── "What friends unlock" preview cards (only when empty) ── */}
      {isEmpty ? (
        <section
          aria-label="What friends unlock"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 24,
            maxWidth: 880,
          }}
        >
          <Card padding="md">
            <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden>⚔</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>1v1 Battle</div>
            <div style={{ fontSize: 13, color: "var(--neutral-600)" }}>
              Race through 5 quick questions head-to-head.
            </div>
          </Card>
          <Card padding="md">
            <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden>🎯</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Compare progress</div>
            <div style={{ fontSize: 13, color: "var(--neutral-600)" }}>
              See where you rank vs your friends, week by week.
            </div>
          </Card>
          <Card padding="md">
            <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden>🏆</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Friends leaderboard</div>
            <div style={{ fontSize: 13, color: "var(--neutral-600)" }}>
              Win the week against people you actually know.
            </div>
          </Card>
        </section>
      ) : null}

      {/* ── Add a friend ── */}
      <section
        aria-label="Add a friend"
        style={{ maxWidth: 880, marginBottom: 20 }}
      >
        <Card padding="md">
          <div style={{ fontWeight: 600, color: "var(--neutral-900)", marginBottom: 8 }}>
            Add a friend
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <FormField label="Their registered email">
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="friend@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendRequest();
                  }}
                />
              </FormField>
            </div>
            <Button
              variant="primary"
              loading={busy === "send"}
              onClick={sendRequest}
              disabled={busy === "send" || !addEmail.trim()}
            >
              Send request
            </Button>
          </div>
        </Card>
      </section>

      {/* ── Incoming requests ── */}
      {pending.length > 0 ? (
        <section
          aria-label="Incoming requests"
          style={{ maxWidth: 880, marginBottom: 20 }}
        >
          <SectionHeading
            title="Incoming requests"
            chip={<Tag size="sm" tone="brand" variant="soft">{pending.length}</Tag>}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((p) => (
              <Card key={p.fromUserId} padding="md">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar name={formatUser(p.fromUserId, dir[p.fromUserId])} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--neutral-900)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {formatUser(p.fromUserId, dir[p.fromUserId])}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--neutral-500)" }}>
                      Sent {new Date(p.requestedAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy === "accept:" + p.fromUserId}
                    onClick={() => accept(p.fromUserId)}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => block(p.fromUserId)}
                  >
                    Block
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Your friends ── */}
      {friends.length > 0 ? (
        <section
          aria-label="Your friends"
          style={{ maxWidth: 880, marginBottom: 20 }}
        >
          <SectionHeading
            title="Your friends"
            chip={<Tag size="sm" tone="neutral" variant="soft">{friends.length}</Tag>}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {friends.map((f) => (
              <Card key={f.userId} padding="md">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar
                    name={formatUser(f.userId, dir[f.userId])}
                    size="md"
                    status="offline"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--neutral-900)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {formatUser(f.userId, dir[f.userId])}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--neutral-500)" }}>
                      Since {f.acceptedAt ? new Date(f.acceptedAt).toLocaleDateString() : "?"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unfriend(f.userId)}
                  >
                    Unfriend
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function SectionHeading({
  title,
  chip,
}: {
  title: string;
  chip?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <h2
        style={{
          margin: 0,
          fontSize: "var(--t-h3-size)",
          lineHeight: "var(--t-h3-line)",
          fontWeight: 600,
          color: "var(--neutral-800)",
        }}
      >
        {title}
      </h2>
      {chip}
    </div>
  );
}
