// Revision — Vidya v1 redesign.
//
// Daily spaced-repetition queue (SM-2 with EWA tie-in). VidyaShell
// (crumbs + title + subtitle) → vertical list of vidya-card-block
// rows. Each row: topic title + mastery bucket chip + interval/attempt
// meta + overdue badge + Practice-now primary CTA.

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
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
      const { contentLanguageField } = await import("../lib/session-start");
      const langField = await contentLanguageField();
      const r = await auth.fetch(`/api/v1/quiz/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, userId: user.id, mode: "PRACTICE", ...langField }),
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

  function bucketChipStyle(bucket: string): CSSProperties {
    if (bucket === "STRONG") return { background: "var(--good-soft)", color: "var(--good)" };
    if (bucket === "DEVELOPING") return { background: "var(--info-soft)", color: "var(--info)" };
    if (bucket === "WEAK") return { background: "var(--bad-soft)", color: "var(--bad)" };
    return { background: "var(--paper-2)", color: "var(--ink-3)" };
  }

  if (error) {
    return (
      <VidyaShell
        crumbs="PRACTICE · QUICK REVISION"
        title="Daily Revision"
        subtitle="Spaced-repetition queue (SM-2 with EWA tie-in). Topics surface here before mastery decays — even 10 minutes a day counts."
      >
        <div role="alert" style={{
          padding: "var(--sp-3) var(--sp-4)",
          marginBottom: "var(--sp-4)",
          background: "var(--bad)",
          color: "var(--paper)",
          borderRadius: 8,
          fontSize: 13,
        }}>
          {error}
        </div>
      </VidyaShell>
    );
  }

  return (
    <VidyaShell
      crumbs="PRACTICE · QUICK REVISION"
      title="Daily Revision"
      subtitle="Spaced-repetition queue (SM-2 with EWA tie-in). Topics surface here before mastery decays — even 10 minutes a day counts."
    >
      <div style={{ maxWidth: 800 }}>
        {items === null && <p style={{ color: "var(--ink-3)" }}>Loading…</p>}

        {items !== null && items.length === 0 && (
          <section style={{
            textAlign: "center",
            padding: "var(--sp-6) var(--sp-4)",
            background: "var(--card)",
            border: "1px solid var(--rule)",
            borderRadius: 14,
          }}>
            <div style={{ fontSize: 36, marginBottom: "var(--sp-2)" }} aria-hidden>✓</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
              Nothing due today
            </h2>
            <p style={{ margin: "var(--sp-2) auto 0", maxWidth: 460, fontSize: 13, color: "var(--ink-2)" }}>
              Good time to explore a new topic — your spaced-repetition queue is clear.
            </p>
          </section>
        )}

        {items !== null && items.length > 0 && (
          <>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 var(--sp-3)" }}>
              <strong style={{ color: "var(--ink)" }}>{items.length}</strong>{" "}
              {items.length === 1 ? "topic" : "topics"} due for revision today.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {rows.map(({ item, bucket, intervalLabel }) => {
                const bucketStyle = bucketChipStyle(bucket);
                return (
                  <div
                    key={item.topicId}
                    className="vidya-card-block"
                    style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
                        {item.topicTitle || item.topicId.slice(0, 8)}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4, fontSize: 12, color: "var(--ink-2)" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 9999,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            ...bucketStyle,
                          }}
                        >
                          {bucket}
                        </span>
                        {item.priorityReason && (
                          <span
                            title="Why this is near the top of your queue"
                            style={{
                              padding: "2px 8px",
                              borderRadius: 9999,
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                              color: "var(--accent, #A78BFA)",
                              border: "1px solid var(--accent, #A78BFA)",
                            }}
                          >
                            {item.priorityReason}
                          </span>
                        )}
                        <span>Interval {intervalLabel}</span>
                        <span style={{ color: "var(--ink-4)" }}>·</span>
                        <span>attempt {item.attempts}</span>
                        {item.overdueDays > 0 && (
                          <>
                            <span style={{ color: "var(--ink-4)" }}>·</span>
                            <span style={{ color: "var(--bad)", fontWeight: 600 }}>
                              {item.overdueDays}d overdue
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <button
                        type="button"
                        className="vidya-shell__primary"
                        disabled={starting === item.topicId}
                        onClick={() => startTopic(item.topicId)}
                      >
                        {starting === item.topicId ? "Starting…" : "Practice now →"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/capsule/${item.topicId}?title=${encodeURIComponent(item.topicTitle || "")}`,
                          )
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--accent, #A78BFA)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        title="Open a one-page AI summary of this topic"
                      >
                        📄 Revision capsule
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </VidyaShell>
  );
}
