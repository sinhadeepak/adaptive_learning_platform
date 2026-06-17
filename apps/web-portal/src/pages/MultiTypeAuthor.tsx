import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import { AIDraftPanel, AI_DRAFT_SUPPORTED_TYPES } from "../components/AIDraftPanel";
import { BulkAIGenerator } from "../components/BulkAIGenerator";
import { ConceptTagger, type ConceptTag } from "../components/ConceptTagger";
import { RubricEditor, type RubricCriterion } from "../components/RubricEditor";
import {
  DiagramAuthoringCanvas,
  type Marker,
  type Shape,
} from "../components/DiagramAuthoringCanvas";
import { types, type TypeMeta, aiAuthoring } from "../lib/phase5-api";
import {
  catalog,
  content,
  type CatalogExam,
  type CatalogSubject,
  type CatalogTopic,
} from "../lib/api";

// ─────────────────────────────────────────────────────────────────────────
// Multi-type Question Author (P5-S58, closes the page-level integration
// gap from Cluster B audit).
//
// Composes all four S55 components (AIDraftPanel, ConceptTagger,
// RubricEditor, DiagramAuthoringCanvas) into a single authoring flow
// that adapts to the chosen question type.
//
// v1 supports authoring fields for the families that have working
// student renderers + backend graders:
//   - Objective (MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, ASSERTION_REASON,
//                MULTI_STATEMENT)        → text fields + AI draft
//   - Numeric  (NUMERIC_INTEGER, _DECIMAL, _RANGE, FORMULA_INPUT)
//                                         → text fields + AI draft
//   - Subjective (ESSAY, DESCRIPTIVE_LONG, COMPREHENSION_LONG)
//                                         → RubricEditor
//   - Visual  (DIAGRAM_HOTSPOT, _LABEL, MAP_LOCATION, PICTORIAL_IDENTIFY)
//                                         → DiagramAuthoringCanvas
//
// Per ADR-0026 (2026-05-11) — CASE_STUDY now ships as inline
// sub-questions authoring; Audio/Video (LISTENING_COMP, VIDEO_QUESTION)
// + Interactive (KBC_LIFELINE, TIMED_REVEAL, ADAPTIVE_DIFFICULTY) are
// un-gated with full authoring forms. All 29 types are creatable
// end-to-end.
// ─────────────────────────────────────────────────────────────────────────

type Family = "Objective" | "Numeric" | "Matching" | "Fill-in" | "Subjective" | "Visual & Spatial" | "Audio/Video" | "Interactive";

interface QualityWarning {
  code: string;
  severity: string;
  message: string;
  field?: string | null;
}

