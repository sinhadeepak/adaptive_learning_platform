import { useEffect, useRef, useState } from "react";
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
            <NoteEditor
              value={(active.body as ProseMirrorDoc) ?? null}
              onChange={(doc) => scheduleSave({ body: doc })}
            />
          ) : (
            <p className="notes-panel__empty">Create a note to start writing.</p>
          )}
        </div>
      </div>
    </section>
  );
}
