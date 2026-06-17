// Weekly Narrative client (Phase 6 S53).
//
// Backed by the alp-learning routes shipped in 420815a:
//   GET  /adaptive/weekly-narrative/current/{user_id}
//   POST /adaptive/weekly-narrative/generate
//
// Schema mirrors the strict JSON-schema enforced server-side
// (services/learning/src/learning/adaptive/weekly_narrative.py).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S53
// ADR:  docs/adr/0021-hybrid-weekly-narrative.md

import { auth } from "./api";

// ─── Narrative shape ──────────────────────────────────────────────

export interface NarrativeSection {
  text: string;
  /**
   * Compact citation set by the LLM (e.g.
   * `concept_mastery_delta:newton-3:0.58→0.71`). Used by the
   * "Why am I seeing this?" drill-down to route the student back
   * to the underlying signal. Optional on every section.
   */
  data_link?: string;
}

export interface WeekAheadSection extends NarrativeSection {
  /** Imperative action bullets — 1 to 4 items. */
  actions: string[];
}

export interface Narrative {
  improved: NarrativeSection;
  slipping: NarrativeSection;
  hidden_pattern: NarrativeSection;
  forecast: NarrativeSection;
  week_ahead: WeekAheadSection;
}

export interface NarrativeRecord {
  id: string;
  userId: string;
  weekStart: string; // ISO date, monday-of-week
  narrative: Narrative;
  source: "ai" | "heuristic";
  model: string | null;
  promptTemplateId: string;
  promptTemplateVersion: string;
  isDelta: boolean;
  deltaTrigger: string | null;
}

// `current` may return either a populated record or the "not generated
// yet" sentinel. Discriminate on `narrative !== null`.
export type CurrentWeeklyNarrative =
  | { kind: "found"; record: NarrativeRecord }
  | { kind: "absent"; reason: string };

// ─── Wire format → camelCase mapping ──────────────────────────────

interface RawNarrativeRecord {
  id: string;
  user_id: string;
  week_start: string;
  narrative: Narrative;
  source: "ai" | "heuristic";
  model: string | null;
  prompt_template_id: string;
  prompt_template_version: string;
  is_delta: boolean;
  delta_trigger: string | null;
  // `cache` flag isn't surfaced — server-only telemetry.
}

interface RawCurrentResponse {
  // FastAPI returns either the record body OR { narrative: null, reason }.
  // Use the discriminator to tell them apart.
  narrative?: Narrative | null;
  reason?: string;
  id?: string;
  user_id?: string;
  week_start?: string;
  source?: "ai" | "heuristic";
  model?: string | null;
  prompt_template_id?: string;
  prompt_template_version?: string;
  is_delta?: boolean;
  delta_trigger?: string | null;
}

function camelizeRecord(raw: RawNarrativeRecord): NarrativeRecord {
  return {
    id: raw.id,
    userId: raw.user_id,
    weekStart: raw.week_start,
    narrative: raw.narrative,
    source: raw.source,
    model: raw.model ?? null,
    promptTemplateId: raw.prompt_template_id,
    promptTemplateVersion: raw.prompt_template_version,
    isDelta: raw.is_delta,
    deltaTrigger: raw.delta_trigger ?? null,
  };
}

export async function fetchCurrentWeeklyNarrative(
  userId: string,
): Promise<CurrentWeeklyNarrative> {
  const r = await auth.fetch(
    `/api/v1/adaptive/weekly-narrative/current/${userId}`,
  );
  if (!r.ok) {
    throw new Error(`weekly narrative fetch failed: HTTP ${r.status}`);
  }
  const raw = (await r.json()) as RawCurrentResponse;
  if (raw.narrative == null) {
    return { kind: "absent", reason: raw.reason ?? "not_generated_yet" };
  }
  // Server returns the full record when narrative is present. Cast and
  // map. Defensive: if the server ever omits one of the fields, the
  // typing forces us to handle it.
  return {
    kind: "found",
    record: camelizeRecord(raw as RawNarrativeRecord),
  };
}

export interface GenerateOptions {
  weekStart?: string; // ISO date — defaults to monday-of-this-week server-side
  signals?: Record<string, unknown>;
  isDelta?: boolean;
  deltaTrigger?: string;
}

export async function generateWeeklyNarrative(
  userId: string,
  opts: GenerateOptions = {},
): Promise<NarrativeRecord> {
  const body: Record<string, unknown> = { user_id: userId };
  if (opts.weekStart) body.week_start = opts.weekStart;
  if (opts.signals) body.signals = opts.signals;
  if (opts.isDelta != null) body.is_delta = opts.isDelta;
  if (opts.deltaTrigger) body.delta_trigger = opts.deltaTrigger;

  const r = await auth.fetch(
    "/api/v1/adaptive/weekly-narrative/generate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) {
    throw new Error(`weekly narrative generate failed: HTTP ${r.status}`);
  }
  return camelizeRecord((await r.json()) as RawNarrativeRecord);
}

// ─── data_link drill-down ────────────────────────────────────────
//
// LLM emits citations like:
//   "concept_mastery_delta:newton-3:0.58→0.71"
//   "topic_decay:thermodynamics-2:14d"
//   "error_pattern:silly_mistake:n=12"
//   "time_distribution:morning:14%"
//
// We split on the FIRST colon to keep the value portion intact even
// when it itself contains colons (rare, but defensive).

export interface ParsedDataLink {
  source: string;
  key?: string;
  value?: string;
  href: string;
  label: string;
}

const SOURCE_ROUTES: Record<string, { href: string; label: string }> = {
  concept_mastery_delta: { href: "/concept-profile", label: "See concept profile" },
  topic_decay: { href: "/syllabus", label: "See syllabus coverage" },
  error_pattern: { href: "/diagnostic-deep-dive", label: "Open the error pattern report" },
  weak_concept: { href: "/diagnostic-deep-dive", label: "See weak concepts" },
  readiness: { href: "/insights", label: "See readiness band" },
  time_distribution: { href: "/insights", label: "Open insights hub" },
  fluency: { href: "/concept-profile", label: "See fluency" },
  calibration: { href: "/concept-profile", label: "See calibration" },
};

export function parseDataLink(dataLink?: string): ParsedDataLink | null {
  if (!dataLink) return null;
  const trimmed = dataLink.trim();
  if (trimmed.length === 0) return null;

  // Split on FIRST colon — keeps composite values intact.
  const firstColon = trimmed.indexOf(":");
  const source = firstColon === -1 ? trimmed : trimmed.slice(0, firstColon);
  const rest = firstColon === -1 ? "" : trimmed.slice(firstColon + 1);

  // Split rest on first colon too — key:value or just key.
  let key: string | undefined;
  let value: string | undefined;
  if (rest.length > 0) {
    const c2 = rest.indexOf(":");
    if (c2 === -1) {
      key = rest;
    } else {
      key = rest.slice(0, c2);
      value = rest.slice(c2 + 1);
    }
  }

  const route = SOURCE_ROUTES[source] ?? {
    href: "/insights",
    label: "Open insights",
  };

  return {
    source,
    key,
    value,
    href: route.href,
    label: route.label,
  };
}

// ─── Display helpers ─────────────────────────────────────────────

export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return weekStart;
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Exposed for testing only — camelize a wire record. */
export const _camelizeRecordForTest = camelizeRecord;
