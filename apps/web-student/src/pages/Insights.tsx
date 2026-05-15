// Insights — Phase 6 S52 hub re-IA over existing analytics surfaces.
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S52
// ADR: docs/adr/0020-ux-copilot-scope-and-ia.md
//
// Three zones:
//   1. My State          — readiness band + concept mastery + decay
//   2. What This Means   — weak concepts + decay alerts
//   3. What To Do        — mission pending + revision due + plan preview
//
// Each tile carries a "Why am I seeing this?" deep link back to the
// underlying Phase-5 surface so the new IA never hides the source data.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";
import { useAuth } from "../lib/auth-provider";
import {
  decaySeverityLabel,
  fetchInsightsSnapshot,
  readinessBandLabel,
  readinessBandTone,
  type ConceptRow,
  type InsightsSnapshot,
  type ReadinessBand,
} from "../lib/insights";

export function Insights() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<InsightsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchInsightsSnapshot(user.id);
        if (!cancelled) setSnap(s);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Couldn't load insights.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (error) {
    return (
      <AppShell title="Insights">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      </AppShell>
    );
  }

  if (!snap) {
    return (
      <AppShell title="Insights">
        <SkeletonRows count={3} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Insights">
      <p className="insights-intro">
        A single read of where you are, what it means, and what to do next.
        Every tile links to the underlying signal — nothing is hidden.
      </p>

      {/* ── Zone 1: My State ────────────────────────────────────── */}
      <section className="insights-zone" aria-labelledby="zone-my-state">
        <header className="insights-zone-head">
          <h2 id="zone-my-state" className="insights-zone-title">
            My state
          </h2>
          <p className="insights-zone-sub">
            Where you are right now — readiness band, fresh mastery, and the
            concepts that are starting to fade.
          </p>
        </header>
        <div className="insights-grid">
          <ReadinessTile band={snap.myState.readiness?.band ?? null} score={snap.myState.readiness?.score ?? null} />
          <ConceptMasteryTile rows={snap.myState.conceptMastery} />
          <DecayTile rows={snap.myState.topicDecay} />
        </div>
      </section>

      {/* ── Zone 2: What This Means ─────────────────────────────── */}
      <section
        className="insights-zone"
        aria-labelledby="zone-what-this-means"
      >
        <header className="insights-zone-head">
          <h2 id="zone-what-this-means" className="insights-zone-title">
            What this means
          </h2>
          <p className="insights-zone-sub">
            The pattern in your data — weak concepts the engine can act on
            and decay alerts that need a recovery round.
          </p>
        </header>
        <div className="insights-grid">
          <WeakConceptsTile rows={snap.whatThisMeans.weakConcepts} />
          <DecayAlertsTile rows={snap.whatThisMeans.decayAlerts} />
          <PatternsTile />
        </div>
      </section>

      {/* ── Zone 3: What To Do ──────────────────────────────────── */}
      <section className="insights-zone" aria-labelledby="zone-what-to-do">
        <header className="insights-zone-head">
          <h2 id="zone-what-to-do" className="insights-zone-title">
            What to do
          </h2>
          <p className="insights-zone-sub">
            Today's scaffolded path — mission, revision, and the week's plan.
            Pick one and start.
          </p>
        </header>
        <div className="insights-grid">
          <MissionTile pending={snap.whatToDo.missionsTodayPending} />
          <RevisionTile dueToday={snap.whatToDo.revisionDueToday} />
          <PlanTile />
        </div>
      </section>
    </AppShell>
  );
}

// ─── Reusable tile shell ─────────────────────────────────────────────

interface TileProps {
  title: string;
  /** Short eyebrow shown above the title. */
  eyebrow?: string;
  /** Tile body — caller-rendered. */
  children: React.ReactNode;
  /** Deep link to the Phase-5 surface the tile aggregates over. */
  whyHref: string;
  /** Optional override of the "Why am I seeing this?" copy. */
  whyLabel?: string;
}

function InsightTile({
  title,
  eyebrow,
  children,
  whyHref,
  whyLabel = "Why am I seeing this?",
}: TileProps) {
  return (
    <article className="insight-tile">
      {eyebrow && <div className="insight-tile-eyebrow">{eyebrow}</div>}
      <h3 className="insight-tile-title">{title}</h3>
      <div className="insight-tile-body">{children}</div>
      <Link to={whyHref} className="insight-tile-why">
        {whyLabel} →
      </Link>
    </article>
  );
}

// ─── Zone 1 tiles ────────────────────────────────────────────────────

function ReadinessTile({
  band,
  score,
}: {
  band: ReadinessBand | null;
  score: number | null;
}) {
  return (
    <InsightTile
      eyebrow="Readiness"
      title={band ? readinessBandLabel(band) : "Building signal"}
      whyHref="/concept-profile"
      whyLabel="What this means →"
    >
      <div className="readiness-row">
        <div className="readiness-num">
          {score !== null ? `${Math.round(score * 100)}%` : "—"}
        </div>
        {band && <Pill tone={readinessBandTone(band)}>{readinessBandLabel(band)}</Pill>}
      </div>
      <p className="insight-tile-copy">
        Composite mastery across your active topics. Bands account for time-
        to-exam and target score, not raw average.
      </p>
    </InsightTile>
  );
}

