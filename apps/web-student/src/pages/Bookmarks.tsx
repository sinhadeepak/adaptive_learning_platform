import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { SkeletonRows } from "../components/dashboard";

// Vidya v1 redesign
// Saved questions list — server-backed, paginated by recency.
// Mirrors the mobile BookmarksScreen so the student gets the same
// "save and revisit" UX from either surface.

interface BookmarkItem {
  userId: string;
  questionId: string;
  topicId: string | null;
  topicTitle: string | null;
  stem: string | null;
  note: string | null;
  createdAt: string;
}

export function Bookmarks() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<BookmarkItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/profile/bookmarks`);
        if (!r.ok) {
          setError("We couldn't load your saved questions.");
          return;
        }
        const body = (await r.json()) as { items: BookmarkItem[] };
        if (alive) setItems(body.items);
      } catch {
        if (alive) setError("Network error loading bookmarks.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function remove(b: BookmarkItem) {
    setItems((prev) => (prev ?? []).filter((x) => x.questionId !== b.questionId));
    const r = await auth.fetch(`/api/v1/profile/bookmarks/${b.questionId}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      // Restore on failure.
      setItems((prev) => {
        if (!prev) return prev;
        const next = [...prev, b];
        next.sort((a, c) => c.createdAt.localeCompare(a.createdAt));
        return next;
      });
    }
  }

  async function practiceTopic(b: BookmarkItem) {
    if (!user || !b.topicId || starting) return;
    setStarting(b.questionId);
    try {
      const { contentLanguageField } = await import("../lib/session-start");
      const langField = await contentLanguageField();
      const r = await auth.fetch(`/api/v1/quiz/sessions/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId: b.topicId, userId: user.id, mode: "PRACTICE", ...langField }),
      });
      if (!r.ok) return;
      const body = (await r.json()) as { sessionId: string };
      navigate(`/quiz/${body.sessionId}`);
    } finally {
      setStarting(null);
    }
  }

  return (
    <VidyaShell
      crumbs="ME · BOOKMARKS"
      title="Bookmarks"
      subtitle="Saved content — bookmark anything for later review."
    >
      {error ? (
        <div
          role="alert"
          style={{
            background: "var(--paper)",
            border: "1px solid var(--bad)",
            color: "var(--bad)",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: "var(--sp-3)",
          }}
        >
          {error}
        </div>
      ) : null}

      {items === null ? (
        <SkeletonRows count={4} />
      ) : items.length === 0 ? (
        <section
          style={{
            padding: "var(--sp-5)",
            textAlign: "center",
            color: "var(--ink-3)",
            border: "1px dashed var(--rule)",
            borderRadius: 12,
            background: "var(--paper)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>☆</div>
          <div style={{ color: "var(--ink)", fontWeight: 600, marginBottom: 6 }}>
            No saved questions yet
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            After a practice session, tap the ☆ next to any question on the result page
            to save it here for review.
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/practice" className="vidya-shell__primary">Start a practice session</Link>
          </div>
        </section>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {items.map((b) => (
            <li
              key={b.questionId}
              style={{
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: 12,
                padding: "var(--sp-3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {b.topicTitle ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid var(--rule)",
                      background: "var(--paper)",
                      color: "var(--ink)",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    ◈ {b.topicTitle}
                  </span>
                ) : (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid var(--rule)",
                      background: "var(--paper)",
                      color: "var(--ink-3)",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Saved
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {relative(b.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(b)}
                  aria-label="Remove bookmark"
                  title="Remove bookmark"
                  style={{
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    color: "var(--ink-3)",
                    fontSize: 16,
                    padding: 4,
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ marginTop: 8, color: "var(--ink)", lineHeight: 1.4 }}>
                {b.stem ?? <span style={{ fontStyle: "italic", color: "var(--ink-3)" }}>Question (open to practice)</span>}
              </div>
              {b.note ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "var(--card-2)",
                    border: "1px solid var(--rule)",
                    fontSize: 12,
                    color: "var(--ink-3)",
                  }}
                >
                  {b.note}
                </div>
              ) : null}
              {b.topicId ? (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="vidya-shell__chip"
                    onClick={() => practiceTopic(b)}
                    disabled={starting === b.questionId}
                  >
                    {starting === b.questionId ? "Starting…" : "Practice this topic"}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </VidyaShell>
  );
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
