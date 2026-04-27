import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";

// Light unread-count poller for the topbar. Refreshes once on mount and
// every 60s afterwards. Stays silent when the user is not signed in.
const POLL_MS = 60_000;

export function InboxBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (!alive || !user) return;
      try {
        const r = await auth.fetch(
          `/api/v1/notifications/inbox/${user.id}/unread-count`,
        );
        if (!r.ok) return;
        const body = (await r.json()) as { unreadCount: number };
        if (alive) setUnread(body.unreadCount ?? 0);
      } catch {
        /* swallow — poller retries next interval */
      } finally {
        if (alive) timer = setTimeout(tick, POLL_MS);
      }
    }
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  if (!user) return null;
  return (
    <Link
      to="/inbox"
      aria-label={unread > 0 ? `${unread} unread notifications` : "Inbox"}
      title={unread > 0 ? `${unread} unread` : "Inbox"}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        borderRadius: 999,
        background: "var(--bg-surface-2)",
        border: "1px solid var(--border-default)",
        color: "var(--text-primary)",
        textDecoration: "none",
        fontSize: 16,
        marginLeft: 8,
      }}
    >
      🔔
      {unread > 0 ? (
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: "var(--color-red, #ef4444)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            minWidth: 18,
            height: 18,
            borderRadius: 999,
            padding: "0 5px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--bg-base, #0f172a)",
          }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
