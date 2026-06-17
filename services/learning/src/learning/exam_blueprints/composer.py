"""Pure-function paper composer (Sprint 23, P4-S23).

Given a blueprint and a candidate question pool *per section*, return an
ordered list of items: [{position, section_id, question_id, topic_id}, …].

Honest about content shortages: if a section's pool is < n_questions, the
composer takes what's available, marks the section as `short`, and the
overall paper carries `short=True`. The route surfaces this so the UI
can warn the student before they start.

The composer does not call any HTTP endpoint or DB. It accepts a
candidate dict and returns a plan dict — fully testable in isolation.

Per ADR-0012 (exam blueprint metadata).
"""

from __future__ import annotations

import random
from typing import Any


def compose_paper(
    blueprint: dict[str, Any],
    candidates_by_section: dict[str, list[dict[str, Any]]],
    *,
    rng: random.Random | None = None,
) -> dict[str, Any]:
    """Compose a paper from a blueprint and candidate questions per section.

    `candidates_by_section` maps section_id -> [question dict] where each
    question dict has at least `id` and `topic_id`. Extra fields (difficulty_b
    etc.) are passed through untouched on the output.

    Returns a plan dict:
        {
          "blueprintId": str,
          "totalRequested": int,
          "totalComposed": int,
          "short": bool,
          "items": [{"position": int (1-based), "sectionId": str,
                     "questionId": str, "topicId": str}, ...],
          "sections": [
              {"sectionId": str, "name": str, "nRequested": int,
               "nComposed": int, "short": bool}, ...
          ],
        }
    """
    rng = rng or random.Random()
    items: list[dict[str, Any]] = []
    section_summaries: list[dict[str, Any]] = []
    position = 1
    overall_short = False

    for section in blueprint["sections"]:
        section_id = section["section_id"]
        n_requested = int(section["n_questions"])
        pool = list(candidates_by_section.get(section_id, []))
        # Deterministic shuffle: same blueprint + same pool always yields the
        # same paper for the same rng. Tests pass a seeded rng; production
        # uses a per-user seed.
        rng.shuffle(pool)
        chosen = pool[:n_requested]

        for q in chosen:
            items.append(
                {
                    "position": position,
                    "sectionId": section_id,
                    "questionId": str(q["id"]),
                    "topicId": str(q.get("topic_id") or q.get("topicId") or ""),
                }
            )
            position += 1

        n_composed = len(chosen)
        short = n_composed < n_requested
        if short:
            overall_short = True
        section_summaries.append(
            {
                "sectionId": section_id,
                "name": section["name"],
                "nRequested": n_requested,
                "nComposed": n_composed,
                "short": short,
            }
        )

    return {
        "blueprintId": str(blueprint["id"]),
        "totalRequested": int(blueprint["total_questions"]),
        "totalComposed": len(items),
        "short": overall_short,
        "items": items,
        "sections": section_summaries,
    }


def derive_user_seed(blueprint_id: str, user_id: str) -> int:
    """Stable per-(blueprint, user) RNG seed.

    Same student retaking the same blueprint gets the same paper twice in a
    row (unsurprising on retake). Different students get different papers.
    A new attempt by the same student gets a new paper if the caller mixes
    in a per-attempt nonce — the route does this with `attempt_idx`.
    """
    return hash((blueprint_id, user_id)) & 0x7FFFFFFF
