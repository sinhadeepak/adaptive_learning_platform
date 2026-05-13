import { useState } from "react";
import type { ReactNode } from "react";
import { aiAuthoring, type AIDraftMarker } from "../lib/phase5-api";

// ─────────────────────────────────────────────────────────────────────────
// CE-303 frontend — AI authoring assist panel.
//
// Wraps:
//   POST /content/ai/draft         (per-type draft generation)
//   POST /content/ai/explanation   (expand a one-line solution)
//   POST /content/ai/distractors   (3-5 plausible distractors)
//
// All output is marked AI_DRAFT. The author edits in the standard
// authoring form alongside; per-field "AI badge" disappears as fields
// are edited (edit_distance > 0).
// ─────────────────────────────────────────────────────────────────────────

export const AI_DRAFT_SUPPORTED_TYPES: string[] = [
  "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
  "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
  "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
  "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
  "ESSAY", "DESCRIPTIVE_LONG", "COMPREHENSION_LONG", "CASE_STUDY",
  "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
  "LISTENING_COMP", "VIDEO_QUESTION",
  "KBC_LIFELINE", "TIMED_REVEAL", "ADAPTIVE_DIFFICULTY",
];

interface AIDraftPanelProps {
  onDraftGenerated?: (draft: Record<string, unknown>, marker: AIDraftMarker) => void;
  // P5 — when supplied, the panel runs in controlled mode and inherits
  // the page's question type instead of showing a duplicate dropdown.
  typeId?: string;
}

export function AIDraftPanel({ onDraftGenerated, typeId: typeIdProp }: AIDraftPanelProps): ReactNode {
  const [typeIdLocal, setTypeIdLocal] = useState("MCQ_SINGLE");
  const typeId = typeIdProp ?? typeIdLocal;
  const setTypeId = (v: string) => {
    if (typeIdProp === undefined) setTypeIdLocal(v);
  };
  const showInternalTypePicker = typeIdProp === undefined;
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [exam, setExam] = useState("JEE-MAIN");
  const [syllabusChapter, setSyllabusChapter] = useState("");
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<{
    draft: Record<string, unknown>;
    marker: AIDraftMarker;
  } | null>(null);

  async function handleGenerate() {
    if (!topic.trim()) {
      setError("Topic is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await aiAuthoring.draft(
        typeId,
        topic,
        difficulty,
        exam,
        syllabusChapter || undefined,
        sourceMaterial || undefined,
      );
      setLastDraft(out);
      onDraftGenerated?.(out.draft, out.marker);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="ai-draft-card"
      style={{
        padding: 16,
        border: "1px solid var(--border, #e1e5ee)",
        borderRadius: 8,
        background:
          "linear-gradient(180deg, var(--bg-subtle, #f8f9fc), white)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 18 }}>✨</span>
        <h3 style={{ fontSize: 15, margin: 0 }}>AI authoring assist</h3>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {showInternalTypePicker && (
          <label style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 4 }}>Question type</div>
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--border, #e1e5ee)",
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              {AI_DRAFT_SUPPORTED_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        )}

        <label style={{ fontSize: 13, gridColumn: showInternalTypePicker ? undefined : "1 / -1" }}>
          <div style={{ marginBottom: 4 }}>Topic *</div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Newton's laws"
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              fontSize: 13,
            }}
          />
        </label>

        <label style={{ fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}>Difficulty</div>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as "EASY" | "MEDIUM" | "HARD")}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}>Exam</div>
          <input
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            placeholder="JEE-MAIN"
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              fontSize: 13,
            }}
          />
        </label>

        <label style={{ fontSize: 13, gridColumn: "1 / -1" }}>
          <div style={{ marginBottom: 4 }}>Syllabus chapter (optional)</div>
          <input
            value={syllabusChapter}
            onChange={(e) => setSyllabusChapter(e.target.value)}
            placeholder="Class 11 — Mechanics"
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              fontSize: 13,
            }}
          />
        </label>

        <label style={{ fontSize: 13, gridColumn: "1 / -1" }}>
          <div style={{ marginBottom: 4 }}>Source material (optional)</div>
          <textarea
            value={sourceMaterial}
            onChange={(e) => setSourceMaterial(e.target.value)}
            placeholder="Paste textbook excerpt or syllabus statement here…"
            rows={3}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </label>
      </div>

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: "var(--color-red-bg, #fee)",
            color: "var(--color-red, #f43f5e)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={busy || !topic.trim()}
          style={{
            padding: "8px 16px",
            background:
              busy || !topic.trim()
                ? "var(--text-faint, #cbd5e0)"
                : "var(--color-blue, #4f87f6)",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: busy || !topic.trim() ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          {busy ? "Generating…" : "✨ Generate draft"}
        </button>
        {lastDraft && (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            ✓ Drafted via {lastDraft.marker.prompt_template_id}@
            {lastDraft.marker.prompt_template_version}
          </span>
        )}
      </div>

      <div
        className="ai-draft-disclaimer"
        style={{
          marginTop: 12,
          padding: 8,
          fontSize: 12,
          borderRadius: 4,
        }}
      >
        💡 AI drafts are marked <strong>AI_DRAFT</strong> and never bypass
        peer review. Reviewer sees per-field edit distance — fields you don't
        edit get extra scrutiny. Daily quota: 50 drafts.
      </div>
    </div>
  );
}
