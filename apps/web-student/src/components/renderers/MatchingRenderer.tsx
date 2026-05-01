import type { ReactNode } from "react";
import type { Renderer } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Matching family renderers (P5-S59).
//
// Covers: MATCH_THE_FOLLOWING · SEQUENCING · CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────

export interface MatchPayload {
  stem: string;
  list_a: { id: string; text: string }[];
  list_b: { id: string; text: string }[];
  explanation?: string;
}

export interface MatchResponse {
  pairs: { left_id: string; right_id: string }[];
}

export const MatchTheFollowingRenderer: Renderer<MatchPayload, MatchResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const pairs = new Map<string, string>(
    (value?.pairs ?? []).map((p) => [p.left_id, p.right_id]),
  );
  function setPair(leftId: string, rightId: string) {
    const next = new Map(pairs);
    if (rightId === "") next.delete(leftId);
    else next.set(leftId, rightId);
    onChange({
      pairs: Array.from(next.entries()).map(([left_id, right_id]) => ({
        left_id,
        right_id,
      })),
    });
  }
  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border, #e1e5ee)" }}>
            <th style={{ textAlign: "left", padding: 8 }}>List A</th>
            <th style={{ textAlign: "left", padding: 8 }}>Match to</th>
          </tr>
        </thead>
        <tbody>
          {payload.list_a.map((left) => (
            <tr
              key={left.id}
              style={{ borderBottom: "1px solid var(--border-subtle, #f0f2f6)" }}
            >
              <td style={{ padding: 8 }}>
                <strong>{left.id}.</strong> {left.text}
              </td>
              <td style={{ padding: 8 }}>
                <select
                  value={pairs.get(left.id) ?? ""}
                  onChange={(e) => setPair(left.id, e.target.value)}
                  disabled={disabled}
                  style={{
                    padding: 6,
                    border: "1px solid var(--border, #e1e5ee)",
                    borderRadius: 4,
                    minWidth: 200,
                  }}
                >
                  <option value="">— pick —</option>
                  {payload.list_b.map((right) => (
                    <option key={right.id} value={right.id}>
                      {right.id}. {right.text}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export interface SequencingPayload {
  stem: string;
  items: { id: string; text: string }[];
  explanation?: string;
}

export interface SequencingResponse {
  ordered_ids: string[];
}

export const SequencingRenderer: Renderer<SequencingPayload, SequencingResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const order = value?.ordered_ids ?? payload.items.map((it) => it.id);

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange({ ordered_ids: next });
  }
  function moveDown(idx: number) {
    if (idx === order.length - 1) return;
    const next = [...order];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    onChange({ ordered_ids: next });
  }

  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {order.map((id, idx) => {
          const item = payload.items.find((it) => it.id === id);
          return (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                border: "1px solid var(--border, #e1e5ee)",
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.7 }}>
                {idx + 1}.
              </span>
              <span style={{ flex: 1 }}>{item?.text}</span>
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={disabled || idx === 0}
                style={{
                  padding: "4px 10px",
                  border: "1px solid var(--border, #e1e5ee)",
                  borderRadius: 4,
                  background: "white",
                  cursor: disabled || idx === 0 ? "not-allowed" : "pointer",
                }}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={disabled || idx === order.length - 1}
                style={{
                  padding: "4px 10px",
                  border: "1px solid var(--border, #e1e5ee)",
                  borderRadius: 4,
                  background: "white",
                  cursor:
                    disabled || idx === order.length - 1
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                ↓
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export interface ClassificationPayload {
  stem: string;
  items: { id: string; text: string }[];
  categories: { id: string; label: string }[];
  explanation?: string;
}

export interface ClassificationResponse {
  assignments: { item_id: string; category_id: string }[];
}

export const ClassificationRenderer: Renderer<ClassificationPayload, ClassificationResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const map = new Map<string, string>(
    (value?.assignments ?? []).map((a) => [a.item_id, a.category_id]),
  );
  function setAssignment(itemId: string, categoryId: string) {
    const next = new Map(map);
    if (categoryId === "") next.delete(itemId);
    else next.set(itemId, categoryId);
    onChange({
      assignments: Array.from(next.entries()).map(([item_id, cat]) => ({
        item_id,
        category_id: cat,
      })),
    });
  }
  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {payload.items.map((it) => (
          <div
            key={it.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 240px",
              gap: 12,
              padding: 8,
              border: "1px solid var(--border-subtle, #f0f2f6)",
              borderRadius: 6,
            }}
          >
            <span>{it.text}</span>
            <select
              value={map.get(it.id) ?? ""}
              onChange={(e) => setAssignment(it.id, e.target.value)}
              disabled={disabled}
              style={{
                padding: 6,
                border: "1px solid var(--border, #e1e5ee)",
                borderRadius: 4,
              }}
            >
              <option value="">— pick category —</option>
              {payload.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};
