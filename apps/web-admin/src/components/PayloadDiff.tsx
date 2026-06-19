// apps/web-admin/src/components/PayloadDiff.tsx
// Path-driven, editable side-by-side source ↔ translation field viewer
// for the bulk verify screen. Iterates the question type's
// `translatablePaths` (expanding `[*]` wildcards), resolves each path in
// both payloads, and renders an editable target textarea.

export interface PayloadDiffProps {
  paths: string[];
  source: Record<string, unknown>;
  translation: Record<string, unknown>;
  editable?: boolean;
  onEdit?: (path: string, value: string) => void;
}

// Resolve a dotted/indexed path like "options[0].text" against an object.
function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

// Immutably set a value at a dotted/indexed path like "options[0].text".
// Clones each traversed level (objects via {...}, arrays via [...]) so the
// original object is never mutated. Missing intermediate nodes are created
// as arrays (when the next segment is numeric) or plain objects.
export function setAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);

  function recurse(cur: unknown, depth: number): unknown {
    const key = parts[depth];
    if (depth === parts.length - 1) {
      // Leaf: clone the container and set the value at this key.
      if (Array.isArray(cur)) {
        const arr = [...cur];
        arr[Number(key)] = value;
        return arr;
      }
      return { ...(cur as Record<string, unknown>), [key]: value };
    }
    // Intermediate node: determine what type to create if missing.
    const nextKeyIsNumeric = /^\d+$/.test(parts[depth + 1]);
    if (Array.isArray(cur)) {
      const arr = [...cur];
      arr[Number(key)] = recurse(
        arr[Number(key)] ?? (nextKeyIsNumeric ? [] : {}),
        depth + 1,
      );
      return arr;
    }
    const rec = (cur ?? {}) as Record<string, unknown>;
    return {
      ...rec,
      [key]: recurse(rec[key] ?? (nextKeyIsNumeric ? [] : {}), depth + 1),
    };
  }

  return recurse(obj, 0) as Record<string, unknown>;
}

// Expand wildcard paths ("options[*].text") against the source array length.
function expandPaths(paths: string[], source: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const path of paths) {
    const m = path.match(/^(.*)\[\*\](.*)$/);
    if (!m) {
      out.push(path);
      continue;
    }
    const [, head, tail] = m;
    const arr = getAtPath(source, head);
    const len = Array.isArray(arr) ? arr.length : 0;
    for (let i = 0; i < len; i++) out.push(`${head}[${i}]${tail}`);
  }
  return out;
}

export function PayloadDiff({ paths, source, translation, editable, onEdit }: PayloadDiffProps) {
  const concrete = expandPaths(paths, source);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {concrete.map((path) => {
        const src = getAtPath(source, path);
        const tr = getAtPath(translation, path);
        return (
          <div key={path} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono, monospace)" }}>{path}</div>
              <div>{String(src ?? "")}</div>
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--rule)", borderRadius: 4, padding: 8 }}>
              {editable ? (
                <textarea
                  defaultValue={String(tr ?? "")}
                  onBlur={(e) => onEdit?.(path, e.target.value)}
                  aria-label={`edit ${path}`}
                  style={{ width: "100%", minHeight: 48, background: "var(--paper-2)", color: "var(--ink)", border: "1px solid var(--rule)", borderRadius: 4 }}
                />
              ) : (
                <div>{String(tr ?? "")}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
