// Sprint 20 (P3-S5) — Personalised next-step tile.
//
// Reads dropout risk + recommendations from alp-engagement and surfaces
// the appropriate CTA. Mountable on the home dashboard.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  type DropoutScore,
  type TopicRecommendation,
  predictive,
} from "../lib/api";

interface Props {
  userId: string;
}

const INTERVENTION_COPY: Record<string, { title: string; cta: string; ctaHref: string }> = {
  re_engagement_notification: {
    title: "Welcome back!",
    cta: "Try a 10-question warm-up →",
    ctaHref: "/practice",
  },
  suggest_tutor: {
    title: "Could a tutor help?",
    cta: "Browse tutors →",
    ctaHref: "/tutors",
  },
  lower_difficulty: {
    title: "Build the foundation",
    cta: "Drill an easier topic →",
    ctaHref: "/practice",
  },
};

export function PersonalisedNextStep({ userId }: Props) {
  const [dropout, setDropout] = useState<DropoutScore | null>(null);
  const [recs, setRecs] = useState<TopicRecommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([predictive.dropout(userId), predictive.recommendations(userId)])
      .then(([d, r]) => {
        setDropout(d);
        setRecs(r);
      })
      .catch((e) => setError((e as Error).message));
  }, [userId]);

  if (error) {
    return (
      <section style={{ padding: 12, color: "var(--text-muted)" }}>
        Personalised suggestions unavailable.
      </section>
    );
  }

  if (!dropout || recs === null) {
    return (
      <section style={{ padding: 16 }}>
        <p style={{ color: "var(--text-muted)" }}>Loading personalised next step…</p>
      </section>
    );
  }

  // High-risk dropout: surface the intervention CTA, recommendation as supplementary.
  const intervention = dropout.intervention_kind && dropout.intervention_kind !== "none"
    ? INTERVENTION_COPY[dropout.intervention_kind]
    : null;

  const topRec = recs[0];

  return (
    <section
      style={{
        padding: 20,
        // Per design-system tokens.css: --bg-surface2 (no hyphen) is the
        // dark-theme card surface. The earlier `--bg-surface-1` was a
        // typo that didn't resolve and fell back to white, making text
        // invisible on the dark theme.
        background: "var(--bg-surface2, #101A30)",
        color: "var(--text-primary)",
        border: `1px solid ${
          dropout.risk_band === "HIGH"
            ? "var(--color-red, #F43F5E)"
            : "var(--border, #1F2A3D)"
        }`,
        borderRadius: 12,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted, #94A3B8)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        For you
      </div>

      {intervention ? (
        <>
          <h2
            style={{
              margin: "8px 0",
              fontSize: 22,
              color: "var(--text-primary)",
            }}
          >
            {intervention.title}
          </h2>
          {topRec && (
            <p style={{ color: "var(--text-muted, #94A3B8)" }}>
              {topRec.reasonString}
            </p>
          )}
          <Link
            to={intervention.ctaHref}
            style={{ color: "var(--color-blue, #4F87F6)" }}
          >
            {intervention.cta}
          </Link>
        </>
      ) : topRec ? (
        <>
          <h2
            style={{
              margin: "8px 0",
              fontSize: 22,
              color: "var(--text-primary)",
            }}
          >
            Up next
          </h2>
          <p style={{ color: "var(--text-primary)" }}>
            {topRec.reasonString}
          </p>
          <Link
            to="/practice"
            style={{ color: "var(--color-blue, #4F87F6)" }}
          >
            Open practice →
          </Link>
        </>
      ) : (
        <p style={{ color: "var(--text-muted, #94A3B8)" }}>
          No personalised next step yet — start a practice session and we'll
          learn your pattern.
        </p>
      )}

      {recs.length > 1 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 12 }}>
            More suggestions ({recs.length - 1})
          </summary>
          <ul style={{ marginTop: 8 }}>
            {recs.slice(1).map((r) => (
              <li key={r.topicId} style={{ marginBottom: 4 }}>
                {r.reasonString}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
