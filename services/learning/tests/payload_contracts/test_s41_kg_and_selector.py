"""Phase 5 (P5-S41) — kg.root_cause + adaptive.multi_dim_selector.

Pure-function tests + route-level smoke via FastAPI TestClient.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from learning.adaptive.multi_dim_selector import (
    SPARSE_N_THRESHOLD,
    CandidateQuestion,
    MasteryRow,
    select_next_multi_dim,
)
from learning.kg import Edge, root_cause_concept


# ── kg.root_cause ────────────────────────────────────────────────────────────


def test_root_cause_simple_chain_picks_deepest_weak() -> None:
    # primary "newton2" depends on "newton1" depends on "vectors".
    # Mastery: newton2=0.3, newton1=0.5, vectors=0.2 → deepest weak is vectors.
    edges = [
        Edge("newton2", "newton1"),
        Edge("newton1", "vectors"),
    ]
    out = root_cause_concept(
        primary_concept_id="newton2",
        user_concept_mastery={"newton2": 0.3, "newton1": 0.5, "vectors": 0.2},
        edges=edges,
    )
    assert out.root_cause_concept_id == "vectors"
    assert out.path == ["newton2", "newton1", "vectors"]
    assert "vectors" in out.weak_concepts


def test_root_cause_primary_only_weakness_when_chain_strong() -> None:
    edges = [Edge("newton2", "newton1")]
    out = root_cause_concept(
        primary_concept_id="newton2",
        user_concept_mastery={"newton2": 0.3, "newton1": 0.9},
        edges=edges,
    )
    assert out.root_cause_concept_id == "newton2"
    assert out.path == ["newton2"]


def test_root_cause_no_weakness_returns_none() -> None:
    edges = [Edge("a", "b")]
    out = root_cause_concept(
        primary_concept_id="a",
        user_concept_mastery={"a": 0.9, "b": 0.85},
        edges=edges,
    )
    assert out.root_cause_concept_id is None


def test_root_cause_missing_concept_treated_as_zero_mastery() -> None:
    edges = [Edge("a", "b")]
    # b is absent → ewa=0 → weak
    out = root_cause_concept(
        primary_concept_id="a",
        user_concept_mastery={"a": 0.9},
        edges=edges,
    )
    assert out.root_cause_concept_id == "b"


def test_root_cause_branching_picks_deepest_across_branches() -> None:
    # primary -> p1 -> q1 (depth 2)
    #         -> p2 -> q2 -> r2 (depth 3)
    # All weak; deepest = r2.
    edges = [
        Edge("primary", "p1"),
        Edge("primary", "p2"),
        Edge("p1", "q1"),
        Edge("p2", "q2"),
        Edge("q2", "r2"),
    ]
    out = root_cause_concept(
        primary_concept_id="primary",
        user_concept_mastery={
            "primary": 0.3, "p1": 0.2, "q1": 0.1,
            "p2": 0.2, "q2": 0.1, "r2": 0.05,
        },
        edges=edges,
    )
    assert out.root_cause_concept_id == "r2"


def test_root_cause_cycle_short_circuits() -> None:
    edges = [
        Edge("a", "b"),
        Edge("b", "c"),
        Edge("c", "a"),  # cycle back
    ]
    out = root_cause_concept(
        primary_concept_id="a",
        user_concept_mastery={"a": 0.1, "b": 0.1, "c": 0.1},
        edges=edges,
    )
    # Should pick the deepest non-revisited node ("c") and note the cycle.
    assert out.root_cause_concept_id == "c"
    assert any("cycle" in n for n in out.notes)


def test_root_cause_max_depth_truncates() -> None:
    edges = [Edge(f"n{i}", f"n{i+1}") for i in range(10)]
    mastery = {f"n{i}": 0.1 for i in range(11)}
    out = root_cause_concept(
        primary_concept_id="n0",
        user_concept_mastery=mastery,
        edges=edges,
        max_depth=3,
    )
    # Should not walk beyond depth 3.
    assert out.root_cause_concept_id == "n3"
    assert any("truncated_at_max_depth" in n for n in out.notes)


def test_root_cause_threshold_overridable() -> None:
    edges = [Edge("a", "b")]
    # b is "weak" only at threshold 0.7
    out = root_cause_concept(
        primary_concept_id="a",
        user_concept_mastery={"a": 0.9, "b": 0.5},
        edges=edges,
        weak_threshold=0.7,
    )
    assert out.root_cause_concept_id == "b"


# ── multi_dim_selector ──────────────────────────────────────────────────────


def test_select_returns_none_for_empty_candidates() -> None:
    out = select_next_multi_dim(
        concept_mastery={}, bloom_mastery={}, candidates=[],
    )
    assert out is None


def test_select_picks_sparse_concept_first() -> None:
    """When concept attempts < SPARSE_N_THRESHOLD, that cell scores
    1.0 + bloom-bonus and dominates over a near-mastered concept."""
    cm = {
        # topic_a is near-mastered → low uncertainty (~0.05).
        "topic_a": MasteryRow(ewa=0.95, n=20),
        # topic_b is sparse → uncertainty 1.0.
        "topic_b": MasteryRow(ewa=0.5, n=2),
    }
    # Both bloom cells populated so the +0.3 bonus is symmetric.
    bm = {
        ("topic_a", "APPLY"): MasteryRow(ewa=0.95, n=20),
        ("topic_b", "APPLY"): MasteryRow(ewa=0.5, n=2),
    }
    candidates = [
        CandidateQuestion(question_id="q1", concept_ids=["topic_a"], bloom="APPLY"),
        CandidateQuestion(question_id="q2", concept_ids=["topic_b"], bloom="APPLY"),
    ]
    sel = select_next_multi_dim(
        concept_mastery=cm, bloom_mastery=bm, candidates=candidates,
    )
    assert sel is not None
    assert sel.question_id == "q2"
    assert sel.targets_concept_id == "topic_b"


def test_select_prefers_uncertainty_ewa_near_half() -> None:
    cm = {
        "ca": MasteryRow(ewa=0.95, n=20),  # near-mastered
        "cb": MasteryRow(ewa=0.5, n=20),   # peak uncertainty
    }
    # Both bloom cells exist with same n so the bloom bonus is neutral.
    bm = {
        ("ca", "APPLY"): MasteryRow(ewa=0.95, n=20),
        ("cb", "APPLY"): MasteryRow(ewa=0.5, n=20),
    }
    candidates = [
        CandidateQuestion(question_id="q1", concept_ids=["ca"], bloom="APPLY"),
        CandidateQuestion(question_id="q2", concept_ids=["cb"], bloom="APPLY"),
    ]
    sel = select_next_multi_dim(
        concept_mastery=cm, bloom_mastery=bm, candidates=candidates,
    )
    assert sel is not None
    assert sel.question_id == "q2"


def test_select_excludes_ids() -> None:
    cm = {"x": MasteryRow(ewa=0.5, n=20)}
    candidates = [
        CandidateQuestion(question_id="q1", concept_ids=["x"], bloom="APPLY"),
        CandidateQuestion(question_id="q2", concept_ids=["x"], bloom="APPLY"),
    ]
    sel = select_next_multi_dim(
        concept_mastery=cm, bloom_mastery={},
        candidates=candidates, exclude={"q1"},
    )
    assert sel is not None and sel.question_id == "q2"


def test_select_respects_exposure_cap() -> None:
    cm = {"x": MasteryRow(ewa=0.5, n=20)}
    candidates = [
        CandidateQuestion(question_id="q1", concept_ids=["x"], bloom="APPLY"),
        CandidateQuestion(question_id="q2", concept_ids=["x"], bloom="APPLY"),
    ]
    # q1 is at the cap; should be skipped in favour of q2.
    sel = select_next_multi_dim(
        concept_mastery=cm, bloom_mastery={},
        candidates=candidates,
        exposure={"q1": 5, "q2": 0},
        exposure_cap=5,
    )
    assert sel is not None and sel.question_id == "q2"


def test_select_falls_back_when_all_over_cap() -> None:
    cm = {"x": MasteryRow(ewa=0.5, n=20)}
    candidates = [
        CandidateQuestion(question_id="q1", concept_ids=["x"], bloom="APPLY"),
    ]
    sel = select_next_multi_dim(
        concept_mastery=cm, bloom_mastery={},
        candidates=candidates,
        exposure={"q1": 100},
        exposure_cap=5,
    )
    # Over-cap pool fallback — still picks q1 rather than returning None.
    assert sel is not None and sel.question_id == "q1"


def test_select_deterministic_tie_breaks_on_qid() -> None:
    cm = {"x": MasteryRow(ewa=0.5, n=20)}
    bm: dict[tuple[str, str], MasteryRow] = {}
    candidates = [
        CandidateQuestion(question_id="q_b", concept_ids=["x"], bloom="APPLY"),
        CandidateQuestion(question_id="q_a", concept_ids=["x"], bloom="APPLY"),
    ]
    # Same score and same exposure → lex-smallest qid wins.
    sel = select_next_multi_dim(
        concept_mastery=cm, bloom_mastery=bm, candidates=candidates,
    )
    assert sel is not None and sel.question_id == "q_a"


# ── Routes (TestClient) ──────────────────────────────────────────────────────


def _make_app() -> FastAPI:
    """Mount the adaptive router for route-level testing. We avoid
    importing learning.main.app to keep tests free of network I/O
    (NATS, Redis) at startup."""
    from learning.adaptive.routes import router as adaptive_router

    app = FastAPI()
    app.include_router(adaptive_router)
    return app


def test_route_root_cause_happy_path() -> None:
    client = TestClient(_make_app())
    resp = client.post(
        "/adaptive/diagnostic/root-cause",
        json={
            "primaryConceptId": "newton2",
            "userConceptMastery": {
                "newton2": 0.3, "newton1": 0.5, "vectors": 0.2,
            },
            "edges": [
                {"fromConceptId": "newton2", "toConceptId": "newton1"},
                {"fromConceptId": "newton1", "toConceptId": "vectors"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rootCauseConceptId"] == "vectors"
    assert body["path"] == ["newton2", "newton1", "vectors"]


def test_route_select_multi_dim_picks_uncertain_cell() -> None:
    client = TestClient(_make_app())
    resp = client.post(
        "/adaptive/select-multi-dim",
        json={
            "conceptMastery": {
                "ca": {"ewa": 0.95, "n": 20},
                "cb": {"ewa": 0.5, "n": 20},
            },
            "bloomMastery": {
                "ca|APPLY": {"ewa": 0.95, "n": 20},
                "cb|APPLY": {"ewa": 0.5, "n": 20},
            },
            "candidates": [
                {"questionId": "q1", "conceptIds": ["ca"], "bloom": "APPLY"},
                {"questionId": "q2", "conceptIds": ["cb"], "bloom": "APPLY"},
            ],
            "exposure": {},
            "exposureCap": 5,
            "exclude": [],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["questionId"] == "q2"
    assert body["targetsConceptId"] == "cb"


def test_route_select_returns_null_when_no_candidates() -> None:
    client = TestClient(_make_app())
    resp = client.post(
        "/adaptive/select-multi-dim",
        json={
            "conceptMastery": {},
            "bloomMastery": {},
            "candidates": [],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["questionId"] is None


def test_route_root_cause_with_unknown_mastery_treats_as_weak() -> None:
    client = TestClient(_make_app())
    resp = client.post(
        "/adaptive/diagnostic/root-cause",
        json={
            "primaryConceptId": "a",
            "userConceptMastery": {"a": 0.9},  # b absent
            "edges": [{"fromConceptId": "a", "toConceptId": "b"}],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["rootCauseConceptId"] == "b"
