// Vidya v1 redesign — Flashcards: deck library + study mode.

import { useEffect, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface Deck {
  id: string;
  ownerUserId?: string;
  title: string;
  description: string | null;
  topicId: string | null;
  status?: string;
  visibility?: string;
  language: string;
  createdAt: string;
  nCards: number;
  nSubscribers?: number;
  // Phase 3.4 — set on recommended decks: why it's suggested + the topic mastery.
  reason?: string;
  topicEwa?: number;
}

interface DueCard {
  cardId: string;
  deckId: string;
  deckTitle: string;
  frontMd: string;
  backMd: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  dueAt: string;
}

type Tab = "due" | "my" | "community";

export function Flashcards() {
  const [tab, setTab] = useState<Tab>("due");

  const chips = (
    <>
      <button
        type="button"
        className={`vidya-shell__chip${tab === "due" ? " vidya-shell__chip--on" : ""}`}
        onClick={() => setTab("due")}
      >
        Due today
      </button>
      <button
        type="button"
        className={`vidya-shell__chip${tab === "my" ? " vidya-shell__chip--on" : ""}`}
        onClick={() => setTab("my")}
      >
        My decks
      </button>
      <button
        type="button"
        className={`vidya-shell__chip${tab === "community" ? " vidya-shell__chip--on" : ""}`}
        onClick={() => setTab("community")}
      >
        Community decks
      </button>
    </>
  );

  return (
    <VidyaShell
      crumbs="PRACTICE · FLASHCARDS"
      title="Flashcards"
      subtitle="Spaced-repetition review — flip to see the answer, then rate your recall."
      chips={chips}
    >
      <div style={{ maxWidth: 1000 }}>
        {tab === "due" && <DueTab />}
        {tab === "my" && <MyDecksTab />}
        {tab === "community" && <CommunityTab />}
      </div>
    </VidyaShell>
  );
}

function DueTab() {
  const [cards, setCards] = useState<DueCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const r = await auth.fetch(`/api/v1/content/flashcards/due?limit=30`);
    if (r.ok) {
      const body = (await r.json()) as { items: DueCard[] };
      setCards(body.items);
      setIdx(0);
      setRevealed(false);
    }
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(quality: number) {
    if (!cards[idx]) return;
    await auth.fetch(`/api/v1/content/flashcards/${cards[idx].cardId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality }),
    });
    if (idx + 1 < cards.length) {
      setIdx(idx + 1);
      setRevealed(false);
    } else {
      void load();
    }
  }

  if (!loaded) return <p>Loading…</p>;
  if (cards.length === 0) {
    return (
      <p style={{ color: "var(--ink-3)" }}>
        Nothing due! Subscribe to a community deck or create your own.
      </p>
    );
  }
  const c = cards[idx];
  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
        {idx + 1} / {cards.length} · {c.deckTitle}
      </p>
      <div
        style={{
          padding: 24,
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderRadius: 12,
          minHeight: 200,
          fontSize: 18,
          lineHeight: 1.5,
        }}
      >
        <div style={{ whiteSpace: "pre-wrap" }}>{c.frontMd}</div>
        {revealed && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--rule)",
              color: "var(--gold)",
              whiteSpace: "pre-wrap",
            }}
          >
            {c.backMd}
          </div>
        )}
      </div>
      {!revealed ? (
        <button
          type="button"
          className="vidya-shell__primary"
          onClick={() => setRevealed(true)}
          style={{ marginTop: 16 }}
        >
          Show answer
        </button>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          {[
            { q: 0, label: "Again", color: "var(--bad)" },
            { q: 2, label: "Hard", color: "var(--warn)" },
            { q: 4, label: "Good", color: "var(--info)" },
            { q: 5, label: "Easy", color: "var(--good)" },
          ].map((b) => (
            <button
              key={b.q}
              type="button"
              onClick={() => review(b.q)}
              style={{
                padding: "10px 18px",
                background: b.color,
                color: "#fff",
                border: 0,
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MyDecksTab() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newVis, setNewVis] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [importDeck, setImportDeck] = useState<string | null>(null);
  const [importTopic, setImportTopic] = useState("");

  async function load() {
    const r = await auth.fetch(`/api/v1/content/decks`);
    if (r.ok) {
      const body = (await r.json()) as { items: Deck[] };
      setDecks(body.items);
    }
  }

  useEffect(() => {
    void load();
  }, [user]);

  async function create() {
    const r = await auth.fetch(`/api/v1/content/decks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, visibility: newVis }),
    });
    if (r.ok) {
      setNewTitle("");
      setShowNew(false);
      void load();
    }
  }

  async function submitForReview(deckId: string) {
    const r = await auth.fetch(`/api/v1/content/decks/${deckId}/submit-for-review`, {
      method: "POST",
    });
    if (r.ok) {
      alert("Deck sent for moderator review.");
      void load();
    } else {
      const body = await r.json().catch(() => ({} as { detail?: { message?: string } }));
      alert(`Submit failed: ${body.detail?.message ?? r.status}`);
    }
  }

  async function runImport(deckId: string) {
    if (!importTopic.trim()) return;
    const r = await auth.fetch(`/api/v1/content/decks/${deckId}/import-from-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: importTopic.trim(), limit: 20 }),
    });
    if (r.ok) {
      const body = (await r.json()) as { created: number };
      alert(`Imported ${body.created} cards.`);
      setImportDeck(null);
      setImportTopic("");
      void load();
    } else {
      alert(`Import failed (HTTP ${r.status}).`);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="vidya-shell__primary"
        onClick={() => setShowNew((v) => !v)}
        style={{ marginBottom: 12 }}
      >
        {showNew ? "Cancel" : "+ New deck"}
      </button>
      {showNew && (
        <div
          style={{
            padding: 16,
            background: "var(--paper-2)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            marginBottom: 16,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Deck title"
            style={{ flex: 1, minWidth: 200, padding: 8, background: "var(--card)", border: "1px solid var(--rule)", color: "var(--ink)", borderRadius: 6 }}
          />
          <select
            value={newVis}
            onChange={(e) => setNewVis(e.target.value as "PRIVATE" | "PUBLIC")}
            style={{ padding: 8, background: "var(--card)", border: "1px solid var(--rule)", color: "var(--ink)", borderRadius: 6 }}
          >
            <option value="PRIVATE">Private</option>
            <option value="PUBLIC">Public</option>
          </select>
          <button
            type="button"
            className="vidya-shell__primary"
            onClick={create}
            disabled={!newTitle.trim()}
          >
            Create
          </button>
        </div>
      )}
      {decks.length === 0 ? (
        <p style={{ color: "var(--ink-3)" }}>You haven't created any decks yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {decks.map((d) => (
            <li key={d.id} style={deckRowStyle}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {d.nCards} cards · {d.visibility} · {d.status}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setImportDeck(importDeck === d.id ? null : d.id)}
                  className="vidya-shell__chip"
                  style={{ fontSize: 11 }}
                >
                  + Import from questions
                </button>
                {(d.status === "DRAFT" || d.status === "REJECTED") &&
                  d.visibility === "PUBLIC" && (
                    <button
                      type="button"
                      onClick={() => submitForReview(d.id)}
                      className="vidya-shell__primary"
                      style={{ fontSize: 11 }}
                    >
                      Submit for review
                    </button>
                  )}
              </div>
              {importDeck === d.id && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    background: "var(--card)",
                    border: "1px solid var(--rule)",
                    borderRadius: 6,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    placeholder="topicId UUID"
                    value={importTopic}
                    onChange={(e) => setImportTopic(e.target.value)}
                    style={{
                      flex: 1,
                      padding: 6,
                      background: "var(--paper-2)",
                      border: "1px solid var(--rule)",
                      color: "var(--ink)",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  />
                  <button
                    type="button"
                    className="vidya-shell__primary"
                    onClick={() => runImport(d.id)}
                    disabled={!importTopic.trim()}
                  >
                    Import
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecommendedDecks({ onSubscribe }: { onSubscribe: (deckId: string) => void }) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await auth.fetch(`/api/v1/content/decks/recommended`);
      if (alive && r.ok) setDecks(((await r.json()) as { items: Deck[] }).items);
      else if (alive) setDecks([]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!decks || decks.length === 0) return null; // silent when nothing to suggest
  return (
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 4px" }}>Recommended for your weak topics</h3>
      <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 10px" }}>
        Decks on the topics you're currently weakest at — a quick way to start drilling.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {decks.map((d) => (
          <li key={d.id} style={{ ...deckRowStyle, borderColor: "var(--accent, #A78BFA)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{d.title}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {d.nCards} cards · {d.nSubscribers ?? 0} subscriber
                  {d.nSubscribers === 1 ? "" : "s"}
                  {d.reason && (
                    <>
                      {" · "}
                      <span style={{ color: "var(--accent, #A78BFA)", fontWeight: 600 }}>
                        {d.reason}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="vidya-shell__primary"
                onClick={() => onSubscribe(d.id)}
              >
                Subscribe
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommunityTab() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      const params = new URLSearchParams();
      params.set("sort", "popular");
      if (q.trim()) params.set("q", q.trim());
      const r = await auth.fetch(`/api/v1/content/decks/community?${params}`);
      if (alive && r.ok) {
        const body = (await r.json()) as { items: Deck[] };
        setDecks(body.items);
      }
    })();
    return () => {
      alive = false;
    };
  }, [q]);

  async function subscribe(deckId: string) {
    await auth.fetch(`/api/v1/content/decks/${deckId}/subscribe`, { method: "POST" });
    alert("Subscribed! New cards will show in 'Due today'.");
  }

  return (
    <div>
      <RecommendedDecks onSubscribe={subscribe} />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search decks…"
        style={{
          width: "100%",
          maxWidth: 400,
          padding: 8,
          background: "var(--card)",
          border: "1px solid var(--rule)",
          color: "var(--ink)",
          borderRadius: 6,
          marginBottom: 12,
        }}
      />
      {decks.length === 0 ? (
        <p style={{ color: "var(--ink-3)" }}>No published decks yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {decks.map((d) => (
            <li key={d.id} style={deckRowStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {d.nCards} cards · {d.nSubscribers ?? 0} subscriber{d.nSubscribers === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  type="button"
                  className="vidya-shell__primary"
                  onClick={() => subscribe(d.id)}
                >
                  Subscribe
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const deckRowStyle: React.CSSProperties = {
  padding: 12,
  marginBottom: 8,
  background: "var(--paper-2)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
};
