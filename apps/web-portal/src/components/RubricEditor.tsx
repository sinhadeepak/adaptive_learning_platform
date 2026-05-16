import { useState } from "react";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Rubric editor for ESSAY / DESCRIPTIVE_LONG / CASE_STUDY child types.
// Per CE-205 + Cat §4.5: rubric criteria + weights (sum to 100, content
// weights NOT marks). Authoring UI enforces the sum-to-100 invariant.
// ─────────────────────────────────────────────────────────────────────────

export interface RubricCriterion {
  id: string;
  text: string;
  weight: number;
  keywords: string[];
  descriptors: string[];
}

interface RubricEditorProps {
  version: number;
  criteria: RubricCriterion[];
  onChange: (criteria: RubricCriterion[]) => void;
}

export function RubricEditor({
  version,
  criteria,
  onChange,
}: RubricEditorProps): ReactNode {
  const [keywordsRaw, setKeywordsRaw] = useState<Record<string, string>>({});

  const totalWeight = criteria.reduce((acc, c) => acc + c.weight, 0);
  const isBalanced = Math.abs(totalWeight - 100) < 0.01;

  function update(idx: number, patch: Partial<RubricCriterion>) {
    const next = criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  }

  function addCriterion() {
    const id = `c${criteria.length + 1}`;
    onChange([
      ...criteria,
      { id, text: "", weight: 0, keywords: [], descriptors: [] },
    ]);
  }

  function remove(idx: number) {
    onChange(criteria.filter((_, i) => i !== idx));
  }

  function distributeEvenly() {
    if (criteria.length === 0) return;
    const each = Math.floor(10000 / criteria.length) / 100;
    const remainder = 100 - each * criteria.length;
    onChange(
      criteria.map((c, i) => ({
        ...c,
        weight: i === criteria.length - 1 ? each + remainder : each,
      })),
    );
  }

  return (
    <div
      className="author-card"
      style={{
        padding: 12,
        border: "1px solid var(--rule, #e1e5ee)",
        borderRadius: 8,
        background: "var(--card, #fff)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3 style={{ fontSize: 15, margin: 0 }}>
          Rubric (v{version})
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: isBalanced
                ? "var(--good, #10c47a)"
                : "var(--bad, #f43f5e)",
            }}
          >
            Σ weights: {totalWeight.toFixed(1)}%{!isBalanced && " (must = 100)"}
          </span>
          <button
            type="button"
            onClick={distributeEvenly}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              border: "1px solid var(--rule-2, #e1e5ee)",
              background: "transparent",
              color: "var(--ink-2, #B8C5E0)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Distribute evenly
          </button>
        </div>
      </div>

      {criteria.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.7, fontStyle: "italic" }}>
          No criteria yet. Add 2-5 criteria (each is a content check, NOT a
          mark).
        </p>
      )}

      {criteria.map((c, idx) => (
        <div
          key={c.id}
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 100px 1fr 40px",
            gap: 8,
            padding: 8,
            marginBottom: 8,
            border: "1px solid var(--rule, #f0f2f6)",
            borderRadius: 4,
            alignItems: "start",
          }}
        >
          <input
            value={c.id}
            onChange={(e) => update(idx, { id: e.target.value })}
            placeholder="id"
            style={{
              padding: 4,
              border: "1px solid var(--rule, #e1e5ee)",
              borderRadius: 3,
              fontSize: 12,
              fontFamily: "monospace",
            }}
          />
          <input
            value={c.text}
            onChange={(e) => update(idx, { text: e.target.value })}
            placeholder='Criterion text — e.g. "Defines federalism correctly"'
            style={{
              padding: 4,
              border: "1px solid var(--rule, #e1e5ee)",
              borderRadius: 3,
              fontSize: 13,
            }}
          />
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={c.weight}
            onChange={(e) =>
              update(idx, { weight: parseFloat(e.target.value) || 0 })
            }
            style={{
              padding: 4,
              border: "1px solid var(--rule, #e1e5ee)",
              borderRadius: 3,
              fontSize: 13,
              textAlign: "right",
              fontFamily: "monospace",
            }}
          />
          <input
            value={keywordsRaw[c.id] ?? c.keywords.join(", ")}
            onChange={(e) => {
              const raw = e.target.value;
              setKeywordsRaw({ ...keywordsRaw, [c.id]: raw });
              const parsed = raw
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              update(idx, { keywords: parsed });
            }}
            placeholder="keywords (comma-separated)"
            style={{
              padding: 4,
              border: "1px solid var(--rule, #e1e5ee)",
              borderRadius: 3,
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            style={{
              padding: 4,
              background: "transparent",
              border: "1px solid var(--bad, #f43f5e)",
              color: "var(--bad, #f43f5e)",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addCriterion}
        style={{
          marginTop: 8,
          padding: "6px 12px",
          background: "var(--info, #4f87f6)",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        + Add criterion
      </button>
    </div>
  );
}