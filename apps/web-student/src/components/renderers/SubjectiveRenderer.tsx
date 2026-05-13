import type { ReactNode } from "react";
import type { Renderer } from "./types";
import { ShortTextRenderer, type ShortTextPayload, type ShortTextResponse } from "./FillInRenderer";
import { UploadField, type UploadedFile } from "../UploadField";

// ─────────────────────────────────────────────────────────────────────────
// Subjective family renderers (P5-S59).
//
// Covers: ESSAY · DESCRIPTIVE_LONG · CASE_STUDY (composite parent) ·
//          COMPREHENSION_LONG (composite parent)
//
// Composite types render the scenario / passage + a list of child
// questions (one of any type). Children render through the dispatcher
// in the parent's onChange.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalise a free-form rubric into `{criteria: [{id, text, weight}, ...]}`.
 *
 * Two shapes show up in stored payloads:
 *   New / canonical: `{criteria: [{id, text, weight}, …]}`
 *   Legacy / seed : `[{criterion, description, weight}, …]`
 * The renderer must tolerate both — until a one-shot migration rewrites
 * every payload, falling through to `.criteria.length` on a raw array
 * crashes the whole quiz page with `Cannot read properties of
 * undefined (reading 'length')`.
 */
function normaliseRubric(
  raw: unknown,
): { criteria: { id: string; text: string; weight: number }[] } {
  if (!raw) return { criteria: [] };
  // Legacy list shape.
  if (Array.isArray(raw)) {
    return {
      criteria: raw.map((c, i) => {
        const obj = (c ?? {}) as Record<string, unknown>;
        return {
          id: String(obj.id ?? obj.criterion ?? `c${i}`),
          text: String(obj.text ?? obj.description ?? obj.criterion ?? ""),
          weight: Number(obj.weight ?? 0),
        };
      }),
    };
  }
  // Canonical object shape.
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as { criteria?: unknown };
    if (Array.isArray(obj.criteria)) {
      return normaliseRubric(obj.criteria);
    }
  }
  return { criteria: [] };
}

export interface EssayPayload {
  stem: string;
  expected_word_count_range: [number, number];
  rubric?: { criteria: { id: string; text: string; weight: number }[] };
  explanation?: string;
}

export interface EssayResponse {
  text: string | null;
  // Phase 7 — same pattern as CaseStudyResponse: ESSAY accepts an
  // attached file/photo as an alternative-or-supplement to typed text.
  attachments?: UploadedFile[];
}

