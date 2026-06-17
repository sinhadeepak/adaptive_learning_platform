"""Phase 1C — confidence-vs-accuracy gap.

For each (user, question) row in `confidence_calibration`, the
student rated their `predicted_correct` (probability of being right)
before answering. After grading, `actual_correct` is the truth. The
miscalibration per response is `predicted_correct - actual_correct`.

We aggregate by concept (via the question→concept map) and surface
two patterns:

  - **Overconfidence**: avg miscalibration >> 0 — student thinks they
    know but get it wrong. Highest-priority for the student to learn
    about; their study plan likely overweights "review" vs "drill."

  - **Underconfidence**: avg miscalibration << 0 — student gets it
    right but thinks they don't. Surfacing this builds confidence and
    avoids over-studying topics they've already mastered.

Honest-signalling rule: every concept row carries `n` (sample size).
We hide concepts with `n < 5` from the response (returned in
`hiddenLowSampleCount`) so the UI never shows a single-attempt
"miscalibration" as a finding.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_MIN_N = 5
_OVERCONFIDENT_THRESHOLD = 0.20      # avg(predicted) - avg(actual) > 0.20
_UNDERCONFIDENT_THRESHOLD = -0.20


@dataclass
class ConceptGap:
    concept_id: str
    n: int
    avg_predicted: float
    avg_actual: float
    miscalibration: float            # predicted - actual; positive = overconfident
    label: str                       # "overconfident" | "underconfident" | "calibrated"
    concept_ewa: float | None        # current concept_mastery ewa, if any


@dataclass
class ConfidenceGapReport:
    user_id: str
    overall_brier: float | None      # mean((predicted - actual)^2); null if no data
    overall_n: int
    overconfident: list[ConceptGap]
    underconfident: list[ConceptGap]
    calibrated: list[ConceptGap]
    hidden_low_sample_count: int     # concepts skipped due to n < 5
    notes: list[str]


async def compute(
    session: AsyncSession, *, user_id: str
) -> ConfidenceGapReport:
    notes: list[str] = []

    # Per-question miscalibration joined via dblink to question→concept
    # mapping (cross-DB to learning's content_schema.question_concepts).
    # We aggregate at the engagement DB after pulling the concept map.
    rows = (
        await session.execute(
            text(
                """
                SELECT
                  cc.predicted_correct,
                  cc.actual_correct::int AS actual_correct,
                  cc.question_id::text AS question_id
                FROM analytics_schema.confidence_calibration cc
                WHERE cc.user_id = CAST(:uid AS uuid)
                """
            ),
            {"uid": user_id},
        )
    ).all()

    if not rows:
        return ConfidenceGapReport(
            user_id=user_id,
            overall_brier=None,
            overall_n=0,
            overconfident=[],
            underconfident=[],
            calibrated=[],
            hidden_low_sample_count=0,
            notes=["No confidence-rating data yet — answer questions in confidence-rating mode to populate this."],
        )

    overall_n = len(rows)
    overall_brier = sum((float(r[0]) - float(r[1])) ** 2 for r in rows) / overall_n

    qids = [r[2] for r in rows]
    if not qids:
        return ConfidenceGapReport(
            user_id=user_id,
            overall_brier=round(overall_brier, 4),
            overall_n=overall_n,
            overconfident=[],
            underconfident=[],
            calibrated=[],
            hidden_low_sample_count=0,
            notes=notes,
        )

    # Same-DB lookup: pull question -> primary_concept_id from
    # session_item_outcomes. Far simpler than dblink and works as long
    # as the user has answered the question in a session.
    concept_rows = (
        await session.execute(
            text(
                """
                SELECT DISTINCT question_id::text AS question_id,
                       primary_concept_id::text AS concept_id
                  FROM analytics_schema.session_item_outcomes
                 WHERE user_id = CAST(:uid AS uuid)
                   AND question_id = ANY(CAST(:qids AS uuid[]))
                """
            ),
            {"uid": user_id, "qids": qids},
        )
    ).all()
    q_to_c: dict[str, str] = {r[0]: r[1] for r in concept_rows}

    # Aggregate per concept
    by_concept: dict[str, list[tuple[float, int]]] = {}
    for r in rows:
        cid = q_to_c.get(r[2])
        if not cid:
            continue
        by_concept.setdefault(cid, []).append((float(r[0]), int(r[1])))

    if not by_concept:
        notes.append("Confidence ratings recorded but none of the questions have concept tags yet.")

    # Concept mastery for joined display
    cmaps: dict[str, float] = {}
    if by_concept:
        cm_rows = (
            await session.execute(
                text(
                    """
                    SELECT concept_id::text, ewa
                      FROM analytics_schema.concept_mastery
                     WHERE user_id = CAST(:uid AS uuid)
                       AND concept_id = ANY(CAST(:cids AS uuid[]))
                    """
                ),
                {"uid": user_id, "cids": list(by_concept.keys())},
            )
        ).all()
        cmaps = {r[0]: float(r[1]) for r in cm_rows}

    overconfident: list[ConceptGap] = []
    underconfident: list[ConceptGap] = []
    calibrated: list[ConceptGap] = []
    hidden_count = 0

    for cid, samples in by_concept.items():
        n = len(samples)
        if n < _MIN_N:
            hidden_count += 1
            continue
        avg_pred = sum(s[0] for s in samples) / n
        avg_act = sum(s[1] for s in samples) / n
        miscal = avg_pred - avg_act
        if miscal > _OVERCONFIDENT_THRESHOLD:
            label = "overconfident"
            target_list = overconfident
        elif miscal < _UNDERCONFIDENT_THRESHOLD:
            label = "underconfident"
            target_list = underconfident
        else:
            label = "calibrated"
            target_list = calibrated
        target_list.append(
            ConceptGap(
                concept_id=cid,
                n=n,
                avg_predicted=round(avg_pred, 4),
                avg_actual=round(avg_act, 4),
                miscalibration=round(miscal, 4),
                label=label,
                concept_ewa=cmaps.get(cid),
            )
        )

    overconfident.sort(key=lambda c: -c.miscalibration)
    underconfident.sort(key=lambda c: c.miscalibration)
    calibrated.sort(key=lambda c: abs(c.miscalibration))

    return ConfidenceGapReport(
        user_id=user_id,
        overall_brier=round(overall_brier, 4),
        overall_n=overall_n,
        overconfident=overconfident,
        underconfident=underconfident,
        calibrated=calibrated,
        hidden_low_sample_count=hidden_count,
        notes=notes,
    )
