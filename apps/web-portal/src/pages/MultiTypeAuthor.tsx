import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import { AIDraftPanel, AI_DRAFT_SUPPORTED_TYPES } from "../components/AIDraftPanel";
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
// CASE_STUDY (composite parent) + Audio/Video + Interactive ship as
// stubs — selecting them surfaces a "Phase 2" banner with a pointer
// to the standalone authoring tools.
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
      } else if (family === "Visual & Spatial") {
        typedPayload = {
          image_url: imageUrl ?? null,
          shapes,
          markers,
        };
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
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              <div style={{ marginBottom: 4 }}>Exam *</div>
              <select
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                required
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4 }}
              >
                <option value="">— select exam —</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name || ex.code}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              <div style={{ marginBottom: 4 }}>Subject *</div>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={!examId}
                required
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4 }}
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
            </label>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              <div style={{ marginBottom: 4 }}>Topic *</div>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                disabled={!subjectId}
                required
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4 }}
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
            </label>
          </div>
        </section>

        {/* ── Type picker ───────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Question type
          </label>
          <select
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setWarnings([]);
            }}
            style={{
              display: "block",
              marginTop: 4,
              padding: "6px 8px",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              fontSize: 13,
              minWidth: 280,
            }}
          >
            {allTypes.map((t) => (
              <option key={t.type_id} value={t.type_id}>
                {t.type_id} ({t.family})
              </option>
            ))}
          </select>
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

        {/* ── AI Draft assist (objective + numeric only in v1) ── */}
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
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Stem
          </label>
          <textarea
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            rows={3}
            required
            style={{
              display: "block",
              width: "100%",
              marginTop: 4,
              padding: 8,
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
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
                    border: "1px solid var(--border, #e1e5ee)",
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
                    border: "1px solid var(--border, #e1e5ee)",
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
                      style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPairs([...pairs, { left: "", right: "" }])}
                  style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
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
                      style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setSequenceItems([...sequenceItems, ""])}
                  style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
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
                    style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
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
                      style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setClassifyItems([...classifyItems, { text: "", category: "" }])}
                  style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
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
                  style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFillAccepted([...fillAccepted, ""])}
              style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent" }}
            >
              + Add blank
            </button>
          </section>
        )}

        {family === "Subjective" && (typeId === "CASE_STUDY" || typeId === "COMPREHENSION_LONG") && (
          <Banner tone="info">
            <strong>Composite type.</strong> {typeId} is a parent that
            references existing child questions. Author each child question
            separately (any type), then attach them by ID via the Composite
            children panel that lands in a follow-up sprint.
          </Banner>
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
                  border: "1px solid var(--border, #e1e5ee)",
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

        {(family === "Audio/Video" || family === "Interactive") && (
          <Banner tone="info">
            <strong>Phase 2 family.</strong> {typeId} authoring lands when
            the family flag flips. Schema + payload validation are live;
            authoring UI ships with the gated rollout.
          </Banner>
        )}

        {/* ── Concept tags ───────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <ConceptTagger tags={tags} onChange={setTags} />
        </section>

        {/* ── Explanation ───────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Explanation</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={3}
            style={{
              display: "block",
              width: "100%",
              marginTop: 4,
              padding: 8,
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
        </section>

        {/* ── Language ──────────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Primary language{" "}
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "hi")}
            style={{
              padding: "6px 8px",
              borderRadius: 4,
              border: "1px solid var(--border, #e1e5ee)",
            }}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
          </select>
        </section>

        {/* ── Quality check ─────────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => void runQualityCheck()}
            style={{
              padding: "6px 12px",
              background: "var(--bg-subtle, #f8f9fc)",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
            }}
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
            style={{
              padding: "8px 16px",
              background:
                submitting || !stem.trim()
                  ? "var(--text-faint, #cbd5e0)"
                  : "var(--color-blue, #4f87f6)",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor:
                submitting || !stem.trim() ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            {submitting ? "Submitting…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
            }}
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
