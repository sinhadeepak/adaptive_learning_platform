import { useEffect, useRef, useState } from "react";
import { auth } from "../../lib/api";
import { NoteList } from "./NoteList";
import { NoteEditor } from "./NoteEditor";
import { userNotes, type Note, type NoteSummary } from "../../lib/userNotes-api";
import type { ProseMirrorDoc } from "../../lib/noteDoc";

type SaveState = "idle" | "saving" | "saved" | "error";

export function NotesPanel({ examId }: { examId: string }) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<Note | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshList = async () => setNotes(await userNotes.list(examId));

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await userNotes.list(examId);
      if (!alive) return;
      setNotes(list);
      if (list.length && !activeId) setActiveId(list[0].id);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => {
    if (!activeId) {
      setActive(null);
      return;
    }
    let alive = true;
    (async () => {
      const n = await userNotes.get(activeId);
      if (alive) setActive(n);
    })();
    return () => {
      alive = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setSave("idle");
    };
  }, [activeId]);

  const scheduleSave = (patch: { title?: string; body?: ProseMirrorDoc }) => {
    if (!activeId) return;
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await userNotes.update(activeId, patch as { title?: string; body?: Record<string, unknown> });
        setSave("saved");
        void refreshList();
      } catch {
        setSave("error");
      }
    }, 1000);
  };

  const create = async () => {
    const n = await userNotes.create(examId);
    await refreshList();
    setActiveId(n.id);
  };
  const rename = async (id: string, title: string) => {
    await userNotes.update(id, { title });
    await refreshList();
    if (id === activeId) setActive((a) => (a ? { ...a, title } : a));
  };
  const remove = async (id: string) => {
    await userNotes.remove(id);
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    if (id === activeId) setActiveId(next[0]?.id ?? null);
  };

  return (
    <section className="notes-panel">
      <div className="notes-panel__head">
        <h2>My Notes</h2>
        <span className="notes-panel__status">
          {save === "saving" ? "Saving…" : save === "saved" ? "Saved ✓"
            : save === "error" ? "Couldn't save — retrying" : ""}
        </span>
      </div>
      <div className="notes-panel__body">
        <NoteList
          notes={notes}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={create}
          onRename={rename}
          onDelete={remove}
        />
        <div className="notes-panel__editor">
          {active ? (
            <>
              <NoteEditor
                value={(active.body as ProseMirrorDoc) ?? null}
                onChange={(doc) => scheduleSave({ body: doc })}
              />
              <NoteFlashcardMaker noteId={active.id} noteTitle={active.title} />
            </>
          ) : (
            <p className="notes-panel__empty">Create a note to start writing.</p>
          )}
        </div>
      </div>
    </section>
  );
}

// Phase 3.6 — "Make flashcards from this note": AI proposes Q/A pairs the
// student reviews, then saves into a new private deck (existing deck/card APIs).
interface Proposal {
  front: string;
  back: string;
  keep: boolean;
}

function NoteFlashcardMaker({ noteId, noteTitle }: { noteId: string; noteTitle: string }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setMsg(null);
    setProposals(null);
    try {
      const r = await auth.fetch(`/api/v1/content/notes/${noteId}/suggest-flashcards`, {
        method: "POST",
      });
      if (r.status === 409) {
        setMsg("Add a bit more to this note first — there isn't enough to make cards.");
        return;
      }
      if (!r.ok) {
        setMsg("Couldn't generate cards right now.");
        return;
      }
      const body = (await r.json()) as { cards: { front: string; back: string }[] };
      setProposals(body.cards.map((c) => ({ ...c, keep: true })));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDeck() {
    if (!proposals) return;
    const kept = proposals.filter((p) => p.keep);
    if (kept.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const dr = await auth.fetch(`/api/v1/content/decks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `From note: ${noteTitle || "Untitled"}`.slice(0, 200),
          visibility: "PRIVATE",
        }),
      });
      if (!dr.ok) {
        setMsg("Couldn't create the deck.");
        return;
      }
      const deck = (await dr.json()) as { id: string };
      let ok = 0;
      for (let i = 0; i < kept.length; i++) {
        const cr = await auth.fetch(`/api/v1/content/decks/${deck.id}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frontMd: kept[i].front, backMd: kept[i].back, position: i }),
        });
        if (cr.ok) ok++;
      }
      setProposals(null);
      setMsg(`Saved ${ok} card${ok === 1 ? "" : "s"} to a new deck — find it under Flashcards → My decks.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const keptCount = proposals?.filter((p) => p.keep).length ?? 0;

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={suggest}
          disabled={busy}
          style={{
            background: "transparent",
            border: "1px solid var(--accent, #A78BFA)",
            color: "var(--accent, #A78BFA)",
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
          }}
          title="Let AI turn this note into review flashcards"
        >
          {busy && !proposals ? "Thinking…" : "✨ Make flashcards"}
        </button>
        {msg && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{msg}</span>}
      </div>

      {proposals && proposals.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {proposals.map((p, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  padding: 8,
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  opacity: p.keep ? 1 : 0.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={p.keep}
                  onChange={(e) =>
                    setProposals((prev) =>
                      prev ? prev.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)) : prev,
                    )
                  }
                  style={{ marginTop: 3 }}
                />
                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{p.front}</div>
                  <div style={{ color: "var(--ink-2)" }}>{p.back}</div>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="vidya-shell__primary"
            onClick={saveDeck}
            disabled={busy || keptCount === 0}
            style={{ marginTop: 8 }}
          >
            {busy ? "Saving…" : `Save ${keptCount} card${keptCount === 1 ? "" : "s"} to a new deck`}
          </button>
        </div>
      )}
    </div>
  );
}
