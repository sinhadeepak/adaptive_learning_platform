// Inbox — Vidya v1 redesign.
//
// In-app notification inbox. Sources from notification service:
//   GET /notifications/inbox/{userId}     — list + unreadCount
//   POST /notifications/{id}/read         — mark single
//   POST /notifications/inbox/{userId}/mark-all-read — bulk
// Backend `read_at` is the source of truth so unread state is consistent
// across web + mobile. No localStorage shadow.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { Pill, SkeletonRows } from "../components/dashboard";

interface NotificationItem {
  id: string;
  type: string;
  channel: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export function Inbox() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/notifications/inbox/${user.id}`);
        if (!r.ok) {
          setError("We couldn't load your notifications.");
          return;
        }
        const body = (await r.json()) as {
          items: NotificationItem[];
          unreadCount: number;
        };
        if (!alive) return;
        setItems(body.items);
        setUnread(body.unreadCount);
      } catch {
        if (alive) setError("Network error loading inbox.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  async function markOne(id: string) {
    if (!user) return;
    setItems((prev) =>
      prev ? prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) : prev,
    );
    setUnread((u) => Math.max(0, u - 1));
    await auth.fetch(`/api/v1/notifications/${id}/read?user_id=${user.id}`, {
      method: "POST",
    });
  }

  async function markAll() {
    if (!user || busy) return;
    setBusy(true);
    try {
      await auth.fetch(`/api/v1/notifications/inbox/${user.id}/mark-all-read`, {
        method: "POST",
      });
      setItems((prev) =>
        prev
          ? prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
          : prev,
      );
      setUnread(0);
    } finally {
      setBusy(false);
    }
  }

  const chips = (
    <>
      {(["all", "unread"] as const).map((f) => (
        <button
          key={f}
          type="button"
          className={`vidya-shell__chip${filter === f ? " vidya-shell__chip--on" : ""}`}
          onClick={() => setFilter(f)}
        >
          {f === "unread" ? `Unread${unread > 0 ? ` (${unread})` : ""}` : "All"}
        </button>
      ))}
    </>
  );

  const actions = unread > 0 ? (
    <button
      type="button"
      className="vidya-shell__primary"
      onClick={markAll}
      disabled={busy}
    >
      {busy ? "Marking…" : "Mark all read"}
    </button>
  ) : null;

  return (
    <VidyaShell
      crumbs="ME · INBOX"
      title="Inbox"
      subtitle="Updates, alerts, and reminders."
      chips={chips}
      actions={actions}
    >
      {error ? (
        <div
          role="alert"
          style={{
            background: "var(--bad)",
            color: "var(--paper)",
            padding: "var(--sp-3)",
            borderRadius: "var(--radius-2)",
            margin: "0 0 var(--sp-3) 0",
          }}
        >
          {error}
        </div>
      ) : null}

      {items === null ? (
        <SkeletonRows count={4} />
      ) : (filter === "unread" ? items.filter((n) => n.readAt === null) : items).length === 0 ? (
        <div
          style={{
            padding: "var(--sp-5)",
            textAlign: "center",
            color: "var(--ink-3)",
            border: "1px dashed var(--rule)",
            borderRadius: 12,
            background: "var(--card-1)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>
            {filter === "unread" ? "🎉" : "🔕"}
          </div>
          <div style={{ color: "var(--ink)", fontWeight: 600, marginBottom: 6 }}>
            {filter === "unread"
              ? "All caught up"
              : "No notifications yet"}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            {filter === "unread"
              ? "Nothing unread. Switch to All to revisit older notifications."
              : "Quiz results, streak milestones, and expert replies show up here."}
          </div>
        </div>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {(filter === "unread" ? items.filter((n) => n.readAt === null) : items).map((n) => {
            const isUnread = n.readAt === null;
            const link = derivedLink(n);
            const body = (
              <div
                style={{
                  background: isUnread ? "var(--card-2)" : "var(--card-1)",
                  border: `1px solid ${isUnread ? "var(--info)" : "var(--rule)"}`,
                  borderRadius: 12,
                  padding: "var(--sp-3)",
                  cursor: link ? "pointer" : "default",
                  position: "relative",
                }}
              >
                {isUnread ? (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 14,
                      right: 14,
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: "var(--info)",
                    }}
                  />
                ) : null}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill tone={isUnread ? "info" : "muted"}>{prettyType(n.type)}</Pill>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {relative(n.createdAt)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "var(--ink)",
                    fontSize: 14,
                    lineHeight: 1.45,
                  }}
                >
                  {summary(n)}
                </div>
              </div>
            );
            const onClick = () => {
              if (isUnread) markOne(n.id);
            };
            return (
              <li key={n.id} onClick={onClick}>
                {link ? (
                  <Link to={link} style={{ textDecoration: "none", color: "inherit" }}>
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      )}
    </VidyaShell>
  );
}

function prettyType(t: string): string {
  return t.replace(/^[a-z]+\./i, "").replace(/[._]/g, " ").toUpperCase();
}

function summary(n: NotificationItem): string {
  const p = n.payload;
  if (n.type === "quiz.completed") {
    const score = typeof p["score"] === "number" ? Math.round((p["score"] as number) * 100) : null;
    return score !== null
      ? `Practice session scored — ${score}% accuracy.`
      : "Practice session completed.";
  }
  if (n.type === "streak.milestone") {
    const days = (p["days"] as number) ?? null;
    return days !== null ? `🔥 ${days}-day streak — keep it going!` : "Streak milestone reached.";
  }
  if (n.type === "streak.broken") {
    const prev = (p["previousStreak"] as number) ?? null;
    return prev !== null
      ? `Streak reset — you lost a ${prev}-day run, but you're back. Fresh start today.`
      : "Streak reset — fresh start today.";
  }
  if (n.type === "goal.reached") {
    const goal = (p["goalMinutes"] as number) ?? null;
    return goal !== null ? `✓ Daily goal hit — ${goal} minutes today!` : "Daily goal reached.";
  }
  if (n.type === "mock.completed") {
    const exam = (p["examName"] as string) ?? (p["examCode"] as string) ?? "Mock test";
    const pct = (p["scorePct"] as number) ?? null;
    const rank = (p["projectedRank"] as number) ?? null;
    const parts: string[] = [];
    if (pct !== null) parts.push(`${pct}% accuracy`);
    if (rank) parts.push(`projected AIR ~${rank.toLocaleString()}`);
    return parts.length
      ? `${exam} scored — ${parts.join(" · ")}.`
      : `${exam} scored.`;
  }
  if (n.type === "doubt.answered") {
    return "An expert or AI tutor replied to your doubt.";
  }
  if (n.type === "achievement.unlocked") {
    const kind = (p["kind"] as string) ?? "";
    if (kind.startsWith("streak_")) {
      const days = (p["days"] as number) ?? null;
      return days !== null
        ? `🏆 Achievement: ${days}-day streak`
        : "🏆 Achievement unlocked";
    }
    if (kind === "first_session") return "🎯 Achievement: First session completed";
    if (kind === "daily_goal_first") return "✓ Achievement: First daily goal hit";
    if (kind === "mock_first") return "🎓 Achievement: First mock test completed";
    return `🏆 Achievement unlocked: ${kind.replace(/_/g, " ")}`;
  }
  return n.type.replace(/^[a-z]+\./i, "").replace(/[._]/g, " ");
}

function derivedLink(n: NotificationItem): string | null {
  const p = n.payload;
  if (n.type === "quiz.completed" && typeof p["sessionId"] === "string") {
    return `/quiz/${p["sessionId"]}/result`;
  }
  if (n.type === "doubt.answered" && typeof p["doubtId"] === "string") {
    return `/doubts/${p["doubtId"]}`;
  }
  if (n.type === "mock.completed" && typeof p["attemptId"] === "string") {
    return `/mock/result?attemptId=${p["attemptId"]}`;
  }
  if (n.type === "achievement.unlocked") {
    return "/profile";
  }
  if (
    n.type === "streak.milestone" ||
    n.type === "goal.reached" ||
    n.type === "streak.broken"
  ) {
    return "/home";
  }
  return null;
}

function relative(iso: string): string {
  try {
    const t = new Date(iso);
    const delta = Date.now() - t.getTime();
    const m = Math.floor(delta / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return t.toLocaleDateString();
  } catch {
    return iso;
  }
}
