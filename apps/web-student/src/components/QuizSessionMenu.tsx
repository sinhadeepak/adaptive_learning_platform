// QuizSessionMenu — mobile bottom-sheet for in-quiz actions (P6 S51).
//
// On the desktop quiz player the "End quiz" / "Bookmark" / "Adjust
// difficulty" controls are inline in the session bar + footer. On
// mobile (< 640 px) those collapse into this sheet so the question
// stays question-first.
//
// Closed by clicking the scrim, pressing Escape, or tapping any of
// the actions. Caller owns each action's behaviour.

import { useEffect } from "react";

export interface QuizSessionMenuProps {
  open: boolean;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onAdjustDifficulty: () => void;
  onEndQuiz: () => void;
}

export function QuizSessionMenu({
  open,
  onClose,
  isBookmarked,
  onToggleBookmark,
  onAdjustDifficulty,
  onEndQuiz,
}: QuizSessionMenuProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handle(action: () => void) {
    action();
    onClose();
  }

  return (
    <div
      className="qsm-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Quiz session menu"
      onClick={onClose}
    >
      <div
        className="qsm-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qsm-handle" aria-hidden />
        <div className="qsm-header">
          <div className="qsm-title">Session</div>
          <div className="qsm-sub">Adjust the session or wrap it up.</div>
        </div>
        <ul className="qsm-list">
          <li>
            <button
              type="button"
              className="qsm-row"
              onClick={() => handle(onAdjustDifficulty)}
            >
              <span className="qsm-glyph">▲▼</span>
              <span className="qsm-label">Adjust difficulty</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="qsm-row"
              onClick={() => handle(onToggleBookmark)}
            >
              <span className="qsm-glyph">🔖</span>
              <span className="qsm-label">
                {isBookmarked ? "Remove bookmark" : "Bookmark question"}
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="qsm-row qsm-row-destructive"
              onClick={() => handle(onEndQuiz)}
            >
              <span className="qsm-glyph">⏹</span>
              <span className="qsm-label">End quiz</span>
            </button>
          </li>
        </ul>
        <button type="button" className="qsm-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
