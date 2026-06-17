// ReadinessBandCard — readiness band + recovery actions (Phase 6 S56).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S56
//
// Surfaces the user's current band (Approaching / On track / Behind /
// At risk) + the server-emitted recovery actions. Used on Home and
// Insights; hidden until the readiness fetch completes.

import { useEffect, useState } from "react";

import { Pill } from "./dashboard";
import {
  fetchReadinessBand,
  type ReadinessBandResult,
} from "../lib/readiness";
import {
  readinessBandLabel,
  readinessBandTone,
} from "../lib/insights";

export interface ReadinessBandCardProps {
  userId: string;
  targetScore?: number;
  daysToExam?: number;
}

export function ReadinessBandCard({
  userId,
  targetScore,
  daysToExam,
}: ReadinessBandCardProps) {
  const [data, setData] = useState<ReadinessBandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchReadinessBand(userId, {
          targetScore,
          daysToExam,
        });
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Couldn't load readiness band.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, targetScore, daysToExam]);

  if (error) {
    return (
      <section
        className="readiness-band-card readiness-band-error"
        role="alert"
      >
        Readiness unavailable — {error}
      </section>
    );
  }
  if (!data) return null;

  const pct = Math.round(data.readinessScore * 100);
  const targetPct = Math.round(data.targetScore * 100);

  return (
    <section
      className={`readiness-band-card readiness-band-${data.band}`}
      aria-label="Readiness band"
    >
      <header className="rb-head">
        <div>
          <div className="rb-eyebrow">Readiness band</div>
          <h3 className="rb-title">{readinessBandLabel(data.band)}</h3>
        </div>
        <Pill tone={readinessBandTone(data.band)}>{pct}%</Pill>
      </header>
      <div className="rb-meta">
        <span>Target {targetPct}%</span>
        <span>·</span>
        <span>{data.daysToExam} days to exam</span>
      </div>
      {data.actions.length > 0 && (
        <ul className="rb-actions">
          {data.actions.map((a, i) => (
            <li key={i}>
              <span className="rb-action-bullet" aria-hidden>
                ▸
              </span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