export const EssayRenderer: Renderer<EssayPayload, EssayResponse> = ({
  payload,
  value,
  onChange,
  disabled,
  sessionId,
  questionId,
}): ReactNode => {
  const wordCount =
    (value?.text ?? "").split(/\s+/).filter((w) => w.length > 0).length;

  // Stem is rendered by Quiz.tsx (P7 — single h1 for every type), so
  // payload.stem is dropped here to avoid duplication. The renderer
  // owns the answer-input section + rubric only.
  const range = payload.expected_word_count_range;
  const onTarget = range
    ? wordCount >= range[0] && wordCount <= range[1]
    : true;
  const rubric = normaliseRubric(payload.rubric);
  return (
    <div>
      {rubric.criteria.length > 0 && (
        <details
          style={{
            marginBottom: 14,
            background: "var(--bg-surface3)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
              userSelect: "none",
            }}
          >
            <span aria-hidden style={{ color: "var(--text-faint)" }}>▸</span>
            <span style={{ color: "var(--color-ai)" }}>◈</span>
            Marking rubric ({rubric.criteria.length} criteria)
          </summary>
          <ul
            style={{
              margin: 0,
              padding: "8px 14px 12px 36px",
              fontSize: 12,
              lineHeight: 1.6,
              borderTop: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            {rubric.criteria.map((c) => (
              <li key={c.id}>
                <strong style={{ color: "var(--text-primary)" }}>{c.id}</strong>{" "}
                <span style={{ color: "var(--color-ai)" }}>({c.weight}%)</span>
                <span style={{ color: "var(--text-muted)" }}> — {c.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <textarea
        value={value?.text ?? ""}
        onChange={(e) => {
          const text = e.target.value;
          const atts = value?.attachments ?? [];
          if (text.trim() === "" && atts.length === 0) {
            onChange(null);
          } else {
            onChange({ text: text || null, attachments: atts.length ? atts : undefined });
          }
        }}
        disabled={disabled}
        rows={12}
        placeholder={
          range ? `Aim for ${range[0]}–${range[1]} words` : "Type your answer here"
        }
        style={{
          width: "100%",
          padding: 12,
          background: "var(--bg-surface3)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          fontSize: 14,
          fontFamily: "Georgia, serif",
          lineHeight: 1.6,
          resize: "vertical",
          outline: "none",
        }}
      />
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: onTarget ? "var(--text-muted)" : "var(--color-amber)",
        }}
      >
        {wordCount} word{wordCount === 1 ? "" : "s"}
        {range
          ? ` · target ${range[0]}–${range[1]}${
              wordCount === 0
                ? ""
                : wordCount < range[0]
                  ? " · below target"
                  : wordCount > range[1]
                    ? " · above target"
                    : " · on target"
            }`
          : ""}
      </div>

      {sessionId && questionId && (
        <div style={{ marginTop: 12 }}>
          <UploadField
            kind={{
              kind: "quiz-response",
              sessionId,
              questionId,
              subQuestionId: "main",
            }}
            value={value?.attachments ?? []}
            onChange={(files) => {
              const text = value?.text ?? "";
              const trimmedText = text.trim() === "" ? null : text;
              if (!trimmedText && files.length === 0) {
                onChange(null);
              } else {
                onChange({
                  text: trimmedText,
                  attachments: files.length ? files : undefined,
                });
              }
            }}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
};

export const DescriptiveLongRenderer = EssayRenderer;

// Two payload shapes are seeded today:
//   - Original (from polymorphic_engine): { case_facts, sub_questions:
//     [{id, prompt, expected_word_count_range}], rubric: [{criterion,
//     weight, description}] }
//   - Older "composite parent" shape: { scenario, child_questions: [...] }
// The renderer reads both defensively and renders inline textareas for
// each sub-question — the question stem (carrying parts a/b/c) is
// already rendered by the parent Quiz page, so we focus on the answer
// inputs + rubric.
export interface CaseStudyRubricCriterion {
  criterion: string;
  description?: string;
  weight: number;
}

export interface CaseStudySubQuestion {
  id: string;
  prompt: string;
  expected_word_count_range?: [number, number];
}

export interface CaseStudyPayload {
  // New shape
  case_facts?: string;
  sub_questions?: CaseStudySubQuestion[];
  rubric?: CaseStudyRubricCriterion[];
  // Legacy shape (kept for back-compat)
  scenario?: string;
  child_questions?: { question_id: string; ordinal: number }[];
  explanation?: string;
}

export interface CaseStudyResponse {
  // Map of sub-question id → student's free-text answer.
  answers?: Record<string, string>;
  // Optional uploaded artefacts per sub-question (handwriting photos,
  // PDFs of typed work, etc.). Keyed by sub-question id; empty by
  // default. Survives the same submit cycle as `answers`.
  attachments?: Record<string, UploadedFile[]>;
}

export const CaseStudyRenderer: Renderer<CaseStudyPayload, CaseStudyResponse> = ({
  payload,
  value,
  onChange,
  disabled,
  sessionId,
  questionId,
}): ReactNode => {
  const subQs = payload.sub_questions ?? [];
  const answers = value?.answers ?? {};
  const attachments = value?.attachments ?? {};

  function commit(nextAnswers: Record<string, string>, nextAttachments: Record<string, UploadedFile[]>) {
    const hasAnswers = Object.keys(nextAnswers).length > 0;
    const hasAttachments = Object.values(nextAttachments).some((a) => a.length > 0);
    if (!hasAnswers && !hasAttachments) {
      onChange(null);
      return;
    }
    onChange({
      answers: hasAnswers ? nextAnswers : undefined,
      attachments: hasAttachments ? nextAttachments : undefined,
    });
  }

  function setAnswer(id: string, text: string) {
    const next = { ...answers };
    if (text.trim() === "") delete next[id];
    else next[id] = text;
    commit(next, attachments);
  }

  function setAttachments(id: string, files: UploadedFile[]) {
    const next = { ...attachments };
    if (files.length === 0) delete next[id];
    else next[id] = files;
    commit(answers, next);
  }

  // All styling pulls from the design-system tokens (tokens.css) so the
  // renderer matches the rest of the dark surface — `bg-surface{1..4}`,
  // `text-{primary,muted,faint}`, `border` / `border-strong`. Hard-coded
  // light hexes here previously made the rubric look like a default
  // OS-blue selection bar against the dark page.
  const totalWeight = payload.rubric?.reduce((a, c) => a + c.weight, 0) ?? 0;

  return (
    <div>
      {payload.rubric && payload.rubric.length > 0 && (
        <details
          style={{
            marginBottom: 14,
            background: "var(--bg-surface3)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-secondary)",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
              userSelect: "none",
            }}
          >
            <span aria-hidden style={{ color: "var(--text-faint)" }}>▸</span>
            <span style={{ color: "var(--color-ai)" }}>◈</span>
            Marking rubric — {payload.rubric.length} criteria · weights total{" "}
            {totalWeight}%
          </summary>
          <ul
            style={{
              margin: 0,
              padding: "8px 14px 12px 36px",
              fontSize: 12,
              lineHeight: 1.6,
              borderTop: "1px solid var(--border)",
            }}
          >
            {payload.rubric.map((c, i) => (
              <li key={`${c.criterion}-${i}`} style={{ marginBottom: 4 }}>
                <strong style={{ color: "var(--text-primary)" }}>
                  {c.criterion}
                </strong>{" "}
                <span style={{ color: "var(--color-ai)" }}>({c.weight}%)</span>
                {c.description ? (
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    — {c.description}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      {subQs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {subQs.map((sq, idx) => {
            const text = answers[sq.id] ?? "";
            const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
            const range = sq.expected_word_count_range;
            const onTarget = range
              ? wordCount >= range[0] && wordCount <= range[1]
              : true;
            return (
              <div
                key={sq.id}
                style={{
                  padding: 14,
                  background: "var(--bg-surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  Part {String.fromCharCode(97 + idx)}
                  <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>
                    · {sq.id}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    marginBottom: 10,
                    color: "var(--text-primary)",
                  }}
                >
                  {sq.prompt}
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setAnswer(sq.id, e.target.value)}
                  disabled={disabled}
                  rows={5}
                  style={{
                    width: "100%",
                    padding: 10,
                    background: "var(--bg-surface3)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: "inherit",
                    resize: "vertical",
                    outline: "none",
                  }}
                  placeholder={
                    range
                      ? `Aim for ${range[0]}–${range[1]} words`
                      : "Type your answer here"
                  }
                />
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: onTarget
                      ? "var(--text-muted)"
                      : "var(--color-amber)",
                  }}
                >
                  {wordCount} word{wordCount === 1 ? "" : "s"}
                  {range
                    ? ` · target ${range[0]}–${range[1]}${
                        wordCount === 0
                          ? ""
                          : wordCount < range[0]
                            ? " · below target"
                            : wordCount > range[1]
                              ? " · above target"
                              : " · on target"
                      }`
                    : ""}
                </div>

                {/* Upload affordance: students who'd rather hand-write
                    can photograph their work or upload a PDF. The
                    UploadField soft-fails (no sessionId/questionId)
                    if Quiz.tsx hasn't threaded the context through yet. */}
                {sessionId && questionId && (
                  <div style={{ marginTop: 10 }}>
                    <UploadField
                      kind={{
                        kind: "quiz-response",
                        sessionId,
                        questionId,
                        subQuestionId: sq.id,
                      }}
                      value={attachments[sq.id] ?? []}
                      onChange={(files) => setAttachments(sq.id, files)}
                      disabled={disabled}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <textarea
          value={answers["main"] ?? ""}
          onChange={(e) => setAnswer("main", e.target.value)}
          disabled={disabled}
          rows={6}
          placeholder="Write your answer here"
          style={{
            width: "100%",
            padding: 12,
            background: "var(--bg-surface3)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
          }}
        />
      )}
    </div>
  );
};

export interface ComprehensionLongPayload {
  passage: string;
  // Both field names are accepted: the original Phase-5 schema used
  // `child_questions` keyed by question_id; current seed data carries
  // an inline `sub_questions` array with id + prompt. Either works.
  child_questions?: { question_id: string; ordinal: number }[];
  sub_questions?: { id: string; prompt: string }[];
  explanation?: string;
}

export const ComprehensionLongRenderer: Renderer<
  ComprehensionLongPayload,
  CaseStudyResponse
> = ({ payload, value, onChange, disabled }): ReactNode => {
  const subs = payload.sub_questions ?? [];
  const childCount = payload.child_questions?.length ?? subs.length;
  const answers = (value?.answers ?? {}) as Record<string, string>;

  function setAnswer(id: string, text: string) {
    const nextAnswers = { ...answers, [id]: text };
    if (text === "") delete nextAnswers[id];
    onChange({ answers: nextAnswers });
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Passage</h3>
      <div
        style={{
          padding: 16,
          background: "var(--bg-subtle, #f8f9fc)",
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 14,
          lineHeight: 1.7,
          fontFamily: "Georgia, serif",
          maxHeight: 400,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {payload.passage}
      </div>
      {childCount > 0 && (
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
          Read the passage, then answer the {childCount} sub-
          question{childCount === 1 ? "" : "s"} that follow.
        </div>
      )}
      {subs.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {subs.map((sq, i) => (
            <div key={sq.id}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                ({i + 1}) {sq.prompt}
              </div>
              <textarea
                value={answers[sq.id] ?? ""}
                onChange={(e) => setAnswer(sq.id, e.target.value)}
                disabled={disabled}
                rows={3}
                placeholder="Type your answer…"
                style={{
                  width: "100%",
                  padding: 8,
                  fontSize: 13,
                  fontFamily: "inherit",
                  border: "1px solid var(--border-subtle, #e1e5ee)",
                  borderRadius: 6,
                  resize: "vertical",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Re-export ShortText since it's logically subjective family but
// shares the AI_ASSISTED evaluation path.
export { ShortTextRenderer };
export type { ShortTextPayload, ShortTextResponse };
