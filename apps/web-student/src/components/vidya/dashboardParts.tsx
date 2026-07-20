// Dashboard mini-components used by the Vidya v1 rebuilds.
//
// Spec: docs/02-design/design-system/04_components.md
//       + the 8-screen mockup set delivered with Vidya v1.
//
// Each component is pure (no data fetch). The owning page passes
// shaped data in via props. Style classes are scoped (vidya-*) so
// they don't collide with the legacy Aurora chrome.

import { useMemo } from "react";

/* ─────────────────────────────────────────────────────────────
   ActivityHeatmap — 12 weeks × 5 days mastery activity grid.
   Values in [0, 1]; the cell uses --accent at varying alpha.
   ───────────────────────────────────────────────────────────── */

export interface ActivityHeatmapProps {
  /** Flat list of weeklyDays × weekCount cells, oldest first. */
  cells: number[];
  weeks?: number;
  daysPerWeek?: number;
}

export function ActivityHeatmap({
  cells,
  weeks = 12,
  daysPerWeek = 5,
}: ActivityHeatmapProps) {
  const padded = useMemo(() => {
    const total = weeks * daysPerWeek;
    const out = cells.slice(0, total);
    while (out.length < total) out.unshift(0);
    return out;
  }, [cells, weeks, daysPerWeek]);

  return (
    <section className="vidya-heatmap" aria-label="Last 12 weeks activity">
      <div className="vidya-heatmap__head">
        <span className="vidya-heatmap__title">Activity</span>
      </div>
      <div className="vidya-heatmap__sub">Last 12 weeks</div>
      <div className="vidya-heatmap__grid" role="img" aria-label="Activity heatmap">
        {padded.map((v, i) => {
          const alpha = v <= 0 ? 0 : Math.min(1, 0.18 + v * 0.82);
          return (
            <span
              key={i}
              className="vidya-heatmap__cell"
              style={
                v > 0
                  ? { background: `color-mix(in oklch, var(--accent) ${alpha * 100}%, var(--paper-2))` }
                  : undefined
              }
              title={`${Math.round(v * 100)}%`}
            />
          );
        })}
      </div>
      <div className="vidya-heatmap__legend">
        <span>Less</span>
        <span className="vidya-heatmap__legend-cells">
          <span style={{ background: "var(--paper-2)" }} />
          <span style={{ background: "color-mix(in oklch, var(--accent) 30%, var(--paper-2))" }} />
          <span style={{ background: "color-mix(in oklch, var(--accent) 55%, var(--paper-2))" }} />
          <span style={{ background: "color-mix(in oklch, var(--accent) 80%, var(--paper-2))" }} />
          <span style={{ background: "var(--accent)" }} />
        </span>
        <span>More</span>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   GoalBar — Have / Need progress bar used on the Exam Dashboard.
   Renders the gap, target tick, and "Have N / Need N" pill.
   ───────────────────────────────────────────────────────────── */

export interface GoalBarProps {
  subject: string;
  have: number;
  need: number;
  max?: number;
  /** Tint color for the bar fill (subject hue). */
  color?: string;
}

export function GoalBar({ subject, have, need, max = 900, color }: GoalBarProps) {
  const havePct = Math.min(100, (have / max) * 100);
  const needPct = Math.min(100, (need / max) * 100);
  const pct = Math.round((have / need) * 100);
  const tint = color ?? "var(--accent)";
  return (
    <div className="vidya-goal">
      <div className="vidya-goal__head">
        <span className="vidya-goal__subject">{subject}</span>
        <span className="vidya-goal__pct">{pct}%</span>
      </div>
      <div className="vidya-goal__bar">
        <span
          className="vidya-goal__fill"
          style={{ width: `${havePct}%`, background: tint }}
        />
        <span
          className="vidya-goal__tick"
          style={{ left: `${needPct}%` }}
          aria-hidden
        />
      </div>
      <div className="vidya-goal__meta">
        <span>Have {have}</span>
        <span>Need {need}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   QuestionMap — 12-cell grid for the AI Practice right rail.
   Status: pending | correct | wrong | active.
   ───────────────────────────────────────────────────────────── */

export type QMapState = "pending" | "correct" | "wrong" | "skipped" | "active";

export interface QuestionMapProps {
  items: Array<{ index: number; state: QMapState; label?: string }>;
  onJump?: (index: number) => void;
}

export function QuestionMap({ items, onJump }: QuestionMapProps) {
  return (
    <section className="vidya-qmap" aria-label="Question map">
      <div className="vidya-qmap__title">Question map</div>
      <div className="vidya-qmap__grid">
        {items.map((it) => (
          <button
            key={it.index}
            type="button"
            className={`vidya-qmap__cell vidya-qmap__cell--${it.state}`}
            onClick={() => onJump?.(it.index)}
            aria-label={`Question ${it.index + 1} ${it.state}`}
            aria-current={it.state === "active" ? "true" : undefined}
          >
            {it.label ?? it.index + 1}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   TimeDistributionBars — 4 bins (<30s, 30-60s, 60-90s, >90s).
   Mockup colors: good / accent / warn / bad.
   ───────────────────────────────────────────────────────────── */

export interface TimeDistributionBarsProps {
  bins: { under30: number; r30to60: number; r60to90: number; over90: number };
}

export function TimeDistributionBars({ bins }: TimeDistributionBarsProps) {
  const items = [
    { label: "<30s", count: bins.under30, color: "var(--good)" },
    { label: "30-60s", count: bins.r30to60, color: "var(--accent)" },
    { label: "60-90s", count: bins.r60to90, color: "var(--warn)" },
    { label: ">90s", count: bins.over90, color: "var(--bad)" },
  ];
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <section className="vidya-timed" aria-label="Time per question distribution">
      <div className="vidya-timed__head">
        <span className="vidya-timed__title">Time per question</span>
        <span className="vidya-timed__sub">Distribution</span>
      </div>
      <div className="vidya-timed__bars">
        {items.map((it) => {
          const h = (it.count / max) * 64;
          return (
            <div className="vidya-timed__col" key={it.label}>
              <span className="vidya-timed__count">{it.count}</span>
              <span
                className="vidya-timed__bar"
                style={{ height: `${h}px`, background: it.color }}
              />
              <span className="vidya-timed__label">{it.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   SubjectCoverage — 5-bucket mastery distribution bar.
   Mockup: 88 / 124 chapters with mastered / strong / dev / weak / not started.
   ───────────────────────────────────────────────────────────── */

export interface SubjectCoverageProps {
  total: number;
  buckets: {
    mastered: number;
    strong: number;
    dev: number;
    weak: number;
    none: number;
  };
}

export function SubjectCoverage({ total, buckets }: SubjectCoverageProps) {
  const segs = [
    { key: "mastered", label: "Mastered", color: "var(--m-mastered)", count: buckets.mastered, range: "(0.90+)" },
    { key: "strong",   label: "Strong",   color: "var(--m-strong)",   count: buckets.strong,   range: "(0.70-0.89)" },
    { key: "dev",      label: "Developing", color: "var(--m-dev)",    count: buckets.dev,      range: "(0.40-0.69)" },
    { key: "weak",     label: "Weak",     color: "var(--m-weak)",     count: buckets.weak,     range: "(0.01-0.39)" },
    { key: "none",     label: "Not started", color: "var(--m-none)",  count: buckets.none,     range: "(0.00)" },
  ] as const;
  const totalSafe = Math.max(1, total);
  return (
    <section className="vidya-coverage">
      <div className="vidya-coverage__head">
        <span className="vidya-coverage__title">Syllabus coverage</span>
        <span className="vidya-coverage__count">
          {buckets.mastered + buckets.strong + buckets.dev + buckets.weak} / {total} chapters
        </span>
      </div>
      <div className="vidya-coverage__bar" role="img" aria-label="Syllabus coverage distribution">
        {segs.map((s) => {
          const w = (s.count / totalSafe) * 100;
          if (w <= 0) return null;
          return (
            <span
              key={s.key}
              className="vidya-coverage__seg"
              style={{ width: `${w}%`, background: s.color }}
              title={`${s.label}: ${s.count}`}
            />
          );
        })}
      </div>
      <ul className="vidya-coverage__legend">
        {segs.map((s) => (
          <li key={s.key}>
            <span className="vidya-coverage__swatch" style={{ background: s.color }} />
            <span className="vidya-coverage__legend-label">{s.label}</span>
            <span className="vidya-coverage__legend-range">{s.range}</span>
            <span className="vidya-coverage__legend-count">{s.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
