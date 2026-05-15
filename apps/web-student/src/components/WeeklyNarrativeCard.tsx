// WeeklyNarrativeCard — 5-section weekly learning narrative (P6 S53).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S53
// ADR:  docs/adr/0021-hybrid-weekly-narrative.md
//
// Composition:
//   ✦ Weekly narrative · week-range          (ai|heuristic chip)
//   ─────────────────────────────────────────
//   IMPROVED        — 1 sentence            (Why? →)
//   SLIPPING        — 1 sentence            (Why? →)
//   HIDDEN PATTERN  — 1 sentence            (Why? →)
//   FORECAST        — 1 sentence            (Why? →)
//   WEEK AHEAD      — 1 sentence + 1-4 actions
//
// Each "Why am I seeing this?" link routes back to the Phase-5
// surface inferred from the section's `data_link` citation. When the
// citation is absent (heuristic fallback often omits it), the link
// is suppressed — never fake the source.

import { Link } from "react-router-dom";

import { Pill } from "./dashboard";
import {
  formatWeekRange,
  parseDataLink,
  type Narrative,
  type NarrativeRecord,
  type NarrativeSection,
  type WeekAheadSection,
} from "../lib/weekly-narrative";

export interface WeeklyNarrativeCardProps {
  record: NarrativeRecord;
  /**
   * When true, mounts inside a smaller surface (e.g. embedded on Home
   * below the daily plan). Default expanded — full card chrome.
   */
  compact?: boolean;
}

export function WeeklyNarrativeCard({
  record,
  compact = false,
}: WeeklyNarrativeCardProps) {
  const n: Narrative = record.narrative;
  const isAi = record.source === "ai";
  return (
    <article
      className={`weekly-narrative-card${compact ? " is-compact" : ""}`}
      aria-label="Weekly learning narrative"
    >
      <header className="wn-head">
        <div className="wn-title-row">
          <span className="wn-glyph">✦</span>
          <h2 className="wn-title">Weekly narrative</h2>
          <span className="wn-range">{formatWeekRange(record.weekStart)}</span>
          <Pill tone={isAi ? "info" : "warning"}>
            {isAi ? "AI" : "Heuristic"}
          </Pill>
        </div>
        {record.isDelta && record.deltaTrigger && (
          <div className="wn-delta-eyebrow">
            Δ Mid-week update — {record.deltaTrigger}
          </div>
        )}
      </header>

      <SectionRow
        eyebrow="Improved"
        tone="success"
        section={n.improved}
      />
      <SectionRow
        eyebrow="Slipping"
        tone="warning"
        section={n.slipping}
      />
      <SectionRow
        eyebrow="Hidden pattern"
        tone="info"
        section={n.hidden_pattern}
      />
      <SectionRow
        eyebrow="Forecast"
        tone="info"
        section={n.forecast}
      />
      <WeekAheadRow section={n.week_ahead} />
    </article>
  );
}

// ─── Per-section rows ────────────────────────────────────────────────

type SectionTone = "success" | "warning" | "info";

function SectionRow({
  eyebrow,
  tone,
  section,
}: {
  eyebrow: string;
  tone: SectionTone;
  section: NarrativeSection;
}) {
  const link = parseDataLink(section.data_link);
  return (
    <div className={`wn-section wn-section-${tone}`}>
      <div className="wn-eyebrow">{eyebrow}</div>
      <p className="wn-text">{section.text}</p>
      {link && (
        <Link to={link.href} className="wn-why">
          {link.label} →
        </Link>
      )}
    </div>
  );
}

function WeekAheadRow({ section }: { section: WeekAheadSection }) {
  const link = parseDataLink(section.data_link);
  return (
    <div className="wn-section wn-section-aurora">
      <div className="wn-eyebrow">Week ahead</div>
      <p className="wn-text">{section.text}</p>
      {section.actions.length > 0 && (
        <ul className="wn-actions">
          {section.actions.map((action, i) => (
            <li key={i}>
              <span className="wn-action-bullet" aria-hidden>
                ▸
              </span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
      )}
      {link && (
        <Link to={link.href} className="wn-why">
          {link.label} →
        </Link>
      )}
    </div>
  );
}

// ─── Empty-state ────────────────────────────────────────────────────

export interface WeeklyNarrativeEmptyProps {
  /** Called when the student taps "Generate" — caller wires to POST. */
  onGenerate?: () => void;
  /** True while the generate call is in flight. */
  generating?: boolean;
  /** When the page failed to load (network / 5xx), surface the message. */
  error?: string;
}

export function WeeklyNarrativeEmpty({
  onGenerate,
  generating = false,
  error,
}: WeeklyNarrativeEmptyProps) {
  return (
    <article
      className="weekly-narrative-card weekly-narrative-empty"
      aria-label="Weekly narrative — not yet generated"
    >
      <header className="wn-head">
        <div className="wn-title-row">
          <span className="wn-glyph">✦</span>
          <h2 className="wn-title">Weekly narrative</h2>
        </div>
      </header>
      <p className="wn-text wn-empty-copy">
        {error
          ? error
          : "We haven't written your weekly narrative yet. It's a 90-second " +
            "interpretation of your numbers — what improved, what's slipping, " +
            "and one thing to focus on next week."}
      </p>
      {onGenerate && !error && (
        <button
          type="button"
          className="wn-generate-btn"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? "Generating…" : "Generate narrative"}
        </button>
      )}
    </article>
  );
}
