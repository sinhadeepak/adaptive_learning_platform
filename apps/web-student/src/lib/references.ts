// Sprint 34 (P4-S34) — pure helpers for the topic-detail reference panel.

export type ReferenceKind =
  | "ncert"
  | "textbook"
  | "video"
  | "derivation"
  | "formula_sheet";

export interface TopicReference {
  id: string;
  kind: ReferenceKind;
  title: string;
  url: string;
  position: number;
}

export interface KindGroup {
  kind: ReferenceKind;
  label: string;
  icon: string;
  references: TopicReference[];
}

const KIND_ORDER: ReferenceKind[] = [
  "ncert",
  "textbook",
  "derivation",
  "video",
  "formula_sheet",
];

const KIND_LABEL: Record<ReferenceKind, string> = {
  ncert: "NCERT",
  textbook: "Textbook",
  derivation: "Derivation",
  video: "Video",
  formula_sheet: "Formula sheet",
};

const KIND_ICON: Record<ReferenceKind, string> = {
  ncert: "📘",
  textbook: "📚",
  derivation: "📐",
  video: "🎬",
  formula_sheet: "📋",
};

/** Group references by kind, ordered by NCERT/textbook/derivation/video/
 *  formula_sheet. Empty groups are dropped. */
export function groupByKind(refs: TopicReference[]): KindGroup[] {
  const buckets: Record<ReferenceKind, TopicReference[]> = {
    ncert: [],
    textbook: [],
    derivation: [],
    video: [],
    formula_sheet: [],
  };
  for (const r of refs) {
    if (buckets[r.kind] === undefined) continue;
    buckets[r.kind].push(r);
  }
  return KIND_ORDER.filter((k) => buckets[k].length > 0).map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    icon: KIND_ICON[kind],
    references: buckets[kind].slice().sort((a, b) => a.position - b.position),
  }));
}
