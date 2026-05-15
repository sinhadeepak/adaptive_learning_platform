// RevisionRitual — 5-question recall ritual (Phase 6 S56).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S56
//
// Four stages:
//   1. recall  — student rates confidence before seeing the questions
//   2. set     — links into a real quiz session for the chosen concept
//   3. delta   — surfaces the projected mastery delta after the set
//   4. next    — shows when the concept is next due (SM-2)
//
// v0 keeps the existing /revision queue intact and adds this new route
// as a *demonstrator* of the ritual format. The "set" stage hands off
// to the real /quiz pipeline rather than recreating the player here.

import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";

type Stage = "recall" | "set" | "delta" | "next";
type Confidence = "low" | "mid" | "high";

const STAGE_ORDER: Stage[] = ["recall", "set", "delta", "next"];
const STAGE_LABELS: Record<Stage, string> = {
  recall: "1 · Recall",
  set: "2 · Set",
  delta: "3 · Delta",
  next: "4 · Next due",
};

export function RevisionRitual() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const [search] = useSearchParams();
  const conceptName = search.get("name") ?? "this concept";
  const topicId = search.get("topicId");

  const [stage, setStage] = useState<Stage>("recall");
  const [confidence, setConfidence] = useState<Confidence | null>(null);

  function advance() {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  }

  return (
    <AppShell title="Revision ritual">
      <nav className="ritual-stepper" aria-label="Ritual stages">
        {STAGE_ORDER.map((s) => (
          <div
            key={s}
            className={`ritual-step${s === stage ? " is-active" : ""}${STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(stage) ? " is-done" : ""}`}
          >
            {STAGE_LABELS[s]}
          </div>
        ))}
      </nav>

      <h1 className="ritual-title">{conceptName}</h1>

      {stage === "recall" && (
        <section className="ritual-card" aria-label="Recall prompt">
          <h2 className="ritual-h2">How confident are you right now?</h2>
          <p className="ritual-copy">
            Tap a level before you see the questions. We compare your gut
            against the actual delta so calibration stays honest.
          </p>
          <div className="ritual-confidence">
            {(["low", "mid", "high"] as const).map((c) => (
              <button
                key={c}
                type="button"
                className={`ritual-conf-btn${confidence === c ? " is-active" : ""}`}
                onClick={() => setConfidence(c)}
              >
                <span className="ritual-conf-glyph" aria-hidden>
                  {c === "low" ? "◌" : c === "mid" ? "◐" : "●"}
                </span>
                <span className="ritual-conf-label">
                  {c === "low" ? "Shaky" : c === "mid" ? "OK" : "Solid"}
                </span>
              </button>
            ))}
          </div>
          <div className="ritual-cta-row">
            <button
              type="button"
              className="ritual-cta"
              onClick={advance}
              disabled={confidence === null}
            >
              Start the 5-question set →
            </button>
          </div>
        </section>
      )}

      {stage === "set" && (
        <section className="ritual-card" aria-label="Question set">
          <h2 className="ritual-h2">5 retrieval questions</h2>
          <p className="ritual-copy">
            Short, no-skip set focused on {conceptName}. The session feeds
            mastery the same way a practice round does.
          </p>
          <div className="ritual-cta-row">
            {topicId ? (
              <Link
                to={`/catalog/topic/${topicId}`}
                className="ritual-cta ritual-cta-primary"
              >
                Open the session →
              </Link>
            ) : (
              <button
                type="button"
                className="ritual-cta ritual-cta-primary"
                onClick={advance}
              >
                Simulate complete (demo) →
              </button>
            )}
            <button
              type="button"
              className="ritual-cta"
              onClick={advance}
              title="Skip to the delta stage without playing the questions"
            >
              I'm done — show delta
            </button>
          </div>
        </section>
      )}

      {stage === "delta" && (
        <section className="ritual-card" aria-label="Mastery delta">
          <h2 className="ritual-h2">Mastery delta</h2>
          <p className="ritual-copy">
            The next time we batch ingest, mastery for {conceptName} will
            update from your live attempts. Calibration vs. your{" "}
            <strong>{confidence ?? "—"}</strong> recall lands in the weekly
            narrative.
          </p>
          <div className="ritual-cta-row">
            <button type="button" className="ritual-cta" onClick={advance}>
              See next due →
            </button>
          </div>
        </section>
      )}

      {stage === "next" && (
        <section className="ritual-card" aria-label="Next due">
          <h2 className="ritual-h2">Locked in</h2>
          <p className="ritual-copy">
            SM-2 will surface {conceptName} again when the spacing schedule
            says retention is starting to slip. You'll see it in your
            Insights decay tile and on the Home revision queue.
          </p>
          <div className="ritual-cta-row">
            <Link to="/revision" className="ritual-cta ritual-cta-primary">
              Back to revision queue →
            </Link>
            <Link to="/insights" className="ritual-cta">
              Open insights →
            </Link>
          </div>
        </section>
      )}

      <p className="ritual-footer">
        Concept ID: <code>{conceptId ?? "—"}</code>
      </p>
    </AppShell>
  );
}
