// Type-the-code confirmation for permanent exam deletion (web-admin /exams).
import { useState } from "react";

interface Props {
  examName: string;
  examCode: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  examName, examCode, busy = false, error = null, onConfirm, onCancel,
}: Props) {
  const [typed, setTyped] = useState("");
  const matches = typed === examCode;

  return (
    <div className="admin-modal__backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal">
        <h2 className="admin-modal__title">Delete exam permanently</h2>
        <p className="admin-modal__body">
          This permanently deletes <strong>{examName}</strong> and all of its
          subjects, topics and pools. This cannot be undone.
        </p>
        <label className="admin-modal__label" htmlFor="confirm-code">
          Type the exam code <code>{examCode}</code> to confirm:
        </label>
        <input
          id="confirm-code"
          className="admin-modal__input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          disabled={busy}
        />
        {error ? (
          <div className="vidya-auth__error" role="alert"><span>{error}</span></div>
        ) : null}
        <div className="admin-modal__actions">
          <button className="admin-btn admin-btn--link" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="admin-btn admin-btn--danger"
            onClick={onConfirm}
            disabled={!matches || busy}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
