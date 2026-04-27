// Shared per-exam display metadata used by every exam-picker surface
// (`/screening`, `/onboarding/exam`, `/exams/add`). The catalog API gives us
// id + code + name + subtitle; everything else (icon, subjects line,
// category pill) is keyed off the exam `code` here so all three pickers
// stay visually consistent.
//
// New exams added to the catalog still render gracefully — they fall back
// to a neutral treatment until added to this map.

export type ExamPillKind =
  | "medical"
  | "engineering"
  | "civil"
  | "board"
  | "management"
  | "coming";

export interface ExamMeta {
  icon: string;
  subjects: string;
  pillLabel: string;
  pillKind: ExamPillKind;
}

export const EXAM_META: Record<string, ExamMeta> = {
  NEET: {
    icon: "🔬",
    subjects: "Biology · Chemistry · Physics",
    pillLabel: "Medical Entrance",
    pillKind: "medical",
  },
  JEE_MAIN: {
    icon: "⚙️",
    subjects: "Maths · Physics · Chemistry",
    pillLabel: "Engineering",
    pillKind: "engineering",
  },
  JEE_ADVANCED: {
    icon: "🏛️",
    subjects: "IIT Entrance · All subjects",
    pillLabel: "Engineering",
    pillKind: "engineering",
  },
  UPSC_CSE: {
    icon: "📜",
    subjects: "GS · CSAT · Optional",
    pillLabel: "Civil Services",
    pillKind: "civil",
  },
  CBSE_12: {
    icon: "📚",
    subjects: "All streams",
    pillLabel: "Board Exam",
    pillKind: "board",
  },
  CAT: {
    icon: "📊",
    subjects: "QA · VARC · DILR",
    pillLabel: "MBA Entrance",
    pillKind: "management",
  },
};

// Slots the design promises but the catalog seed may not yet contain.
// Pickers render these as visible-but-disabled "Coming soon" tiles.
export const PLANNED_CODES = [
  "NEET",
  "JEE_MAIN",
  "JEE_ADVANCED",
  "UPSC_CSE",
  "CBSE_12",
];

export function metaFor(code: string, fallbackSubtitle?: string | null): ExamMeta {
  return (
    EXAM_META[code] ?? {
      icon: "📘",
      subjects: fallbackSubtitle ?? "—",
      pillLabel: "Available",
      pillKind: "engineering",
    }
  );
}

export function fallbackName(code: string): string {
  if (code === "JEE_ADVANCED") return "JEE Advanced";
  if (code === "CBSE_12") return "CBSE Class 12";
  return code;
}
