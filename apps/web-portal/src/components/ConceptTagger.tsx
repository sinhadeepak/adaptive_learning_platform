import { useState } from "react";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Concept tagger — multi-select against the concept tree, with prereq-
// coverage warning.
//
// Per Phase 5 build plan §"Concept-tag backfill": the auto-migration
// tagged every question to its topic-root concept. Authors refine to
// finer-grain concepts via this tagger; submit-time AI quality check
// surfaces a warning when author tags drift from what the AI sees the
// question testing.
//
// v1: free-text concept entry with role discriminator (primary /
// prerequisite / formula_invoked / distractor_targets). The full
// concept-tree picker against catalog_schema.concepts lands when the
// catalog tree endpoint exposes the concept hierarchy (currently
// topic-grain only).
// ─────────────────────────────────────────────────────────────────────────

export interface ConceptTag {
  conceptId: string;
  role: "primary" | "prerequisite" | "formula_invoked" | "distractor_targets";
}

interface ConceptTaggerProps {
  tags: ConceptTag[];
  onChange: (tags: ConceptTag[]) => void;
  prereqMissingIds?: string[];
}

export function ConceptTagger({
  tags,
  onChange,
  prereqMissingIds,
}: ConceptTaggerProps): ReactNode {
  const [pending, setPending] = useState("");
  const [pendingRole, setPendingRole] = useState<ConceptTag["role"]>("primary");

  const hasPrimary = tags.some((t) => t.role === "primary");

  function add() {
    if (!pending.trim()) return;
    if (tags.some((t) => t.conceptId === pending && t.role === pendingRole)) return;
    onChange([...tags, { conceptId: pending.trim(), role: pendingRole }]);
    setPending("");
  }

  function remove(idx: number) {
    onChange(tags.filter((_, i) => i !== idx));
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
          marginBottom: 8,
        }}
      >
        <h3 style={{ fontSize: 15, margin: 0 }}>Concept tags</h3>
        {!hasPrimary && (
          <span
            style={{
              fontSize: 12,
              color: "var(--warn, #f59e0b)",
            }}
          >
            ⚠ Add at least one <strong>primary</strong> concept
          </span>
        )}
      </div>

      {tags.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.7, fontStyle: "italic" }}>
          No tags. The AI quality check at submit time compares your tags to
          what it sees the question testing — drift surfaces a warning.
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {tags.map((t, idx) => (
          <span
            key={idx}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              background: roleBg(t.role),
              color: roleFg(t.role),
              borderRadius: 12,
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600 }}>{t.role}</span>
            <span style={{ fontFamily: "monospace" }}>{t.conceptId}</span>
            <button
              type="button"
              onClick={() => remove(idx)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                padding: 0,
                color: "inherit",
                opacity: 0.7,
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={pendingRole}
          onChange={(e) => setPendingRole(e.target.value as ConceptTag["role"])}
          style={{
            padding: "6px 8px",
            border: "1px solid var(--rule, #e1e5ee)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          <option value="primary">primary</option>
          <option value="prerequisite">prerequisite</option>
          <option value="formula_invoked">formula_invoked</option>
          <option value="distractor_targets">distractor_targets</option>
        </select>
        <input
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="concept-uuid or slug (e.g. 'newton-second-law')"
          style={{
            flex: 1,
            padding: "6px 8px",
            border: "1px solid var(--rule, #e1e5ee)",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "monospace",
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!pending.trim()}
          style={{
            padding: "6px 16px",
            background: pending.trim()
              ? "var(--info, #4f87f6)"
              : "var(--ink-4, #cbd5e0)",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: pending.trim() ? "pointer" : "not-allowed",
            fontSize: 13,
          }}
        >
          Add tag
        </button>
      </div>

      {prereqMissingIds && prereqMissingIds.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: "var(--warn-soft, #fef3c7)",
            color: "var(--gold-2, #92400e)",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          ⚠ <strong>Prereq coverage:</strong> Your primary concept depends on{" "}
          {prereqMissingIds.length} prereq{prereqMissingIds.length === 1 ? "" : "s"}{" "}
          you haven't tagged: {prereqMissingIds.slice(0, 3).join(", ")}
          {prereqMissingIds.length > 3 && "…"}
        </div>
      )}
    </div>
  );
}

function roleBg(role: ConceptTag["role"]): string {
  switch (role) {
    case "primary": return "var(--info-soft, #dbeafe)";
    case "prerequisite": return "var(--warn-soft, #fef3c7)";
    case "formula_invoked": return "var(--accent-soft, #ede9fe)";
    case "distractor_targets": return "var(--paper-2, #f3f4f6)";
  }
}

function roleFg(role: ConceptTag["role"]): string {
  switch (role) {
    case "primary": return "var(--info, #4f87f6)";
    case "prerequisite": return "var(--gold-2, #92400e)";
    case "formula_invoked": return "var(--accent, #7c3aed)";
    case "distractor_targets": return "var(--ink)";
  }
}