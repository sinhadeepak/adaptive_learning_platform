// Phase 1D-8 — Moderator review queue for community decks.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Pill, SkeletonRows } from "../components/primitives";

interface DeckRow {
  id: string;
  ownerUserId: string;
  title: string;
  description: string | null;
  topicId: string | null;
  visibility: string;
  language: string;
  createdAt: string;
  updatedAt: string;
  nCards: number;
}

interface Card {
  id: string;
  frontMd: string;
  backMd: string;
  position: number;
}

export function FlashcardModeration() {
  const [queue, setQueue] = useState<DeckRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [reason, setReason] = useState("");

  async function load() {
    const r = await auth.fetch(`/api/v1/content/decks/review-queue?limit=100`);
    if (r.ok) {
      const body = (await r.json()) as { items: DeckRow[] };
      setQueue(body.items);
    }
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function openDeckPreview(deckId: string) {
    if (openDeck === deckId) {
      setOpenDeck(null);
      setCards([]);
      return;
    }
    const r = await auth.fetch(`/api/v1/content/decks/${deckId}/cards`);
    if (r.ok) {
      const body = (await r.json()) as { items: Card[] };
      setCards(body.items);
      setOpenDeck(deckId);
    }
  }

  async function decide(deckId: string, decision: "APPROVE" | "REJECT") {
    const r = await auth.fetch(`/api/v1/content/decks/${deckId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason: reason.trim() || null }),
    });
    if (r.ok) {
      setReason("");
      setOpenDeck(null);
      void load();
    } else {
      alert(`Failed: HTTP ${r.status}`);
    }
  }

  return (
    <AppShell title="Flashcard moderation">
      <main className="page" style={{ padding: 24, maxWidth: 1100 }}>
        <Link to="/teacher/dashboard" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          ← Back to dashboard
        </Link>
        <h1 style={{ marginTop: 8 }}>Deck review queue</h1>
        {!loaded && <SkeletonRows count={3} />}
        {loaded && queue.length === 0 && (
          <p style={{ color: "var(--ink-3)" }}>Queue is empty — no decks awaiting review.</p>
        )}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {queue.map((d) => (
            <li
              key={d.id}
              style={{
                padding: 12,
                background: "var(--card-1)",
                border: "1px solid var(--rule)",
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {d.nCards} cards · <Pill tone="info">{d.visibility}</Pill> · owner{" "}
                    <code>{d.ownerUserId.slice(0, 8)}</code> · submitted{" "}
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </div>
                  {d.description && (
                    <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
                      {d.description}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openDeckPreview(d.id)}
                  style={{
                    background: "var(--card-1)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink)",
                    padding: "6px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {openDeck === d.id ? "Hide" : "Preview"}
                </button>
                <button
                  type="button"
                  onClick={() => decide(d.id, "APPROVE")}
                  style={btnApprove}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decide(d.id, "REJECT")}
                  style={btnReject}
                >
                  Reject
                </button>
              </div>
              {openDeck === d.id && (
                <div style={{ marginTop: 12 }}>
                  <input
                    type="text"
                    placeholder="Optional reason (sent in audit log)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      background: "var(--card)",
                      border: "1px solid var(--rule)",
                      color: "var(--ink)",
                      borderRadius: 6,
                      marginBottom: 8,
                    }}
                  />
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {cards.slice(0, 20).map((c) => (
                      <li
                        key={c.id}
                        style={{
                          padding: 10,
                          marginBottom: 6,
                          background: "var(--card)",
                          border: "1px solid var(--rule)",
                          borderRadius: 6,
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>Q. {c.frontMd}</div>
                        <div style={{ marginTop: 4, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
                          A. {c.backMd}
                        </div>
                      </li>
                    ))}
                    {cards.length > 20 && (
                      <li style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        … {cards.length - 20} more cards
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </main>
    </AppShell>
  );
}

const btnApprove: React.CSSProperties = {
  background: "var(--good)",
  color: "#000",
  border: 0,
  padding: "6px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const btnReject: React.CSSProperties = {
  background: "var(--bad)",
  color: "#fff",
  border: 0,
  padding: "6px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};