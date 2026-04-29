"""Sprint 23 (P4-S23) — pure-function tests for the blueprint composer."""

from __future__ import annotations

import random

from learning.exam_blueprints.composer import compose_paper, derive_user_seed


def _blueprint(n_per_section: dict[str, int]) -> dict:
    return {
        "id": "bp-1",
        "total_questions": sum(n_per_section.values()),
        "sections": [
            {
                "section_id": k,
                "name": k.title(),
                "subject_id": "subj-" + k,
                "n_questions": v,
                "n_minutes": 60,
            }
            for k, v in n_per_section.items()
        ],
    }


def _candidate(qid: str, topic: str = "topic-1") -> dict:
    return {"id": qid, "topic_id": topic}


def test_full_pool_composes_all_requested_questions() -> None:
    bp = _blueprint({"physics": 2, "chem": 2})
    pool = {
        "physics": [_candidate("p1"), _candidate("p2"), _candidate("p3")],
        "chem": [_candidate("c1"), _candidate("c2")],
    }
    plan = compose_paper(bp, pool, rng=random.Random(0))
    assert plan["totalRequested"] == 4
    assert plan["totalComposed"] == 4
    assert plan["short"] is False
    assert all(s["short"] is False for s in plan["sections"])
    # Positions are 1-based and contiguous
    positions = [it["position"] for it in plan["items"]]
    assert positions == list(range(1, 5))
    # Section IDs are propagated per-item
    by_section = {"physics": 0, "chem": 0}
    for it in plan["items"]:
        by_section[it["sectionId"]] += 1
    assert by_section == {"physics": 2, "chem": 2}


def test_short_pool_flags_section_and_paper_as_short() -> None:
    bp = _blueprint({"physics": 5, "chem": 3})
    pool = {
        "physics": [_candidate("p1"), _candidate("p2")],  # only 2 of 5
        "chem": [_candidate("c1"), _candidate("c2"), _candidate("c3")],  # full
    }
    plan = compose_paper(bp, pool, rng=random.Random(0))
    assert plan["totalComposed"] == 5
    assert plan["short"] is True
    physics_summary = next(s for s in plan["sections"] if s["sectionId"] == "physics")
    chem_summary = next(s for s in plan["sections"] if s["sectionId"] == "chem")
    assert physics_summary["short"] is True
    assert physics_summary["nComposed"] == 2
    assert chem_summary["short"] is False


def test_empty_pool_returns_zero_items() -> None:
    bp = _blueprint({"physics": 3})
    plan = compose_paper(bp, {"physics": []}, rng=random.Random(0))
    assert plan["totalComposed"] == 0
    assert plan["short"] is True
    assert plan["items"] == []


def test_missing_section_key_treated_as_empty_pool() -> None:
    bp = _blueprint({"physics": 2, "chem": 1})
    # No "physics" key in pool — composer should treat as empty, not crash.
    pool = {"chem": [_candidate("c1")]}
    plan = compose_paper(bp, pool, rng=random.Random(0))
    assert plan["totalComposed"] == 1
    assert plan["short"] is True


def test_deterministic_with_seeded_rng() -> None:
    """Same blueprint + same pool + same rng seed → same paper."""
    bp = _blueprint({"physics": 2})
    pool = {"physics": [_candidate(f"p{i}") for i in range(10)]}
    plan_a = compose_paper(bp, pool, rng=random.Random(42))
    plan_b = compose_paper(bp, pool, rng=random.Random(42))
    assert [it["questionId"] for it in plan_a["items"]] == [
        it["questionId"] for it in plan_b["items"]
    ]


def test_derive_user_seed_stable_across_calls() -> None:
    s1 = derive_user_seed("bp-1", "user-1")
    s2 = derive_user_seed("bp-1", "user-1")
    assert s1 == s2
    s3 = derive_user_seed("bp-1", "user-2")
    assert s1 != s3
