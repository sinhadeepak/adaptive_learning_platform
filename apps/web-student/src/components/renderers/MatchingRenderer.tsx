import { useEffect } from "react";
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
          <tr style={{ borderBottom: "1px solid var(--rule, #e1e5ee)" }}>
            <th style={{ textAlign: "left", padding: 8 }}>List A</th>
            <th style={{ textAlign: "left", padding: 8 }}>Match to</th>
          </tr>
        </thead>
        <tbody>
          {(payload.list_a ?? []).map((left) => (
            <tr
              key={left.id}
              style={{ borderBottom: "1px solid var(--rule, #f0f2f6)" }}
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
                    border: "1px solid var(--rule, #e1e5ee)",
                    borderRadius: 4,
                    minWidth: 200,
                  }}
                >
                  <option value="">— pick —</option>
                  {(payload.list_b ?? []).map((right) => (
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
  stem?: string;
  // Two payload shapes accepted:
  //   1. `{id, text}[]` — original Phase-5 schema.
  //   2. `string[]` — seed-data shape; we synthesise stable ids from index.
  items: ({ id: string; text: string } | string)[];
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
  // Normalise items to {id, text}. Plain strings get a deterministic
  // id (`i0`, `i1`, …) so the response's ordered_ids stays stable across
  // re-renders.
  const normItems: { id: string; text: string }[] = (payload.items ?? []).map(
    (it, i) =>
      typeof it === "string" ? { id: `i${i}`, text: it } : it,
  );
  const order = value?.ordered_ids ?? normItems.map((it) => it.id);

  // Seed the default order as the response on mount (and whenever the item
  // set changes, e.g. the next question loads). Unlike match/classify whose
  // default state is "nothing picked", a sequencing list is shown already
  // ordered — that initial order is itself a valid answer. Without seeding,
  // a student who accepts the shown order never triggers onChange, so the
  // parent's responsePayload stays null and Submit is disabled. Guarded on
  // `!value` so it never clobbers a student's reorder or a graded answer.
  const defaultIds = normItems.map((it) => it.id).join("|");
  useEffect(() => {
    if (!disabled && !value) {
      onChange({ ordered_ids: normItems.map((it) => it.id) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultIds]);

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
      {payload.stem && (
        <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
          {payload.stem}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {order.map((id, idx) => {
          const item = normItems.find((it) => it.id === id);
          return (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                border: "1px solid var(--rule, #e1e5ee)",
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
                  border: "1px solid var(--rule, #e1e5ee)",
                  borderRadius: 4,
                  background: "var(--paper-2)",
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
                  border: "1px solid var(--rule, #e1e5ee)",
                  borderRadius: 4,
                  background: "var(--paper-2)",
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
  stem?: string;
  // Items: {id,text} or {text,category} (seed). We synthesise id from
  // index when missing.
  items: (
    | { id: string; text: string }
    | { text: string; category?: string }
  )[];
  // Categories: canonical {id,text}, legacy {id,label}, or plain string.
  categories: ({ id: string; text?: string; label?: string } | string)[];
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
  // Normalise both items and categories so the rest of the renderer
  // can speak the canonical {id, …} shape.
  const normItems: { id: string; text: string }[] = (payload.items ?? []).map(
    (it, i) => ({
      id: "id" in it && it.id ? it.id : `i${i}`,
      text: it.text,
    }),
  );
  const normCats: { id: string; label: string }[] = (payload.categories ?? []).map(
    (c, i) =>
      typeof c === "string"
        ? { id: `c${i}`, label: c }
        : { id: c.id, label: c.text ?? c.label ?? c.id },
  );

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
      {payload.stem && (
        <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
          {payload.stem}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {normItems.map((it) => (
          <div
            key={it.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 240px",
              gap: 12,
              padding: 8,
              border: "1px solid var(--rule, #f0f2f6)",
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
                border: "1px solid var(--rule, #e1e5ee)",
                borderRadius: 4,
              }}
            >
              <option value="">— pick category —</option>
              {normCats.map((c) => (
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