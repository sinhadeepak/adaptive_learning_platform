// examDiff — compares a re-analyzed exam proposal against the currently-loaded
// (baseline) one, by stable `code`, and produces a merged, status-tagged view
// for the Review screen. Removed items are re-injected so the admin sees what
// the AI dropped (and can Keep them).

export type DiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface TopicDraft {
  code: string;
  title: string;
  description: string | null;
}

export interface SubjectDraft {
  code: string;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  pool_code: string | null;
  topics: TopicDraft[];
}

export interface PoolDraft {
  code: string;
  name: string;
  description: string | null;
  pick_min: number;
  pick_max: number;
}

export interface ExamProposal {
  code: string;
  name: string;
  subtitle: string | null;
  pools: PoolDraft[];
  subjects: SubjectDraft[];
  notes: string | null;
}

export interface TopicDiff extends TopicDraft {
  _status: DiffStatus;
}

export interface SubjectDiff extends Omit<SubjectDraft, "topics"> {
  _status: DiffStatus;
  topics: TopicDiff[];
}

export interface ExamDiff {
  subjects: SubjectDiff[];
}

function topicChanged(a: TopicDraft, b: TopicDraft): boolean {
  return a.title !== b.title || (a.description ?? null) !== (b.description ?? null);
}

function subjectChanged(a: SubjectDraft, b: SubjectDraft): boolean {
  return (
    a.name !== b.name ||
    (a.description ?? null) !== (b.description ?? null) ||
    a.is_mandatory !== b.is_mandatory ||
    (a.pool_code ?? null) !== (b.pool_code ?? null)
  );
}

export function diffTopics(baseline: TopicDraft[], next: TopicDraft[]): TopicDiff[] {
  const baseByCode = new Map(baseline.map((t) => [t.code, t]));
  const nextCodes = new Set(next.map((t) => t.code));

  const out: TopicDiff[] = next.map((t) => {
    const prev = baseByCode.get(t.code);
    if (!prev) return { ...t, _status: "added" };
    return { ...t, _status: topicChanged(prev, t) ? "modified" : "unchanged" };
  });

  // Topics the AI dropped — re-inject tagged removed.
  for (const t of baseline) {
    if (!nextCodes.has(t.code)) out.push({ ...t, _status: "removed" });
  }
  return out;
}

// Merge a freshly AI-generated topic list into a subject's CURRENT topics
// (which may already carry diff fields). Strips diff-only fields from the
// current list to form a clean baseline, then diffs — so a per-subject
// regenerate produces the same added/modified/removed/Keep review as a
// full re-analyze.
export function mergeRegeneratedTopics(
  current: Array<TopicDraft & { _status?: DiffStatus; _kept?: boolean }>,
  aiTopics: TopicDraft[],
): TopicDiff[] {
  const baseline: TopicDraft[] = current.map((t) => ({
    code: t.code,
    title: t.title,
    description: t.description ?? null,
  }));
  return diffTopics(baseline, aiTopics);
}

export function diffExam(baseline: ExamProposal, next: ExamProposal): ExamDiff {
  const baseByCode = new Map(baseline.subjects.map((s) => [s.code, s]));
  const nextCodes = new Set(next.subjects.map((s) => s.code));

  const subjects: SubjectDiff[] = next.subjects.map((s) => {
    const prev = baseByCode.get(s.code);
    if (!prev) {
      return { ...s, _status: "added", topics: s.topics.map((t) => ({ ...t, _status: "added" })) };
    }
    return {
      ...s,
      _status: subjectChanged(prev, s) ? "modified" : "unchanged",
      topics: diffTopics(prev.topics, s.topics),
    };
  });

  // Subjects the AI dropped — re-inject tagged removed (all topics removed).
  for (const s of baseline.subjects) {
    if (!nextCodes.has(s.code)) {
      subjects.push({
        ...s,
        _status: "removed",
        topics: s.topics.map((t) => ({ ...t, _status: "removed" })),
      });
    }
  }

  return { subjects };
}
