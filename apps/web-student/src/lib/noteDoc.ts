// Pure helpers over the ProseMirror JSON we persist for a note.
export interface ProseMirrorDoc {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorDoc[];
  [k: string]: unknown;
}

export const EMPTY_DOC: ProseMirrorDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** Deep-copy `doc`, dropping every image node's transient `src` (keeping objectKey). */
export function stripTransientSrc(doc: ProseMirrorDoc): ProseMirrorDoc {
  const walk = (node: ProseMirrorDoc): ProseMirrorDoc => {
    const next: ProseMirrorDoc = { ...node };
    if (node.attrs) {
      next.attrs = { ...node.attrs };
      if (node.type === "image" && "src" in next.attrs) delete next.attrs.src;
    }
    if (node.content) next.content = node.content.map(walk);
    return next;
  };
  return walk(doc);
}

/** All image objectKeys in document order, deduped. */
export function collectObjectKeys(doc: ProseMirrorDoc): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (node: ProseMirrorDoc): void => {
    if (node.type === "image") {
      const key = node.attrs?.objectKey;
      if (typeof key === "string" && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return out;
}
