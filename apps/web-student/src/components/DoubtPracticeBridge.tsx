// DoubtPracticeBridge — UX-35 doubt → practice (Phase 6 S58).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S58
//
// Closes the loop on a resolved doubt: after the student understands
// the answer, surface a CTA to immediately practice a few more
// questions on the same topic. Routes to /catalog/topic/{topicId}
// which starts a quiz session.

import { Link } from "react-router-dom";

export interface DoubtPracticeBridgeProps {
  topicId: string | null;
  topicTitle?: string | null;
  /**
   * When the doubt is unresolved, the bridge can render a "save for
   * later" mode rather than the CTA. v0 just hides itself.
   */
  resolved?: boolean;
}

export function DoubtPracticeBridge({
  topicId,
  topicTitle,
  resolved = true,
}: DoubtPracticeBridgeProps) {
  if (!resolved || !topicId) return null;
  return (
    <section className="dpb-card" aria-label="Practice this concept">
      <header className="dpb-head">
        <span className="dpb-glyph" aria-hidden>
          ⚡
        </span>
        <div>
          <div className="dpb-eyebrow">Lock it in</div>
          <h3 className="dpb-title">
            Practice this {topicTitle ? `· ${topicTitle}` : "concept"}
          </h3>
        </div>
      </header>
      <p className="dpb-copy">
        Understanding the answer is half the loop. A short retrieval round
        on the same topic locks it into memory before it decays.
      </p>
      <Link
        to={`/catalog/topic/${topicId}`}
        className="dpb-cta"
      >
        Start a 5-question retrieval round →
      </Link>
    </section>
  );
}
