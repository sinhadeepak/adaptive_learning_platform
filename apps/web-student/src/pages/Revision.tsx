// Sprint 27 (P4-S27) — Daily revision queue view.
//
// Shows the top-N topics due today, ordered most-overdue-first. Sourced
// from /analytics/revision/{userId}; mastery pill resolved from the
// existing /analytics/mastery/{userId} endpoint.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import {
  summariseRevisionList,
  type MasteryLookupRow,
  type RevisionItem,
  type RevisionRow,
} from "../lib/revision_queue";

interface RevisionResp {
  userId: string;
  now: string;
  items: RevisionItem[];
}

interface MasteryListResp {
  userId: string;
  topics: MasteryLookupRow[];
}

export function Revision() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<RevisionItem[] | null>(null);
  const [mastery, setMastery] = useState<MasteryLookupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/revision/${user.id}?limit=10`);
        if (!r.ok) {
          setError("Could not load revision queue.");
          return;
        }
        const body = (await r.json()) as RevisionResp;
        setItems(body.items);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
      if (!r.ok) return;
      const body = (await r.json()) as MasteryListResp;
      setMastery(body.topics);
    })();
  }, [user]);

  const rows: RevisionRow[] = useMemo(
    () => (items ? summariseRevisionList(items, mastery) : []),
    [items, mastery],
  );

  async function startTopic(topicId: string) {
    if (!user || starting) return;
    setStarting(topicId);
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, userId: user.id, mode: "PRACTICE" }),
      });
      if (!r.ok) {
        setError("We couldn't start practice for this topic.");
        return;
      }
      const body = (await r.json()) as { sessionId: string };
      navigate(`/quiz/${body.sessionId}`);
    } finally {
      setStarting(null);
    }
  }

  function bucketColour(bucket: string): string {
    if (bucket === "STRONG") return "var(--color-green, #10C47A)";
    if (bucket === "DEVELOPING") return "var(--color-blue, #4F87F6)";
    if (bucket === "WEAK") return "var(--color-red, #F43F5E)";
    return "var(--text-muted, #7A8BAD)";
  }

  if (error) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p className="banner banner-error">{error}</p>
      </main>
    );
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 800 }}>
      <h1>Daily Revision</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Spaced-repetition queue (SM-2 with EWA tie-in). Topics surface here
        before mastery decays — even 10 minutes a day counts.
      </p>

      {items === null && <p>Loading…</p>}

      {items !== null && items.length === 0 && (
        <section
          style={{
            background: "var(--bg-surface-1, #fff)",
            padding: 32,
            borderRadius: 8,
            marginTop: 24,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 18, margin: 0 }}>
            ✓ Nothing due today — good time to explore a new topic.
          </p>
        </section>
      )}

      {items !== null && items.length > 0 && (
        <>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-muted)",
              marginTop: 16,
            }}
          >
            <strong>{items.length}</strong>{" "}
            {items.length === 1 ? "topic" : "topics"} due for revision today.
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {rows.map(({ item, bucket, intervalLabel }) => (
              <li
                key={item.topicId}
                style={{
                  background: "var(--bg-surface-1, #fff)",
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: 16 }}>
                    {item.topicTitle || item.topicId.slice(0, 8)}
                  </strong>
                  <p
                    style={{
                      margin: "4px 0",
                      fontSize: 13,
                      color: "var(--text-muted)",
                    }}
                  >
                    <span
                      className="pill"
                      style={{
                        padding: "2px 8px",
                        borderRadius: 12,
                        background: bucketColour(bucket),
                        color: "#fff",
                        fontSize: 11,
                        marginRight: 8,
                      }}
                    >
                      {bucket}
                    </span>
                    Interval {intervalLabel} · attempt {item.attempts}
                    {item.overdueDays > 0 && (
                      <>
                        {" "}
                        ·{" "}
                        <span
                          style={{
                            color: "var(--color-red, #F43F5E)",
                            fontWeight: 600,
                          }}
                        >
                          {item.overdueDays}d overdue
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={starting === item.topicId}
                  onClick={() => startTopic(item.topicId)}
                >
                  {starting === item.topicId ? "Starting…" : "Practice now →"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
