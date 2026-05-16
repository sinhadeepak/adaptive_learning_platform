import type { ReactNode } from "react";

import {
  MCQMultiRenderer,
  MCQSingleRenderer,
  TrueFalseRenderer,
} from "./ObjectiveRenderer";
import {
  FormulaInputRenderer,
  NumericDecimalRenderer,
  NumericIntegerRenderer,
  NumericRangeRenderer,
} from "./NumericRenderer";
import {
  ClassificationRenderer,
  MatchTheFollowingRenderer,
  SequencingRenderer,
} from "./MatchingRenderer";
import {
  ClozePassageRenderer,
  FillBlankMultiRenderer,
  FillBlankSingleRenderer,
  ShortTextRenderer,
} from "./FillInRenderer";
import {
  CaseStudyRenderer,
  ComprehensionLongRenderer,
  DescriptiveLongRenderer,
  EssayRenderer,
} from "./SubjectiveRenderer";
import {
  DiagramHotspotRenderer,
  DiagramLabelRenderer,
  MapLocationRenderer,
  PictorialIdentifyRenderer,
} from "./VisualRenderer";
import {
  ListeningCompRenderer,
  VideoQuestionRenderer,
} from "./AudioVideoRenderer";
import {
  AdaptiveDifficultyRenderer,
  KBCLifelineRenderer,
  TimedRevealRenderer,
} from "./InteractiveRenderer";

// ─────────────────────────────────────────────────────────────────────────
// Per-family renderer dispatcher (P5-S59).
//
// Quiz page uses this to render the right component for a question's
// type_id. The Quiz page owns the value/onChange wiring + submit
// orchestration; this just dispatches.
//
// 29 renderers wired across 8 families. ASSERTION_REASON + MULTI_STATEMENT
// reuse MCQ_SINGLE since they're MCQ-equivalent at the student-facing
// level (the canonical option is derived server-side from the boolean
// flags). The 5 Phase 2 types (LISTENING_COMP, VIDEO_QUESTION,
// KBC_LIFELINE, TIMED_REVEAL, ADAPTIVE_DIFFICULTY) are now un-gated per
// ADR-0026 — full renderers ship below; composite/wrapper grading
// delegates to the inner / child handlers server-side.
// ─────────────────────────────────────────────────────────────────────────

interface RendererDispatchProps {
  typeId: string;
  payload: Record<string, unknown>;
  value: unknown;
  onChange: (v: unknown) => void;
  language?: string;
  disabled?: boolean;
  // Phase 7 — passed through to renderers that accept file uploads.
  // Forwarded from Quiz.tsx; ignored by MCQ/numeric/etc.
  sessionId?: string;
  questionId?: string;
}

export function QuestionRenderer({
  typeId,
  payload,
  value,
  onChange,
  language,
  disabled,
  sessionId,
  questionId,
}: RendererDispatchProps): ReactNode {
  const cast = (Cmp: any) => (
    <Cmp
      payload={payload as any}
      value={value as any}
      onChange={onChange as any}
      language={language}
      disabled={disabled}
      sessionId={sessionId}
      questionId={questionId}
    />
  );

  switch (typeId) {
    // Objective family — ASSERTION_REASON + MULTI_STATEMENT share the
    // MCQ_SINGLE shape (canonical option A..E derived server-side).
    case "MCQ_SINGLE":
    case "ASSERTION_REASON":
    case "MULTI_STATEMENT":
      return cast(MCQSingleRenderer);
    case "MCQ_MULTI":
      return cast(MCQMultiRenderer);
    case "TRUE_FALSE":
      return cast(TrueFalseRenderer);

    // Numeric family
    case "NUMERIC_INTEGER":
      return cast(NumericIntegerRenderer);
    case "NUMERIC_DECIMAL":
      return cast(NumericDecimalRenderer);
    case "NUMERIC_RANGE":
      return cast(NumericRangeRenderer);
    case "FORMULA_INPUT":
      return cast(FormulaInputRenderer);

    // Matching family
    case "MATCH_THE_FOLLOWING":
      return cast(MatchTheFollowingRenderer);
    case "SEQUENCING":
      return cast(SequencingRenderer);
    case "CLASSIFICATION":
      return cast(ClassificationRenderer);

    // Fill-in family
    case "FILL_BLANK_SINGLE":
      return cast(FillBlankSingleRenderer);
    case "FILL_BLANK_MULTI":
      return cast(FillBlankMultiRenderer);
    case "CLOZE_PASSAGE":
      return cast(ClozePassageRenderer);
    case "SHORT_TEXT":
      return cast(ShortTextRenderer);

    // Subjective family
    case "ESSAY":
      return cast(EssayRenderer);
    case "DESCRIPTIVE_LONG":
      return cast(DescriptiveLongRenderer);
    case "CASE_STUDY":
      return cast(CaseStudyRenderer);
    case "COMPREHENSION_LONG":
      return cast(ComprehensionLongRenderer);

    // Visual family
    case "DIAGRAM_HOTSPOT":
      return cast(DiagramHotspotRenderer);
    case "DIAGRAM_LABEL":
      return cast(DiagramLabelRenderer);
    case "MAP_LOCATION":
      return cast(MapLocationRenderer);
    case "PICTORIAL_IDENTIFY":
      return cast(PictorialIdentifyRenderer);

    // Phase 2 families — un-gated per ADR-0026.
    case "LISTENING_COMP":
      return cast(ListeningCompRenderer);
    case "VIDEO_QUESTION":
      return cast(VideoQuestionRenderer);
    case "KBC_LIFELINE":
      return cast(KBCLifelineRenderer);
    case "TIMED_REVEAL":
      return cast(TimedRevealRenderer);
    case "ADAPTIVE_DIFFICULTY":
      return cast(AdaptiveDifficultyRenderer);

    default:
      return (
        <div
          style={{
            padding: 16,
            background: "var(--bad-soft, #fee)",
            color: "var(--bad, #f43f5e)",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          Unknown question type: <code>{typeId}</code>
        </div>
      );
  }
}

export * from "./types";
export * from "./ObjectiveRenderer";
export * from "./NumericRenderer";
export * from "./MatchingRenderer";
export * from "./FillInRenderer";
export * from "./SubjectiveRenderer";
export * from "./VisualRenderer";
export * from "./AudioVideoRenderer";
export * from "./InteractiveRenderer";