export function MultiTypeAuthor() {
  const navigate = useNavigate();

  // Type registry
  const [allTypes, setAllTypes] = useState<TypeMeta[]>([]);
  const [typeId, setTypeId] = useState("MCQ_SINGLE");
  const [registryError, setRegistryError] = useState<string | null>(null);

  // Topic cascade — Exam → Subject → Topic. Same shape as NewQuestion
  // so the catalog scope (educator's assigned exams + subjects)
  // governs what authors can create against.
  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [topics, setTopics] = useState<CatalogTopic[]>([]);
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [scopeError, setScopeError] = useState<string | null>(null);

  // Common fields
  const [stem, setStem] = useState("");
  const [explanation, setExplanation] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [tags, setTags] = useState<ConceptTag[]>([]);

  // Objective-family fields
  const [options, setOptions] = useState<{ id: string; text: string; is_correct: boolean }[]>([
    { id: "A", text: "", is_correct: false },
    { id: "B", text: "", is_correct: false },
    { id: "C", text: "", is_correct: false },
    { id: "D", text: "", is_correct: false },
  ]);

  // Subjective-family fields
  const [rubric, setRubric] = useState<RubricCriterion[]>([]);
  const [modelAnswer, setModelAnswer] = useState("");
  const [expectedWordRange, setExpectedWordRange] = useState<[number, number]>([100, 300]);

  // Visual-family fields
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);

  // Numeric-family fields
  const [numericAnswer, setNumericAnswer] = useState("");
  const [numericTolerance, setNumericTolerance] = useState("0");
  const [numericUnit, setNumericUnit] = useState("");
  const [numericRangeLow, setNumericRangeLow] = useState("");
  const [numericRangeHigh, setNumericRangeHigh] = useState("");
  const [formulaExpr, setFormulaExpr] = useState("");

  // Matching-family fields
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>([
    { left: "", right: "" },
    { left: "", right: "" },
  ]);
  const [sequenceItems, setSequenceItems] = useState<string[]>(["", "", ""]);
  const [classifyCategories, setClassifyCategories] = useState<string[]>(["", ""]);
  const [classifyItems, setClassifyItems] = useState<{ text: string; category: string }[]>([
    { text: "", category: "" },
  ]);

  // Fill-in-family fields
  const [fillTemplate, setFillTemplate] = useState("");
  const [fillAccepted, setFillAccepted] = useState<string[]>([""]);

  // Subjective composite (CASE_STUDY) — per ADR-0026 we ship inline
  // sub-question authoring so the type is fully creatable end-to-end.
  const [caseFacts, setCaseFacts] = useState("");
  const [subQuestions, setSubQuestions] = useState<
    { id: string; prompt: string; min_words: number; max_words: number }[]
  >([
    { id: "a", prompt: "", min_words: 50, max_words: 150 },
  ]);

  // Phase 2 — Audio/Video (LISTENING_COMP, VIDEO_QUESTION)
  const [avMediaId, setAvMediaId] = useState("");
  const [avTranscript, setAvTranscript] = useState("");
  const [avTranscriptLang, setAvTranscriptLang] = useState("en");
  const [avChildren, setAvChildren] = useState<
    { question_id: string; ordinal: number; timestamp_seconds?: number }[]
  >([{ question_id: "", ordinal: 1 }]);

  // Phase 2 — Interactive (KBC_LIFELINE, TIMED_REVEAL, ADAPTIVE_DIFFICULTY)
  const [innerQuestionId, setInnerQuestionId] = useState("");
  const [kbcLifelines, setKbcLifelines] = useState<{
    fifty_fifty: boolean;
    audience_poll: boolean;
    phone_a_friend: boolean;
  }>({ fifty_fifty: true, audience_poll: false, phone_a_friend: false });
  const [audiencePollDist, setAudiencePollDist] = useState<
    Record<string, number>
  >({ A: 60, B: 20, C: 10, D: 10 });
  const [initialStem, setInitialStem] = useState("");
  const [revealSteps, setRevealSteps] = useState<
    { at_seconds: number; additional_info: string }[]
  >([{ at_seconds: 10, additional_info: "" }]);
  const [revealsMakeEasier, setRevealsMakeEasier] = useState(true);
  const [difficultyVariants, setDifficultyVariants] = useState<
    { question_id: string; difficulty_level: number }[]
  >([
    { question_id: "", difficulty_level: 1 },
    { question_id: "", difficulty_level: 3 },
  ]);
  const [startingDifficulty, setStartingDifficulty] = useState(2);

  // Quality + lifecycle
  const [warnings, setWarnings] = useState<QualityWarning[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiOrigin, setAiOrigin] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await types.list();
        setAllTypes(list);
      } catch (e) {
        setRegistryError(
          e instanceof Error ? e.message : "Couldn't load type registry",
        );
      }
    })();
  }, []);

  // Cascade: load assigned exams once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.myExams();
        if (!cancelled) setExams(list);
      } catch (e) {
        if (!cancelled) {
          setScopeError(
            e instanceof Error ? e.message : "Couldn't load exam assignments.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cascade: when exam changes, reload subjects + reset downstream.
  useEffect(() => {
    if (!examId) {
      setSubjects([]);
      setSubjectId("");
      setTopics([]);
      setTopicId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.mySubjects(examId);
        if (cancelled) return;
        setSubjects(list);
        setSubjectId("");
        setTopics([]);
        setTopicId("");
      } catch (e) {
        if (!cancelled) {
          setScopeError(
            e instanceof Error ? e.message : "Couldn't load subjects.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  // Cascade: when subject changes, reload topics.
  useEffect(() => {
    if (!subjectId) {
      setTopics([]);
      setTopicId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.topics(subjectId);
        if (cancelled) return;
        setTopics(list);
        setTopicId("");
      } catch (e) {
        if (!cancelled) {
          setScopeError(
            e instanceof Error ? e.message : "Couldn't load topics.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const meta = allTypes.find((t) => t.type_id === typeId);
  const family = (meta?.family ?? "Objective") as Family;

  function setOptionField(idx: number, patch: Partial<typeof options[number]>) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }

  async function runQualityCheck() {
    setWarnings([]);
    if (family !== "Objective") {
      setWarnings([{
        code: "skipped",
        severity: "info",
        message: "Quality check ships for objective family in v1.",
      }]);
      return;
    }
    const correctOption = options.find((o) => o.is_correct);
    if (!correctOption) {
      setWarnings([{
        code: "no_correct",
        severity: "warning",
        message: "Mark one option as correct before running quality check.",
      }]);
      return;
    }
    try {
      const out = await aiAuthoring.qualityCheck(
        stem,
        correctOption.id,
        Object.fromEntries(options.map((o) => [o.id, o.text])),
      );
      setWarnings(out.warnings);
      if (out.warnings.length === 0) {
        setWarnings([{
          code: "clean",
          severity: "info",
          message: "All quality checks passed.",
        }]);
      }
    } catch (e) {
      setWarnings([{
        code: "qc_failed",
        severity: "warning",
        message: e instanceof Error ? e.message : "Quality check failed",
      }]);
    }
  }

  async function handleSubmit(evt: FormEvent) {
    evt.preventDefault();
    setSubmitError(null);

    if (!topicId) {
      setSubmitError("Pick an exam, subject, and topic before saving.");
      return;
    }
    if (!stem.trim()) {
      setSubmitError("Stem is required.");
      return;
    }

    setSubmitting(true);
    try {
      // P5-S58 — every type ships with the legacy MCQ-shape fields
      // (stem / choices / correct_idx) so the row remains readable
      // by pre-S37 code paths, plus the polymorphic discriminator
      // (questionType) and per-type structure (payload). For
      // non-MCQ types choices is a stub list because the backend
      // schema still requires NOT NULL on the column.
      const isObjective = family === "Objective";
      const correctIdx = isObjective
        ? Math.max(0, options.findIndex((o) => o.is_correct))
        : 0;
      const choicesPayload = isObjective
        ? options.map((o) => o.text || "—")
        : ["See payload."];

      // Build the per-family payload — same shape the seed uses,
      // so the polymorphic renderer / grader paths can consume it
      // identically to seeded UPSC items.
      let typedPayload: Record<string, unknown> | null = null;
      if (isObjective && typeId !== "MCQ_SINGLE") {
        typedPayload = {
          options: options.map((o) => ({ id: o.id, text: o.text })),
          correct_ids: options.filter((o) => o.is_correct).map((o) => o.id),
          partial_credit: typeId === "MCQ_MULTI",
        };
      } else if (family === "Numeric") {
        typedPayload = {
          answer: numericAnswer ? Number(numericAnswer) : null,
          tolerance: numericTolerance ? Number(numericTolerance) : 0,
          unit: numericUnit || null,
          range_low: numericRangeLow ? Number(numericRangeLow) : null,
          range_high: numericRangeHigh ? Number(numericRangeHigh) : null,
          formula: formulaExpr || null,
        };
      } else if (family === "Matching") {
        if (typeId === "MATCH_THE_FOLLOWING") {
          typedPayload = { pairs };
        } else if (typeId === "SEQUENCING") {
          typedPayload = { items: sequenceItems };
        } else if (typeId === "CLASSIFICATION") {
          typedPayload = {
            categories: classifyCategories,
            items: classifyItems,
          };
        }
      } else if (family === "Fill-in") {
        typedPayload = {
          template: fillTemplate,
          accepted: fillAccepted.map((row) =>
            row.split(",").map((s) => s.trim()).filter(Boolean),
          ),
        };
      } else if (family === "Subjective") {
        if (typeId === "CASE_STUDY") {
          // Per ADR-0026 §"Authoring + rendering contract" — CASE_STUDY
          // ships as inline sub-questions. The handler reads either
          // shape (legacy composite child_questions or inline
          // sub_questions); we emit the inline shape.
          typedPayload = {
            case_facts: caseFacts,
            sub_questions: subQuestions.map((sq) => ({
              id: sq.id,
              prompt: sq.prompt,
              expected_word_count_range: [sq.min_words, sq.max_words],
            })),
            rubric: rubric.map((r) => ({
              criterion: r.text,
              weight: r.weight,
              description: r.descriptors?.join(" · "),
            })),
          };
        } else if (typeId === "COMPREHENSION_LONG") {
          typedPayload = {
            passage: stem,
            child_questions: avChildren.map((c) => ({
              question_id: c.question_id,
              ordinal: c.ordinal,
            })),
          };
        } else {
          typedPayload = {
            model_answer: modelAnswer,
            expected_word_count_range: expectedWordRange,
            rubric: rubric.map((r) => ({
              criterion: r.text,
              weight: r.weight,
              keywords: r.keywords,
              descriptors: r.descriptors,
            })),
          };
        }
      } else if (family === "Visual & Spatial") {
        typedPayload = {
          image_url: imageUrl ?? null,
          shapes,
          markers,
        };
      } else if (family === "Audio/Video") {
        // LISTENING_COMP / VIDEO_QUESTION — composite over child
        // questions; per ADR-0026 the parent payload carries the media
        // reference + transcript + child refs.
        const mediaIdField =
          typeId === "LISTENING_COMP" ? "audio_media_id" : "video_media_id";
        typedPayload = {
          [mediaIdField]: avMediaId,
          transcript: avTranscript || null,
          transcript_language: avTranscriptLang,
          child_questions: avChildren.filter((c) => c.question_id).map((c) => ({
            question_id: c.question_id,
            ordinal: c.ordinal,
            timestamp_seconds: c.timestamp_seconds ?? null,
          })),
        };
      } else if (family === "Interactive") {
        if (typeId === "KBC_LIFELINE") {
          const available: string[] = [];
          if (kbcLifelines.fifty_fifty) available.push("50_50");
          if (kbcLifelines.audience_poll) available.push("audience_poll");
          if (kbcLifelines.phone_a_friend) available.push("phone_a_friend");
          typedPayload = {
            inner_question_id: innerQuestionId,
            available_lifelines: available,
            audience_poll_distribution: kbcLifelines.audience_poll
              ? audiencePollDist
              : null,
          };
        } else if (typeId === "TIMED_REVEAL") {
          typedPayload = {
            inner_question_id: innerQuestionId,
            initial_stem: initialStem,
            reveal_schedule: revealSteps.map((s) => ({
              at_seconds: s.at_seconds,
              additional_info: s.additional_info,
            })),
            reveals_make_easier: revealsMakeEasier,
          };
        } else if (typeId === "ADAPTIVE_DIFFICULTY") {
          typedPayload = {
            variants: difficultyVariants.filter((v) => v.question_id),
            starting_difficulty: startingDifficulty,
          };
        }
      }

      const created = await content.create({
        topicId,
        stem: stem.trim(),
        choices: choicesPayload,
        correctIdx,
        language,
        explanation: explanation.trim() || null,
        questionType: typeId,
        payload: typedPayload,
        aiOrigin: aiOrigin ?? null,
      });
      // P5-S58 — go to the My questions list (route /questions).
      // Detail-route per question is a follow-up surface.
      navigate("/questions", { replace: true });
      void created;
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Couldn't submit question",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Author question" chips={[{ label: "Multi-type" }]}>
      {registryError && <Banner tone="danger">{registryError}</Banner>}

      <form className="author-form" onSubmit={handleSubmit}>
        {scopeError && (
          <Banner tone="danger">{scopeError}</Banner>
        )}

        {/* ── Topic cascade (Exam → Subject → Topic) ──────────── */}
        <section style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
            }}
          >
            <div className="form-field">
              <label className="form-label">Exam *</label>
              <select
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                required
                className="form-input"
              >
                <option value="">— select exam —</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name || ex.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Subject *</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={!examId}
                required
                className="form-input"
              >
                <option value="">
                  {examId ? "— select subject —" : "(pick exam first)"}
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Topic *</label>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                disabled={!subjectId}
                required
                className="form-input"
              >
                <option value="">
                  {subjectId
                    ? topics.length === 0
                      ? "(no topics yet)"
                      : "— select topic —"
                    : "(pick subject first)"}
                </option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Type picker ───────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label className="form-label">Question type</label>
            <select
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value);
                setWarnings([]);
              }}
              className="form-input"
              style={{ minWidth: 280 }}
            >
              {allTypes.map((t) => (
                <option key={t.type_id} value={t.type_id}>
                  {t.type_id} ({t.family})
                </option>
              ))}
            </select>
          </div>
          {meta && (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              <Pill tone={meta.evaluation_mode === "DETERMINISTIC" ? "success" : "info"}>
                {meta.evaluation_mode}
              </Pill>{" "}
              · partial credit{" "}
              {meta.supports_partial ? "supported" : "n/a"} · media{" "}
              {meta.media_kinds.length > 0 ? meta.media_kinds.join(", ") : "none"}
            </div>
          )}
        </section>

        {/* ── Bulk AI generation (uses the type+topic selected above) ── */}
        {AI_DRAFT_SUPPORTED_TYPES.includes(typeId) && (
          <section style={{ marginBottom: 16 }}>
            <BulkAIGenerator
              typeId={typeId}
              exam={exams.find((ex) => ex.id === examId)?.code ?? "JEE-MAIN"}
              topicId={topicId}
              topicTitle={topics.find((t) => t.id === topicId)?.title ?? ""}
              language={language}
              disabled={!topicId}
              onDraftChosen={(draft, marker) => {
                setAiOrigin({ ...marker });
                const stemVal = draft.stem;
                if (typeof stemVal === "string") setStem(stemVal);
                const optsVal = draft.options as { id: string; text: string; is_correct: boolean }[] | undefined;
                if (Array.isArray(optsVal)) {
                  setOptions(optsVal);
                }
                const expVal = draft.explanation;
                if (typeof expVal === "string") setExplanation(expVal);
                window.scrollTo({ top: document.body.scrollHeight * 0.4, behavior: "smooth" });
              }}
            />
          </section>
        )}

        {/* ── AI Draft assist (single draft, with its own topic input) ── */}
        {AI_DRAFT_SUPPORTED_TYPES.includes(typeId) && (
          <section style={{ marginBottom: 16 }}>
            <AIDraftPanel
              typeId={typeId}
              onDraftGenerated={(draft, marker) => {
                setAiOrigin({ ...marker });
                const stemVal = draft.stem;
                if (typeof stemVal === "string") setStem(stemVal);
                const optsVal = draft.options as { id: string; text: string; is_correct: boolean }[] | undefined;
                if (Array.isArray(optsVal)) {
                  setOptions(optsVal);
                }
                const expVal = draft.explanation;
                if (typeof expVal === "string") setExplanation(expVal);
              }}
            />
          </section>
        )}

        {/* ── Stem ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label className="form-label">Stem</label>
            <textarea
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              rows={3}
              required
              className="form-input"
              style={{ resize: "vertical" }}
            />
          </div>
        </section>

        {/* ── Per-family fields ──────────────────────────────────── */}
        {family === "Objective" && (
          <section style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
              Options
            </label>
            {options.map((o, idx) => (
              <div
                key={o.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 80px",
                  gap: 8,
                  marginBottom: 6,
                  alignItems: "center",
                }}
              >
                <input
                  value={o.id}
                  onChange={(e) => setOptionField(idx, { id: e.target.value })}
                  style={{
                    padding: 6,
                    border: "1px solid var(--rule, #e1e5ee)",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    textAlign: "center",
                  }}
                />
                <input
                  value={o.text}
                  onChange={(e) => setOptionField(idx, { text: e.target.value })}
                  placeholder={`Option ${o.id} text`}
                  style={{
                    padding: 6,
                    border: "1px solid var(--rule, #e1e5ee)",
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <input
                    type={typeId === "MCQ_MULTI" ? "checkbox" : "radio"}
                    name="correct"
                    checked={o.is_correct}
                    onChange={(e) => {
                      if (typeId === "MCQ_MULTI") {
                        setOptionField(idx, { is_correct: e.target.checked });
                      } else {
                        setOptions(
                          options.map((opt, i) => ({ ...opt, is_correct: i === idx })),
                        );
                      }
                    }}
                  />
                  correct
                </label>
              </div>
            ))}
          </section>
        )}

        {family === "Numeric" && (
          <section style={{ marginBottom: 16 }}>
            {typeId === "FORMULA_INPUT" ? (
              <>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
                  Canonical formula (sympy expression)
                </label>
                <input
                  value={formulaExpr}
                  onChange={(e) => setFormulaExpr(e.target.value)}
                  placeholder="e.g. v**2 = u**2 + 2*a*s"
                  style={{ width: "100%", padding: 8, borderRadius: 4, fontFamily: "monospace" }}
                />
                <p style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
                  Student's submitted expression is symbolically simplified
                  via sympy and compared for algebraic equivalence.
                </p>
              </>
            ) : typeId === "NUMERIC_RANGE" ? (
              <>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
                  Accepted range
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    value={numericRangeLow}
                    onChange={(e) => setNumericRangeLow(e.target.value)}
                    placeholder="low"
                    style={{ width: 140, padding: 6, borderRadius: 4 }}
                  />
                  <span>to</span>
                  <input
                    type="number"
                    value={numericRangeHigh}
                    onChange={(e) => setNumericRangeHigh(e.target.value)}
                    placeholder="high"
                    style={{ width: 140, padding: 6, borderRadius: 4 }}
                  />
                  <input
                    value={numericUnit}
                    onChange={(e) => setNumericUnit(e.target.value)}
                    placeholder="unit (e.g. m/s)"
                    style={{ width: 160, padding: 6, borderRadius: 4 }}
                  />
                </div>
              </>
            ) : (
              <>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
                  Correct answer
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    step={typeId === "NUMERIC_DECIMAL" ? "0.01" : "1"}
                    value={numericAnswer}
                    onChange={(e) => setNumericAnswer(e.target.value)}
                    placeholder="answer"
                    style={{ width: 180, padding: 6, borderRadius: 4 }}
                  />
                  {typeId === "NUMERIC_DECIMAL" && (
                    <>
                      <span style={{ fontSize: 12, opacity: 0.8 }}>±</span>
                      <input
                        type="number"
                        step="0.01"
                        value={numericTolerance}
                        onChange={(e) => setNumericTolerance(e.target.value)}
                        placeholder="tolerance"
                        style={{ width: 140, padding: 6, borderRadius: 4 }}
                      />
                    </>
                  )}
                  <input
                    value={numericUnit}
                    onChange={(e) => setNumericUnit(e.target.value)}
                    placeholder="unit (optional)"
                    style={{ width: 180, padding: 6, borderRadius: 4 }}
                  />
                </div>
              </>
            )}
          </section>
        )}

        {family === "Matching" && (
          <section style={{ marginBottom: 16 }}>
            {typeId === "MATCH_THE_FOLLOWING" && (
              <>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
                  Match pairs
                </label>
                {pairs.map((p, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 24px 1fr 60px",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <input
                      value={p.left}
                      onChange={(e) =>
                        setPairs(pairs.map((x, i) => (i === idx ? { ...x, left: e.target.value } : x)))
                      }
                      placeholder={`Left ${idx + 1}`}
                      style={{ padding: 6, borderRadius: 4 }}
                    />
                    <span style={{ textAlign: "center", opacity: 0.6 }}>↔</span>
                    <input
                      value={p.right}
                      onChange={(e) =>
                        setPairs(pairs.map((x, i) => (i === idx ? { ...x, right: e.target.value } : x)))
                      }
                      placeholder={`Right ${idx + 1}`}
                      style={{ padding: 6, borderRadius: 4 }}
                    />
                    <button
                      type="button"
                      onClick={() => setPairs(pairs.filter((_, i) => i !== idx))}
                      disabled={pairs.length <= 2}
                      style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPairs([...pairs, { left: "", right: "" }])}
                  style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
                >
                  + Add pair
                </button>
              </>
            )}
            {typeId === "SEQUENCING" && (
              <>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
                  Items in correct order
                </label>
                {sequenceItems.map((s, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ width: 24, opacity: 0.7, fontFamily: "monospace" }}>{idx + 1}.</span>
                    <input
                      value={s}
                      onChange={(e) =>
                        setSequenceItems(sequenceItems.map((x, i) => (i === idx ? e.target.value : x)))
                      }
                      style={{ flex: 1, padding: 6, borderRadius: 4 }}
                    />
                    <button
                      type="button"
                      onClick={() => setSequenceItems(sequenceItems.filter((_, i) => i !== idx))}
                      disabled={sequenceItems.length <= 2}
                      style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setSequenceItems([...sequenceItems, ""])}
                  style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
                >
                  + Add item
                </button>
              </>
            )}
            {typeId === "CLASSIFICATION" && (
              <>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
                  Categories
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {classifyCategories.map((c, idx) => (
                    <input
                      key={idx}
                      value={c}
                      onChange={(e) =>
                        setClassifyCategories(classifyCategories.map((x, i) => (i === idx ? e.target.value : x)))
                      }
                      placeholder={`Category ${idx + 1}`}
                      style={{ padding: 6, borderRadius: 4, width: 200 }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setClassifyCategories([...classifyCategories, ""])}
                    style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
                  >
                    + Category
                  </button>
                </div>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
                  Items + correct category
                </label>
                {classifyItems.map((it, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input
                      value={it.text}
                      onChange={(e) =>
                        setClassifyItems(classifyItems.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)))
                      }
                      placeholder={`Item ${idx + 1}`}
                      style={{ flex: 1, padding: 6, borderRadius: 4 }}
                    />
                    <select
                      value={it.category}
                      onChange={(e) =>
                        setClassifyItems(classifyItems.map((x, i) => (i === idx ? { ...x, category: e.target.value } : x)))
                      }
                      style={{ padding: 6, borderRadius: 4, width: 200 }}
                    >
                      <option value="">— select category —</option>
                      {classifyCategories.filter(Boolean).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setClassifyItems(classifyItems.filter((_, i) => i !== idx))}
                      style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setClassifyItems([...classifyItems, { text: "", category: "" }])}
                  style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
                >
                  + Add item
                </button>
              </>
            )}
          </section>
        )}

        {family === "Fill-in" && (
          <section style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
              {typeId === "CLOZE_PASSAGE" ? "Passage with [BLANK] markers" : "Sentence with [BLANK] markers"}
            </label>
            <textarea
              value={fillTemplate}
              onChange={(e) => setFillTemplate(e.target.value)}
              rows={typeId === "CLOZE_PASSAGE" ? 6 : 3}
              placeholder={
                typeId === "CLOZE_PASSAGE"
                  ? "The mitochondria are the [BLANK] of the cell, where [BLANK] is converted into ATP…"
                  : "The capital of France is [BLANK]."
              }
              style={{ width: "100%", padding: 8, borderRadius: 4, fontFamily: "inherit" }}
            />
            <label style={{ fontSize: 13, fontWeight: 500, marginTop: 12, marginBottom: 6, display: "block" }}>
              Accepted answers per blank (one row per blank, comma-separated synonyms)
            </label>
            {fillAccepted.map((row, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                <span style={{ width: 60, opacity: 0.7, fontFamily: "monospace" }}>#{idx + 1}</span>
                <input
                  value={row}
                  onChange={(e) =>
                    setFillAccepted(fillAccepted.map((x, i) => (i === idx ? e.target.value : x)))
                  }
                  placeholder="powerhouse, पावरहाउस, energy producer"
                  style={{ flex: 1, padding: 6, borderRadius: 4 }}
                />
                <button
                  type="button"
                  onClick={() => setFillAccepted(fillAccepted.filter((_, i) => i !== idx))}
                  disabled={fillAccepted.length <= 1}
                  style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFillAccepted([...fillAccepted, ""])}
              style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--rule-2)", background: "transparent" }}
            >
              + Add blank
            </button>
          </section>
        )}

        {family === "Subjective" && typeId === "CASE_STUDY" && (
          <>
            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Case facts
              </label>
              <textarea
                value={caseFacts}
                onChange={(e) => setCaseFacts(e.target.value)}
                rows={6}
                placeholder="The scenario, data, or context students will analyse."
                style={{
                  display: "block",
                  width: "100%",
                  padding: 8,
                  border: "1px solid var(--rule, #e1e5ee)",
                  borderRadius: 4,
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Sub-questions
              </label>
              {subQuestions.map((sq, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    marginBottom: 8,
                    border: "1px solid var(--rule, #e1e5ee)",
                    borderRadius: 6,
                    background: "var(--card, #fafbfd)",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input
                      value={sq.id}
                      onChange={(e) => {
                        const next = [...subQuestions];
                        next[idx] = { ...sq, id: e.target.value };
                        setSubQuestions(next);
                      }}
                      placeholder="id (e.g. a)"
                      style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                    />
                    <input
                      type="number"
                      value={sq.min_words}
                      onChange={(e) => {
                        const next = [...subQuestions];
                        next[idx] = { ...sq, min_words: Number(e.target.value) };
                        setSubQuestions(next);
                      }}
                      style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                    />
                    <span style={{ alignSelf: "center", fontSize: 12 }}>to</span>
                    <input
                      type="number"
                      value={sq.max_words}
                      onChange={(e) => {
                        const next = [...subQuestions];
                        next[idx] = { ...sq, max_words: Number(e.target.value) };
                        setSubQuestions(next);
                      }}
                      style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                    />
                    <span style={{ alignSelf: "center", fontSize: 12 }}>words</span>
                    <button
                      type="button"
                      onClick={() => setSubQuestions(subQuestions.filter((_, i) => i !== idx))}
                      style={{
                        marginLeft: "auto",
                        padding: "4px 10px",
                        border: "1px solid var(--rule, #e1e5ee)",
                        borderRadius: 4,
                        background: "white",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={sq.prompt}
                    onChange={(e) => {
                      const next = [...subQuestions];
                      next[idx] = { ...sq, prompt: e.target.value };
                      setSubQuestions(next);
                    }}
                    rows={2}
                    placeholder="Part prompt — what the student must answer."
                    style={{
                      width: "100%",
                      padding: 6,
                      borderRadius: 4,
                      border: "1px solid var(--rule, #e1e5ee)",
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setSubQuestions([
                    ...subQuestions,
                    {
                      id: String.fromCharCode(97 + subQuestions.length),
                      prompt: "",
                      min_words: 50,
                      max_words: 150,
                    },
                  ])
                }
                style={{
                  padding: "6px 12px",
                  border: "1px dashed var(--rule, #e1e5ee)",
                  borderRadius: 4,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                + Add sub-question
              </button>
            </section>

            <section style={{ marginBottom: 16 }}>
              <RubricEditor version={1} criteria={rubric} onChange={setRubric} />
            </section>
          </>
        )}

        {family === "Subjective" && typeId === "COMPREHENSION_LONG" && (
          <section style={{ marginBottom: 16 }}>
            <Banner tone="info">
              <strong>Comprehension passage.</strong> The Stem field above is
              used as the passage. Attach child questions by their UUIDs
              below — each child renders as a separate quiz item with its
              own answer flow.
            </Banner>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginTop: 12 }}>
              Child question UUIDs
            </label>
            {avChildren.map((c, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input
                  value={c.question_id}
                  onChange={(e) => {
                    const next = [...avChildren];
                    next[idx] = { ...c, question_id: e.target.value };
                    setAvChildren(next);
                  }}
                  placeholder="child_question_uuid"
                  style={{ flex: 1, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                />
                <input
                  type="number"
                  value={c.ordinal}
                  onChange={(e) => {
                    const next = [...avChildren];
                    next[idx] = { ...c, ordinal: Number(e.target.value) };
                    setAvChildren(next);
                  }}
                  style={{ width: 70, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                />
                <button
                  type="button"
                  onClick={() => setAvChildren(avChildren.filter((_, i) => i !== idx))}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)", background: "white", cursor: "pointer", fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setAvChildren([
                  ...avChildren,
                  { question_id: "", ordinal: avChildren.length + 1 },
                ])
              }
              style={{
                padding: "6px 12px",
                border: "1px dashed var(--rule, #e1e5ee)",
                borderRadius: 4,
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              + Add child question
            </button>
          </section>
        )}

        {family === "Subjective" && typeId !== "CASE_STUDY" && typeId !== "COMPREHENSION_LONG" && (
          <>
            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
                Expected word count range
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={expectedWordRange[0]}
                  onChange={(e) =>
                    setExpectedWordRange([Number(e.target.value), expectedWordRange[1]])
                  }
                  style={{ width: 100, padding: 6, borderRadius: 4 }}
                />
                <span style={{ alignSelf: "center" }}>to</span>
                <input
                  type="number"
                  min={0}
                  value={expectedWordRange[1]}
                  onChange={(e) =>
                    setExpectedWordRange([expectedWordRange[0], Number(e.target.value)])
                  }
                  style={{ width: 100, padding: 6, borderRadius: 4 }}
                />
              </div>
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>Model answer</label>
              <textarea
                value={modelAnswer}
                onChange={(e) => setModelAnswer(e.target.value)}
                rows={6}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 4,
                  padding: 8,
                  border: "1px solid var(--rule, #e1e5ee)",
                  borderRadius: 4,
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
            </section>

            <section style={{ marginBottom: 16 }}>
              <RubricEditor
                version={1}
                criteria={rubric}
                onChange={setRubric}
              />
            </section>
          </>
        )}

        {family === "Visual & Spatial" && (
          <section style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "block" }}>
              Diagram canvas
            </label>
            <DiagramAuthoringCanvas
              imageUrl={imageUrl}
              onImageUpload={(file) => setImageUrl(URL.createObjectURL(file))}
              shapes={shapes}
              markers={markers}
              onShapesChange={setShapes}
              onMarkersChange={setMarkers}
            />
          </section>
        )}

        {family === "Audio/Video" && (
          <>
            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                {typeId === "LISTENING_COMP" ? "Audio media_id" : "Video media_id"}
              </label>
              <input
                value={avMediaId}
                onChange={(e) => setAvMediaId(e.target.value)}
                placeholder="content_media UUID (uploaded separately)"
                style={{
                  width: "100%", padding: 8, borderRadius: 4,
                  border: "1px solid var(--rule, #e1e5ee)",
                  fontFamily: "monospace", fontSize: 13,
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Upload the media in the Media library first; paste the
                resulting UUID here. Mobile + web players fetch via
                <code> /content/media/{"{id}"}/file</code>.
              </div>
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Transcript
              </label>
              <textarea
                value={avTranscript}
                onChange={(e) => setAvTranscript(e.target.value)}
                rows={5}
                placeholder={
                  typeId === "VIDEO_QUESTION"
                    ? "Optional — leave blank to auto-generate via AI Gateway"
                    : "Required for LISTENING_COMP"
                }
                style={{
                  width: "100%", padding: 8, borderRadius: 4,
                  border: "1px solid var(--rule, #e1e5ee)",
                  fontFamily: "inherit", fontSize: 14,
                }}
              />
              <div style={{ marginTop: 6 }}>
                <label style={{ fontSize: 12, marginRight: 6 }}>Language:</label>
                <select
                  value={avTranscriptLang}
                  onChange={(e) => setAvTranscriptLang(e.target.value)}
                  style={{ padding: "4px 6px", borderRadius: 4 }}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                  <option value="te">Telugu</option>
                </select>
              </div>
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Child questions
              </label>
              {avChildren.map((c, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <input
                    value={c.question_id}
                    onChange={(e) => {
                      const next = [...avChildren];
                      next[idx] = { ...c, question_id: e.target.value };
                      setAvChildren(next);
                    }}
                    placeholder="child question UUID"
                    style={{ flex: 1, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)", fontFamily: "monospace", fontSize: 12 }}
                  />
                  <input
                    type="number"
                    value={c.ordinal}
                    onChange={(e) => {
                      const next = [...avChildren];
                      next[idx] = { ...c, ordinal: Number(e.target.value) };
                      setAvChildren(next);
                    }}
                    style={{ width: 60, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={c.timestamp_seconds ?? ""}
                    onChange={(e) => {
                      const next = [...avChildren];
                      next[idx] = {
                        ...c,
                        timestamp_seconds: e.target.value ? Number(e.target.value) : undefined,
                      };
                      setAvChildren(next);
                    }}
                    placeholder="t (s)"
                    style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setAvChildren(avChildren.filter((_, i) => i !== idx))}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)", background: "white", cursor: "pointer", fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setAvChildren([
                    ...avChildren,
                    { question_id: "", ordinal: avChildren.length + 1 },
                  ])
                }
                style={{
                  padding: "6px 12px",
                  border: "1px dashed var(--rule, #e1e5ee)",
                  borderRadius: 4,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                + Add child question
              </button>
            </section>
          </>
        )}

        {family === "Interactive" && typeId === "KBC_LIFELINE" && (
          <>
            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Inner MCQ_SINGLE question UUID
              </label>
              <input
                value={innerQuestionId}
                onChange={(e) => setInnerQuestionId(e.target.value)}
                placeholder="UUID of the underlying MCQ_SINGLE"
                style={{
                  width: "100%", padding: 8, borderRadius: 4,
                  border: "1px solid var(--rule, #e1e5ee)",
                  fontFamily: "monospace", fontSize: 13,
                }}
              />
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Lifelines available
              </label>
              {(["fifty_fifty", "audience_poll", "phone_a_friend"] as const).map((k) => (
                <label key={k} style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={kbcLifelines[k]}
                    onChange={(e) =>
                      setKbcLifelines({ ...kbcLifelines, [k]: e.target.checked })
                    }
                  />{" "}
                  {k === "fifty_fifty" ? "50:50" : k === "audience_poll" ? "Audience poll" : "Phone a friend"}
                </label>
              ))}
            </section>

            {kbcLifelines.audience_poll && (
              <section style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                  Audience poll distribution (must sum to ~100)
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {Object.keys(audiencePollDist).map((opt) => (
                    <div key={opt} style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>{opt}</span>
                      <input
                        type="number"
                        value={audiencePollDist[opt]}
                        onChange={(e) =>
                          setAudiencePollDist({
                            ...audiencePollDist,
                            [opt]: Number(e.target.value),
                          })
                        }
                        style={{ width: 70, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {family === "Interactive" && typeId === "TIMED_REVEAL" && (
          <>
            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Inner question UUID
              </label>
              <input
                value={innerQuestionId}
                onChange={(e) => setInnerQuestionId(e.target.value)}
                placeholder="UUID of inner question"
                style={{
                  width: "100%", padding: 8, borderRadius: 4,
                  border: "1px solid var(--rule, #e1e5ee)",
                  fontFamily: "monospace", fontSize: 13,
                }}
              />
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Initial stem (shown at t=0)
              </label>
              <textarea
                value={initialStem}
                onChange={(e) => setInitialStem(e.target.value)}
                rows={3}
                style={{
                  width: "100%", padding: 8, borderRadius: 4,
                  border: "1px solid var(--rule, #e1e5ee)", fontFamily: "inherit", fontSize: 14,
                }}
              />
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Reveal schedule
              </label>
              {revealSteps.map((s, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span style={{ alignSelf: "center", fontSize: 12, color: "#999" }}>@</span>
                  <input
                    type="number"
                    step="0.5"
                    value={s.at_seconds}
                    onChange={(e) => {
                      const next = [...revealSteps];
                      next[idx] = { ...s, at_seconds: Number(e.target.value) };
                      setRevealSteps(next);
                    }}
                    style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                  />
                  <span style={{ alignSelf: "center", fontSize: 12 }}>s</span>
                  <input
                    value={s.additional_info}
                    onChange={(e) => {
                      const next = [...revealSteps];
                      next[idx] = { ...s, additional_info: e.target.value };
                      setRevealSteps(next);
                    }}
                    placeholder="info revealed at this mark"
                    style={{ flex: 1, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setRevealSteps(revealSteps.filter((_, i) => i !== idx))}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)", background: "white", cursor: "pointer", fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setRevealSteps([
                    ...revealSteps,
                    { at_seconds: revealSteps.length * 10 + 10, additional_info: "" },
                  ])
                }
                style={{ padding: "6px 12px", border: "1px dashed var(--rule, #e1e5ee)", borderRadius: 4, background: "transparent", cursor: "pointer", fontSize: 13 }}
              >
                + Add reveal step
              </button>
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, display: "block" }}>
                <input
                  type="checkbox"
                  checked={revealsMakeEasier}
                  onChange={(e) => setRevealsMakeEasier(e.target.checked)}
                />{" "}
                Reveals make the question easier over time (uncheck if it
                gets harder).
              </label>
            </section>
          </>
        )}

        {family === "Interactive" && typeId === "ADAPTIVE_DIFFICULTY" && (
          <>
            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Variants (2–5, distinct difficulty levels 1–5)
              </label>
              {difficultyVariants.map((v, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <input
                    value={v.question_id}
                    onChange={(e) => {
                      const next = [...difficultyVariants];
                      next[idx] = { ...v, question_id: e.target.value };
                      setDifficultyVariants(next);
                    }}
                    placeholder="variant question UUID"
                    style={{ flex: 1, padding: 6, borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)", fontFamily: "monospace", fontSize: 12 }}
                  />
                  <select
                    value={v.difficulty_level}
                    onChange={(e) => {
                      const next = [...difficultyVariants];
                      next[idx] = { ...v, difficulty_level: Number(e.target.value) };
                      setDifficultyVariants(next);
                    }}
                    style={{ padding: 6, borderRadius: 4 }}
                  >
                    {[1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>Level {d}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setDifficultyVariants(difficultyVariants.filter((_, i) => i !== idx))}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--rule, #e1e5ee)", background: "white", cursor: "pointer", fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={difficultyVariants.length >= 5}
                onClick={() =>
                  setDifficultyVariants([
                    ...difficultyVariants,
                    {
                      question_id: "",
                      difficulty_level: Math.min(5, difficultyVariants.length + 1),
                    },
                  ])
                }
                style={{ padding: "6px 12px", border: "1px dashed var(--rule, #e1e5ee)", borderRadius: 4, background: "transparent", cursor: difficultyVariants.length >= 5 ? "not-allowed" : "pointer", fontSize: 13 }}
              >
                + Add variant
              </button>
            </section>

            <section style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, marginRight: 8 }}>
                Starting difficulty:
              </label>
              <select
                value={startingDifficulty}
                onChange={(e) => setStartingDifficulty(Number(e.target.value))}
                style={{ padding: 6, borderRadius: 4 }}
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>Level {d}</option>
                ))}
              </select>
            </section>
          </>
        )}

        {/* ── Concept tags ───────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <ConceptTagger tags={tags} onChange={setTags} />
        </section>

        {/* ── Explanation ───────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label className="form-label">Explanation</label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={3}
              className="form-input"
            />
          </div>
        </section>

        {/* ── Language ──────────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label className="form-label">Primary language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "hi")}
              className="form-input"
              style={{ maxWidth: 240 }}
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
            </select>
          </div>
        </section>

        {/* ── Quality check ─────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => void runQualityCheck()}
            className="btn btn-ghost"
          >
            🔍 Run quality checks
          </button>
          <div style={{ marginTop: 8 }}>
            {warnings.map((w, idx) => (
              <Banner
                key={idx}
                tone={w.severity === "warning" ? "warning" : "info"}
              >
                <strong>{w.code}:</strong> {w.message}
                {w.field && (
                  <span style={{ opacity: 0.7 }}> (field: {w.field})</span>
                )}
              </Banner>
            ))}
          </div>
        </section>

        {/* ── Submit ───────────────────────────────────────────── */}
        {submitError && <Banner tone="danger">{submitError}</Banner>}

        <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={submitting || !stem.trim()}
            className="btn btn-primary"
          >
            {submitting ? "Submitting…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-ghost"
          >
            Cancel
          </button>
        </div>

        {aiOrigin && (
          <div
            className="ai-origin-banner"
            style={{
              marginTop: 12,
              padding: 8,
              fontSize: 12,
              borderRadius: 4,
            }}
          >
            ✨ AI_DRAFT marker present. Reviewer will see per-field
            edit_distance at submit time.
          </div>
        )}
      </form>
    </AppShell>
  );
}