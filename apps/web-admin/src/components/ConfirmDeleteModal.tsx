// Type-the-code confirmation for permanent exam deletion (web-admin /exams).
// Follows the established admin modal convention (see pages/Tenants.tsx):
// a drawer scrim for the overlay + a fixed, self-centering .admin-modal box.
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
    <>
      <div
        className="vidya-drawer__scrim"
        onClick={busy ? undefined : onCancel}
        aria-hidden
      />
      <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Delete exam permanently">
        <header className="admin-modal__head">
          <h2 className="admin-modal__title">Delete exam permanently</h2>
        </header>
        <p>
          This permanently deletes <strong>{examName}</strong> and all of its
          subjects, topics and pools. This cannot be undone.
        </p>
        <div className="admin-modal__form">
          <label className="vidya-auth__field">
            <span className="vidya-auth__field-label">
              Type the exam code <code>{examCode}</code> to confirm
            </span>
            <input
              className="vidya-auth__field-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              disabled={busy}
            />
          </label>
          {error ? (
            <div className="vidya-auth__error" role="alert"><span>{error}</span></div>
          ) : null}
        </div>
        <div className="admin-modal__actions">
          <button type="button" className="admin-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={onConfirm}
            disabled={!matches || busy}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </>
  );
}
