"""Phase 1C — manual-intervention efficacy.

Did teachers' "flag for revision" actions actually move the needle?

For each fulfilled intervention, compute the mastery delta on the
flagged topic from `created_at` (when the flag fired) to `fulfilled_at`
(when the student completed the prescribed action). Compare to the
30-day mastery delta of unflagged peer baseline.

Honest signalling: the result hides per-action efficacy when sample
size < 5; admins see only the aggregate plus a hidden-count.

We don't have historical mastery snapshots — only the current EWA. So
the v1 approximation is "current EWA on flagged topic vs cohort peer
median current EWA" rather than a true before/after measurement.
The endpoint surfaces this caveat in `notes`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.scope import tenant_user_ids

log = logging.getLogger(__name__)

_MIN_SAMPLE = 5


@dataclass
class ActionEfficacy:
    action: str
    n_flags_total: int
    n_fulfilled: int
    fulfillment_rate: float
    avg_days_to_fulfil: float | None
    avg_flagged_ewa: float            # current EWA of flagged students on flagged topics
    avg_unflagged_ewa: float           # cohort peer baseline EWA on same topics
    delta: float                       # flagged - unflagged
    n_topics_with_data: int


@dataclass
class InterventionEfficacyReport:
    tenant_id: str
    n_interventions_total: int
    n_fulfilled: int
    overall_fulfillment_rate: float
    by_action: list[ActionEfficacy]
    notes: list[str]


async def compute(
    session: AsyncSession, *, tenant_id: str
) -> InterventionEfficacyReport:
    notes: list[str] = []

    user_ids = await tenant_user_ids(session, tenant_id)

    if not user_ids:
        return InterventionEfficacyReport(
            tenant_id=tenant_id,
            n_interventions_total=0,
            n_fulfilled=0,
            overall_fulfillment_rate=0.0,
            by_action=[],
            notes=["Tenant has no members."],
        )

    # All interventions in tenant
    all_int = (
        await session.execute(
            text(
                """
                SELECT id, student_id, topic_id, action,
                       created_at, fulfilled_at,
                       EXTRACT(EPOCH FROM (fulfilled_at - created_at))/86400.0
                          AS days_to_fulfil
                  FROM analytics_schema.manual_interventions
                 WHERE student_id = ANY(CAST(:uids AS uuid[]))
                """
            ),
            {"uids": user_ids},
        )
    ).mappings().all()

    if not all_int:
        return InterventionEfficacyReport(
            tenant_id=tenant_id,
            n_interventions_total=0,
            n_fulfilled=0,
            overall_fulfillment_rate=0.0,
            by_action=[],
            notes=["No interventions logged in this tenant yet."],
        )

    n_total = len(all_int)
    n_fulfilled = sum(1 for r in all_int if r["fulfilled_at"] is not None)

    # Group by action
    by_action: dict[str, list[dict]] = {}
    for r in all_int:
        by_action.setdefault(r["action"], []).append(dict(r))

    # Pull current mastery for the flagged (student, topic) pairs and
    # peer baselines (current EWA averaged across all tenant users on
    # that topic, excluding the flagged student).
    pairs = [(str(r["student_id"]), str(r["topic_id"])) for r in all_int]

    # Cohort baseline EWA per topic (excluding flagged students)
    topics = list({p[1] for p in pairs})
    flagged_users = list({p[0] for p in pairs})

    cohort_ewa = (
        await session.execute(
            text(
                """
                SELECT topic_id::text AS topic_id,
                       AVG(ewa)::real AS avg_ewa,
                       COUNT(*)::int AS n
                  FROM analytics_schema.mastery
                 WHERE topic_id = ANY(CAST(:tids AS uuid[]))
                   AND user_id = ANY(CAST(:uids AS uuid[]))
                   AND user_id <> ALL(CAST(:flagged AS uuid[]))
                 GROUP BY topic_id
                """
            ),
            {
                "tids": topics,
                "uids": user_ids,
                "flagged": flagged_users,
            },
        )
    ).mappings().all()
    cohort_ewa_map = {r["topic_id"]: float(r["avg_ewa"]) for r in cohort_ewa}

    # Flagged users' current EWA per (user, topic)
    flagged_ewa = (
        await session.execute(
            text(
                """
                SELECT user_id::text AS user_id,
                       topic_id::text AS topic_id,
                       ewa
                  FROM analytics_schema.mastery
                 WHERE (user_id, topic_id) IN (
                     SELECT * FROM unnest(CAST(:uids AS uuid[]),
                                          CAST(:tids AS uuid[]))
                 )
                """
            ),
            {
                "uids": [p[0] for p in pairs],
                "tids": [p[1] for p in pairs],
            },
        )
    ).mappings().all()
    flagged_ewa_map = {(r["user_id"], r["topic_id"]): float(r["ewa"]) for r in flagged_ewa}

    action_results: list[ActionEfficacy] = []
    for action, items in by_action.items():
        n = len(items)
        if n < _MIN_SAMPLE:
            continue
        n_full = sum(1 for it in items if it["fulfilled_at"])
        avg_days = None
        if n_full > 0:
            day_vals = [
                float(it["days_to_fulfil"]) for it in items
                if it.get("days_to_fulfil") is not None
            ]
            if day_vals:
                avg_days = round(sum(day_vals) / len(day_vals), 2)
        # mastery delta
        flagged_ewas = []
        unflagged_ewas = []
        n_topics_with = 0
        for it in items:
            uid = str(it["student_id"])
            tid = str(it["topic_id"])
            fewa = flagged_ewa_map.get((uid, tid))
            uewa = cohort_ewa_map.get(tid)
            if fewa is not None and uewa is not None:
                flagged_ewas.append(fewa)
                unflagged_ewas.append(uewa)
                n_topics_with += 1
        flagged_avg = (
            sum(flagged_ewas) / len(flagged_ewas) if flagged_ewas else 0.0
        )
        unflagged_avg = (
            sum(unflagged_ewas) / len(unflagged_ewas) if unflagged_ewas else 0.0
        )
        action_results.append(
            ActionEfficacy(
                action=action,
                n_flags_total=n,
                n_fulfilled=n_full,
                fulfillment_rate=round(n_full / n, 4),
                avg_days_to_fulfil=avg_days,
                avg_flagged_ewa=round(flagged_avg, 4),
                avg_unflagged_ewa=round(unflagged_avg, 4),
                delta=round(flagged_avg - unflagged_avg, 4),
                n_topics_with_data=n_topics_with,
            )
        )

    notes.append(
        "Efficacy compares flagged students' CURRENT EWA to peer baseline. "
        "True before/after measurement requires mastery snapshots over time "
        "(deferred — not in v1 schema)."
    )
    if not action_results:
        notes.append("No action category has the minimum sample size (5) yet.")

    action_results.sort(key=lambda a: -a.n_flags_total)

    return InterventionEfficacyReport(
        tenant_id=tenant_id,
        n_interventions_total=n_total,
        n_fulfilled=n_fulfilled,
        overall_fulfillment_rate=(
            round(n_fulfilled / n_total, 4) if n_total > 0 else 0.0
        ),
        by_action=action_results,
        notes=notes,
    )
