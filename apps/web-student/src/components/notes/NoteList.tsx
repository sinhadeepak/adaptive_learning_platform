import type { NoteSummary } from "../../lib/userNotes-api";

interface Props {
  notes: NoteSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function NoteList({ notes, activeId, onSelect, onCreate, onRename, onDelete }: Props) {
  return (
    <aside className="note-list">
      <button type="button" className="note-list__new" onClick={onCreate}>
        ＋ New note
      </button>
      <ul>
        {notes.map((n) => (
          <li
            key={n.id}
            className={n.id === activeId ? "note-list__item note-list__item--active" : "note-list__item"}
          >
            <button type="button" className="note-list__open" onClick={() => onSelect(n.id)}>
              {n.title || "Untitled note"}
            </button>
            <button
              type="button"
              className="note-list__rename"
              aria-label={`Rename ${n.title}`}
              onClick={() => {
                const next = window.prompt("Rename note", n.title);
                if (next && next.trim()) onRename(n.id, next.trim());
              }}
            >
              ✎
            </button>
            <button
              type="button"
              className="note-list__delete"
              aria-label={`Delete ${n.title}`}
              onClick={() => {
                if (window.confirm(`Delete "${n.title}"? This cannot be undone.`)) onDelete(n.id);
              }}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