function ConceptMasteryTile({ rows }: { rows: ConceptRow[] }) {
  return (
    <InsightTile
      eyebrow="Mastery"
      title={
        rows.length === 0
          ? "Not enough data yet"
          : `${rows.length} active concept${rows.length === 1 ? "" : "s"}`
      }
      whyHref="/concept-profile"
    >
      {rows.length === 0 ? (
        <p className="insight-tile-copy">
          Take a few rounds and the engine will start mapping which concepts
          are sticky and which need work.
        </p>
      ) : (
        <ul className="concept-list">
          {rows.slice(0, 5).map((r) => (
            <li key={r.conceptId}>
              <span className="concept-id">{shortId(r.conceptId)}</span>
              <span className="concept-ewa">{Math.round(r.ewa * 100)}%</span>
              <span className="concept-n">n={r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </InsightTile>
  );
}

function DecayTile({ rows }: { rows: ConceptRow[] }) {
  const critical = rows.filter((r) => r.decaySeverity === "critical").length;
  return (
    <InsightTile
      eyebrow="Decay"
      title={
        rows.length === 0
          ? "Nothing is fading"
          : `${rows.length} fading${critical > 0 ? ` · ${critical} critical` : ""}`
      }
      whyHref="/syllabus"
    >
      {rows.length === 0 ? (
        <p className="insight-tile-copy">
          Recent practice has kept everything fresh. Come back in a few days
          and the engine will flag what's starting to drift.
        </p>
      ) : (
        <ul className="concept-list">
          {rows.slice(0, 5).map((r) => (
            <li key={r.conceptId}>
              <span className="concept-id">{shortId(r.conceptId)}</span>
              <span
                className={`concept-decay decay-${r.decaySeverity}`}
              >
                {decaySeverityLabel(r.decaySeverity)} · {r.decayDays}d
              </span>
            </li>
          ))}
        </ul>
      )}
    </InsightTile>
  );
}

// ─── Zone 2 tiles ────────────────────────────────────────────────────

function WeakConceptsTile({ rows }: { rows: ConceptRow[] }) {
  return (
    <InsightTile
      eyebrow="Weakness"
      title={
        rows.length === 0
          ? "No persistent weak points"
          : `${rows.length} weak concept${rows.length === 1 ? "" : "s"}`
      }
      whyHref="/diagnostic-deep-dive"
    >
      {rows.length === 0 ? (
        <p className="insight-tile-copy">
          A weak concept is one where EWA dropped below 40% after at least
          two attempts. None of yours qualify right now.
        </p>
      ) : (
        <ul className="concept-list">
          {rows.slice(0, 4).map((r) => (
            <li key={r.conceptId}>
              <span className="concept-id">{shortId(r.conceptId)}</span>
              <span className="concept-ewa concept-ewa-weak">
                {Math.round(r.ewa * 100)}%
              </span>
              <span className="concept-n">n={r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </InsightTile>
  );
}

function DecayAlertsTile({ rows }: { rows: ConceptRow[] }) {
  return (
    <InsightTile
      eyebrow="Alert"
      title={
        rows.length === 0
          ? "No decay alerts"
          : `${rows.length} concept${rows.length === 1 ? "" : "s"} to refresh`
      }
      whyHref="/revision"
      whyLabel="Open revision queue →"
    >
      {rows.length === 0 ? (
        <p className="insight-tile-copy">
          Decay alerts fire when a concept hasn't been practiced for long
          enough that the engine expects retention to slip.
        </p>
      ) : (
        <ul className="concept-list">
          {rows.slice(0, 4).map((r) => (
            <li key={r.conceptId}>
              <span className="concept-id">{shortId(r.conceptId)}</span>
              <span className={`concept-decay decay-${r.decaySeverity}`}>
                {decaySeverityLabel(r.decaySeverity)} · {r.decayDays}d
              </span>
            </li>
          ))}
        </ul>
      )}
    </InsightTile>
  );
}

function PatternsTile() {
  // The weekly narrative ships in S53; until then the tile is a deep
  // link to the existing error-patterns surface so the IA stays honest.
  return (
    <InsightTile
      eyebrow="Patterns"
      title="Error pattern report"
      whyHref="/diagnostic-deep-dive"
      whyLabel="Open the report →"
    >
      <p className="insight-tile-copy">
        Six-axis classifier (silly mistake / conceptual gap / time pressure /
        formula / sign-or-unit / unattempted) over your last 30 sessions.
      </p>
    </InsightTile>
  );
}

// ─── Zone 3 tiles ────────────────────────────────────────────────────

function MissionTile({ pending }: { pending: boolean }) {
  return (
    <InsightTile
      eyebrow="Mission"
      title={pending ? "Mission ready" : "No mission queued"}
      whyHref="/home"
      whyLabel={pending ? "Start today's mission →" : "How missions work →"}
    >
      <p className="insight-tile-copy">
        Today's concept-grain mission is picked by the engine to maximise
        mastery delta in 15-20 minutes.
      </p>
    </InsightTile>
  );
}

function RevisionTile({ dueToday }: { dueToday: number }) {
  return (
    <InsightTile
      eyebrow="Revision"
      title={
        dueToday > 0
          ? `${dueToday} concept${dueToday === 1 ? "" : "s"} due today`
          : "Nothing due today"
      }
      whyHref="/revision"
    >
      <p className="insight-tile-copy">
        SM-2 + EWA-clamp scheduling. Five-question recall rounds restore
        retention without burning a full session.
      </p>
    </InsightTile>
  );
}

function PlanTile() {
  return (
    <InsightTile
      eyebrow="Plan"
      title="This week's plan"
      whyHref="/home"
      whyLabel="Open the week →"
    >
      <p className="insight-tile-copy">
        Your editable plan — move, swap, shorten, or regenerate any session.
        Impact preview shows how each edit affects mastery and readiness.
      </p>
    </InsightTile>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function shortId(id: string): string {
  // Concept titles aren't joined into the aggregator yet (Phase-5 KG
  // ships them as UUIDs). Until the join lands, render a short
  // identifier so the UI stays honest about the data shape.
  return id.slice(0, 8);
}
