// QuizPlayer — shared question body for the quiz player (Phase 6 S51).
//
// Extracted from `apps/web-student/src/pages/Quiz.tsx`. Renders the
// question stem + per-type input (polymorphic dispatcher for non-MCQ
// types, lettered options for MCQ_SINGLE) + the post-answer feedback
// panel.
//
// Desktop and mobile share THIS component. The wrapping page chrome
// (session bar, progress strip, AI context bar, right panel, footer)
// is owned by Quiz.tsx and varies per viewport.

import { QuestionRenderer } from "./renderers";
import { RendererErrorBoundary } from "./RendererErrorBoundary";

export interface QuizPlayerItem {
  itemIdx: number;
  questionId: string;
  stem: string;
  choices: string[];
  questionType?: string;
  payload?: Record<string, unknown>;
}

export interface QuizPlayerVerdict {
  itemIdx: number;
  isCorrect: boolean;
  correctIdx: number;
}

export interface QuizPlayerProps {
  item: QuizPlayerItem;
  selectedIdx: number | null;
  onSelectChoice: (idx: number) => void;
  responsePayload: unknown;
  onChangeResponse: (value: unknown) => void;
  verdict: QuizPlayerVerdict | null;
  /** Header counter, e.g. "QUESTION 3 OF 10". */
  questionNumber: number;
  totalQuestions: number;
  sessionId?: string;
  /** Renderer language (passed through to QuestionRenderer). */
  language?: string;
  /** Caller-rendered hint chip (null = hidden). */
  hintNote: string | null;
  onDismissHint: () => void;
  /** Called when the polymorphic renderer asks to skip the item. */
  onSkip: () => void;
  /** Optional post-feedback AI summary slot (desktop renders this
   *  full; mobile renders a condensed one or hides it). */
  feedbackPanel?: React.ReactNode;
}

export function QuizPlayer({
  item,
  selectedIdx,
  onSelectChoice,
  responsePayload,
  onChangeResponse,
  verdict,
  questionNumber,
  totalQuestions,
  sessionId,
  language = "en",
  hintNote,
  onDismissHint,
  onSkip,
  feedbackPanel,
}: QuizPlayerProps) {
  const showFeedback = verdict !== null;
  const isLegacyMcq = !item.questionType || item.questionType === "MCQ_SINGLE";

  return (
    <main className="q-area">
      <div>
        <div className="q-num">
          <span>
            QUESTION {questionNumber} OF {totalQuestions}
          </span>
          <span className="ai-sel-badge">◈ AI-SELECTED · IRT-driven</span>
        </div>
        {/* Stem is the question text — always rendered, regardless of
            type. Per-type renderers below handle the *answer input*. */}
        <h1 className="q-text">{item.stem}</h1>
        {hintNote && (
          <div
            role="status"
            className="hint-chip"
          >
            <span>💡 {hintNote}</span>
            <button
              type="button"
              onClick={onDismissHint}
              className="hint-chip-close"
              aria-label="Dismiss hint"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* P5-S60 — non-MCQ types go through the polymorphic dispatcher. */}
      {!isLegacyMcq ? (
        <div style={{ marginTop: 8 }}>
          <RendererErrorBoundary
            resetKey={`${item.questionId}:${item.itemIdx}`}
            onSkip={onSkip}
          >
            <QuestionRenderer
              typeId={item.questionType!}
              payload={item.payload ?? {}}
              value={responsePayload}
              onChange={onChangeResponse}
              language={language}
              disabled={showFeedback}
              sessionId={sessionId}
              questionId={item.questionId}
            />
          </RendererErrorBoundary>
        </div>
      ) : (
        <ol className="options" role="radiogroup" aria-label="Answer choices">
          {item.choices.map((choice, idx) => {
            const isSelected = selectedIdx === idx;
            const isCorrectAnswer = showFeedback && idx === verdict!.correctIdx;
            const isWrongPick =
              showFeedback && idx === selectedIdx && !verdict!.isCorrect;
            let variant = "";
            if (isCorrectAnswer) variant = "opt-correct";
            else if (isWrongPick) variant = "opt-wrong";
            else if (isSelected) variant = "opt-selected";
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => !showFeedback && onSelectChoice(idx)}
                  disabled={showFeedback}
                  className={`opt ${variant}`.trim()}
                  aria-pressed={isSelected}
                >
                  <div className="opt-key">{String.fromCharCode(65 + idx)}</div>
                  <div className="opt-text">{choice}</div>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {showFeedback ? (
        <>
          <div
            role="status"
            className={`explanation ${verdict!.isCorrect ? "" : "explanation-wrong"}`.trim()}
          >
            <div className="exp-title">
              {verdict!.isCorrect ? "✓ Correct" : "✗ Not quite"}
            </div>
            <p className="exp-text">
              {verdict!.isCorrect
                ? "Nice — that's right. Per-question explanations from the content library land in a future sprint."
                : isLegacyMcq && verdict!.correctIdx >= 0
                ? `The correct answer is ${String.fromCharCode(65 + verdict!.correctIdx)}. Per-question explanations from the content library land in a future sprint.`
                : "That's not quite right — review the explanation, then try a similar question. Per-item solutions ship in a future sprint."}
            </p>
          </div>
          {feedbackPanel}
        </>
      ) : null}
    </main>
  );
}
