"""Re-evaluation triggers — preserve old evaluation_records as immutable
history.

Per ADR-0019 §"Re-evaluation when prompt or rubric versions update".
The S37 schema records `prompt_version` + `rubric_version` on every
evaluation_records row. Re-evaluation creates a NEW row; the old row
stays as the previous state for audit + appeal purposes.

Cap per ADR-0019: at most 2 automatic re-evaluations per response;
beyond that admin trigger only. Counter lives on
content_schema.evaluation_records via the `version_count` column —
this module enumerates rows + applies the cap pure-function.

Hooks: rubric edit + prompt-template version bump both trigger
re-evaluation via separate downstream channels (rubric_editor route +
prompt_registry reload event); this module exposes the pure
"is-eligible" check + a thin route the caller posts to.
"""

from __future__ import annotations

from dataclasses import dataclass

# Per ADR-0019. After this many automatic re-evals, only admin can
# trigger another (avoid cascading rubric-edit storms).
MAX_AUTO_REEVAL_PER_RESPONSE = 2


@dataclass(frozen=True)
class ReevaluationDecision:
    eligible: bool
    reason: str
    version_count: int


def is_eligible_for_reevaluation(
    *,
    response_id: str,
    existing_eval_count: int,
    admin_override: bool = False,
) -> ReevaluationDecision:
    """Pure: decide whether a response can be re-evaluated.

    `existing_eval_count` is the count of evaluation_records for this
    response (caller queries first; `version` column auto-increments
    on insert in the schema).

    Admin override bypasses the cap. Audit log captures every re-eval
    attempt regardless of decision.
    """
    if admin_override:
        return ReevaluationDecision(
            eligible=True,
            reason="admin_override",
            version_count=existing_eval_count,
        )
    if existing_eval_count >= MAX_AUTO_REEVAL_PER_RESPONSE:
        return ReevaluationDecision(
            eligible=False,
            reason=(
                f"max_auto_reevaluations_reached: "
                f"{existing_eval_count} >= {MAX_AUTO_REEVAL_PER_RESPONSE} "
                "(admin can override)"
            ),
            version_count=existing_eval_count,
        )
    return ReevaluationDecision(
        eligible=True,
        reason="ok",
        version_count=existing_eval_count,
    )
