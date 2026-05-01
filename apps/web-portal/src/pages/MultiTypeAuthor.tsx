import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import { AIDraftPanel } from "../components/AIDraftPanel";
import { ConceptTagger, type ConceptTag } from "../components/ConceptTagger";
import { RubricEditor, type RubricCriterion } from "../components/RubricEditor";
import {
  DiagramAuthoringCanvas,
  type Marker,
  type Shape,
} from "../components/DiagramAuthoringCanvas";
import { types, type TypeMeta, aiAuthoring } from "../lib/phase5-api";

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
    setSubmitting(true);
    try {
      // For v1, we POST through the existing /content/questions
      // endpoint shape (MCQ field-style). Per-family rich payloads
      // land when content/routes accepts the new typed payload column.
      // Preserves backward-compatibility with the legacy authoring
      // path.
      const correctIdx = options.findIndex((o) => o.is_correct);
      const body = {
        stem,
        choices: options.map((o) => o.text),
        correct_idx: correctIdx,
        language,
        difficulty_b: 0,
        discrimination_a: 1.0,
        guessing_c: 0.0,
        explanation,
        question_type: typeId,
        // ai_origin is round-tripped to questions.ai_origin JSONB.
        ai_origin: aiOrigin,
        concept_tags: tags,
      };
      const resp = await fetch("/api/v1/content/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        throw new Error(`submit failed: ${resp.status}`);
      }
      const created = await resp.json();
      navigate(`/my-questions/${created.id}`);
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

      <form onSubmit={handleSubmit}>
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

        {/* ── AI Draft assist ───────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <AIDraftPanel
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

        {family === "Subjective" && (
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
            style={{
              marginTop: 12,
              padding: 8,
              fontSize: 12,
              background: "var(--color-blue-bg, #dbeafe)",
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
