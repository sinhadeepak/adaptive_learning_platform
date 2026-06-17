"""AI Content Guardrail — L1/L2/L3 engine, decision matrix, L3 helpers.

Pure-logic + stub-driven tests. The engine's I/O collaborators (gateway,
embedding client, hash/vector stores, trace sink) are substituted with
in-memory fakes so the orchestration is exercised without DB/Redis/OpenAI.
"""

from __future__ import annotations

import asyncio

import pytest

from learning.ai_authoring.guardrail import (
    GuardrailConfig,
    GuardrailEngine,
    SelfAuditReport,
    decide,
    decide_l2,
)
from learning.ai_authoring.guardrail.schemas import L3Result
from learning.ai_authoring.guardrail.similarity import (
    cosine,
    md5_hash,
    normalize_stem,
    run_l3,
)
from learning.ai_gateway import AIGateway, PromptRegistry
from learning.ai_gateway.prompt_registry import PromptTemplate
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routing import default_stub_config


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _reset_cache():
    from learning.ai_gateway.cache import reset_for_tests
    reset_for_tests()
    yield
    reset_for_tests()


CFG = GuardrailConfig()


def _report(overall: str, *, conf: int = 95, checks: bool = True) -> SelfAuditReport:
    return SelfAuditReport(
        check1_expression_pass=checks,
        check2_distractor_pass=checks,
        check3_explanation_pass=checks,
        confidence=conf,
        overall=overall,  # type: ignore[arg-type]
    )


# ── normalize / md5 / cosine ──────────────────────────────────────────────────


def test_normalize_strips_punctuation_and_case() -> None:
    assert normalize_stem("What IS  Force? (N)") == "what is force n"


def test_md5_stable_across_punctuation_and_case() -> None:
    assert md5_hash("What is Force?") == md5_hash("what   is force!!!")


def test_md5_differs_for_different_content() -> None:
    assert md5_hash("What is force?") != md5_hash("What is energy?")


def test_cosine_identical_is_one() -> None:
    assert cosine([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) == pytest.approx(1.0)


def test_cosine_orthogonal_is_zero() -> None:
    assert cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_zero_vector_is_zero() -> None:
    assert cosine([0.0, 0.0], [1.0, 1.0]) == 0.0


# ── decide_l2 — confidence floors ─────────────────────────────────────────────


def test_decide_l2_pass_clean() -> None:
    assert decide_l2(_report("PASS"), CFG) == "PASS"


def test_decide_l2_low_confidence_forces_fail() -> None:
    assert decide_l2(_report("PASS", conf=50), CFG) == "FAIL"


def test_decide_l2_midrange_confidence_downgrades_to_review() -> None:
    # 70 is below review_floor (80) but above fail_floor (60).
    assert decide_l2(_report("PASS", conf=70), CFG) == "REVIEW"


def test_decide_l2_failed_check_downgrades_pass_to_review() -> None:
    assert decide_l2(_report("PASS", checks=False), CFG) == "REVIEW"


def test_decide_l2_model_fail_not_upgraded() -> None:
    assert decide_l2(_report("FAIL", conf=99), CFG) == "FAIL"


# ── decide — the 9-path matrix (L2 × L3) ──────────────────────────────────────

CLEAN = L3Result(exact_hash_hit=False, over_threshold=False)
NEAR = L3Result(exact_hash_hit=False, over_threshold=True, similarity_score=0.97)
HASH = L3Result(exact_hash_hit=True)


@pytest.mark.parametrize(
    "l2_overall,l3,expected",
    [
        ("PASS", CLEAN, "PASS"),
        ("PASS", NEAR, "REVIEW"),
        ("PASS", HASH, "FAIL"),
        ("REVIEW", CLEAN, "REVIEW"),
        ("REVIEW", NEAR, "REVIEW"),
        ("REVIEW", HASH, "FAIL"),
        ("FAIL", CLEAN, "FAIL"),
        ("FAIL", NEAR, "FAIL"),
        ("FAIL", HASH, "FAIL"),
    ],
)
def test_decide_nine_paths(l2_overall, l3, expected) -> None:
    assert decide(_report(l2_overall), l3, CFG) == expected


def test_decide_threshold_boundary_not_over() -> None:
    # Exactly at threshold (0.92) is NOT over (strict >), so a PASS stays PASS.
    at = L3Result(exact_hash_hit=False, over_threshold=False, similarity_score=0.92)
    assert decide(_report("PASS"), at, CFG) == "PASS"


# ── run_l3 with fake stores ───────────────────────────────────────────────────


class _FakeHashStore:
    def __init__(self, hits: set[str]) -> None:
        self._hits = hits

    async def exists(self, md5: str) -> bool:
        return md5 in self._hits

    async def reserve(self, md5, ttl_seconds=3600):
        return None

    async def commit(self, md5, question_id):
        return None


class _FakeVectorStore:
    def __init__(self, neighbour):
        self._neighbour = neighbour

    async def nearest(self, embedding):
        return self._neighbour

    async def store(self, qid, embedding):
        return None


def test_run_l3_exact_hash_short_circuits() -> None:
    stem = "What is the unit of force?"
    store = _FakeHashStore({md5_hash(stem)})
    res = _run(run_l3(
        stem=stem, embedding=[1.0] * 4,
        hash_store=store, vector_store=_FakeVectorStore(("q1", 0.99)),
        threshold=0.92,
    ))
    assert res.exact_hash_hit is True
    # vector lookup skipped — no similarity recorded.
    assert res.similarity_score is None


def test_run_l3_near_duplicate_flagged() -> None:
    res = _run(run_l3(
        stem="novel stem", embedding=[1.0] * 4,
        hash_store=_FakeHashStore(set()),
        vector_store=_FakeVectorStore(("q7", 0.95)),
        threshold=0.92,
    ))
    assert res.exact_hash_hit is False
    assert res.over_threshold is True
    assert res.nearest_neighbour_id == "q7"


def test_run_l3_clean_when_below_threshold() -> None:
    res = _run(run_l3(
        stem="novel stem", embedding=[1.0] * 4,
        hash_store=_FakeHashStore(set()),
        vector_store=_FakeVectorStore(("q7", 0.40)),
        threshold=0.92,
    ))
    assert res.over_threshold is False


# ── gateway.embed via stub ────────────────────────────────────────────────────


def _stub_gateway(canned: dict | None = None) -> AIGateway:
    reg = PromptRegistry()
    reg._templates[("guardrail_self_audit", "1.0.0")] = PromptTemplate(
        id="guardrail_self_audit", version="1.0.0", touchpoint="quality_check",
        system="q={question_json} t={type_id} topic={topic}",
        output_schema="SelfAuditReport",
    )
    stub = StubProvider()
    for k, v in (canned or {}).items():
        stub.register_stub_response(k, v)
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})


def test_gateway_embed_returns_vectors() -> None:
    gw = _stub_gateway()
    vecs = _run(gw.embed(texts=["hello", "world"]))
    assert len(vecs) == 2
    assert len(vecs[0]) == 1536
    # Deterministic: same text → same vector.
    again = _run(gw.embed(texts=["hello"]))
    assert again[0] == vecs[0]


# ── engine retry / escalation ─────────────────────────────────────────────────


def _audit_canned(overall: str, conf: int = 95) -> dict:
    return {
        "SelfAuditReport": {
            "check1_expression_pass": True,
            "check1_reason": "",
            "check2_distractor_pass": True,
            "check2_reason": "",
            "check3_explanation_pass": True,
            "check3_reason": "",
            "confidence": conf,
            "overall": overall,
            "fail_reason": "" if overall != "FAIL" else "looks copied",
        }
    }


class _Payload:
    """Minimal stand-in for a draft payload (has .stem + model_dump)."""

    def __init__(self, stem: str) -> None:
        self.stem = stem

    def model_dump(self) -> dict:
        return {"stem": self.stem}


def test_engine_pass_returns_first_attempt() -> None:
    gw = _stub_gateway(_audit_canned("PASS"))
    engine = GuardrailEngine(gw, config=GuardrailConfig())
    calls = {"n": 0}

    async def gen(attempt: int):
        calls["n"] += 1
        return _Payload("a brand new stem")

    payload, verdict = _run(engine.run(
        gen, type_id="MCQ_SINGLE", topic="Mechanics", group_id="g1",
    ))
    assert verdict.status == "PASS"
    assert verdict.generation_attempt == 1
    assert calls["n"] == 1
    assert verdict.normalized_hash == md5_hash("a brand new stem")


def test_engine_retries_on_fail_then_escalates() -> None:
    gw = _stub_gateway(_audit_canned("FAIL", conf=30))
    engine = GuardrailEngine(gw, config=GuardrailConfig(max_attempts=3))
    calls = {"n": 0}

    async def gen(attempt: int):
        calls["n"] += 1
        return _Payload(f"stem attempt {attempt}")

    payload, verdict = _run(engine.run(
        gen, type_id="MCQ_SINGLE", topic="Mechanics", group_id="g2",
    ))
    assert verdict.status == "FAIL"
    assert verdict.generation_attempt == 3
    assert calls["n"] == 3  # regenerated until attempts exhausted


def test_engine_review_returns_without_retry() -> None:
    gw = _stub_gateway(_audit_canned("REVIEW", conf=75))
    engine = GuardrailEngine(gw, config=GuardrailConfig())
    calls = {"n": 0}

    async def gen(attempt: int):
        calls["n"] += 1
        return _Payload("borderline stem")

    payload, verdict = _run(engine.run(
        gen, type_id="MCQ_SINGLE", topic="Mechanics", group_id="g3",
    ))
    assert verdict.status == "REVIEW"
    assert calls["n"] == 1


# ── draft_question integration (engine wired) ─────────────────────────────────


def _draft_gateway(audit_overall: str) -> AIGateway:
    """Gateway with the authoring + self-audit templates so draft_question
    runs end-to-end through the guardrail engine on stubs."""
    from learning.ai_authoring.draft import DraftMCQ

    reg = PromptRegistry()
    reg._templates[("mcq_single_draft", "1.0.0")] = PromptTemplate(
        id="mcq_single_draft", version="1.0.0", touchpoint="authoring",
        system=("{guardrail_preamble} topic={topic} difficulty={difficulty} "
                "exam={exam} sc={syllabus_chapter} sm={source_material}"),
        output_schema="DraftMCQ",
    )
    reg._templates[("guardrail_self_audit", "1.0.0")] = PromptTemplate(
        id="guardrail_self_audit", version="1.0.0", touchpoint="quality_check",
        system="q={question_json} t={type_id} topic={topic}",
        output_schema="SelfAuditReport",
    )
    stub = StubProvider()
    stub.register_stub_response("DraftMCQ", {
        "stem": "What is the SI unit of force?",
        "options": [
            {"id": "A", "text": "Newton", "is_correct": True},
            {"id": "B", "text": "Joule", "is_correct": False},
            {"id": "C", "text": "Watt", "is_correct": False},
            {"id": "D", "text": "Pascal", "is_correct": False},
        ],
        "correct_id": "A",
        "explanation": "Force is measured in newtons.",
    })
    stub.register_stub_response("SelfAuditReport", _audit_canned(audit_overall)["SelfAuditReport"])
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})


def test_draft_question_carries_guardrail_verdict() -> None:
    from learning.ai_authoring.draft import DraftQuestionRequest, draft_question

    gw = _draft_gateway("PASS")
    engine = GuardrailEngine(gw, config=GuardrailConfig())
    req = DraftQuestionRequest(type_id="MCQ_SINGLE", topic="Mechanics", exam="NEET")
    draft, marker = _run(draft_question(gw, request=req, engine=engine))
    assert marker.guardrail is not None
    assert marker.guardrail.status == "PASS"
    assert marker.guardrail.audit_confidence == 95


def test_draft_question_killswitch_skips_guardrail() -> None:
    from learning.ai_authoring.draft import DraftQuestionRequest, draft_question

    gw = _draft_gateway("FAIL")
    engine = GuardrailEngine(gw, config=GuardrailConfig(enabled=False))
    req = DraftQuestionRequest(type_id="MCQ_SINGLE", topic="Mechanics", exam="NEET")
    draft, marker = _run(draft_question(gw, request=req, engine=engine))
    # Kill-switch off → no L2 call, no verdict, behaves as pre-guardrail.
    assert marker.guardrail is None


# ── DRAFT-write admission enforcement (pure) ──────────────────────────────────


def test_admission_admits_human_authored() -> None:
    from learning.content.guardrail_enforcement import guardrail_admission

    d = guardrail_admission(None)
    assert d.admit is True
    assert d.guardrail_status is None


def test_admission_admits_when_no_guardrail_block() -> None:
    from learning.content.guardrail_enforcement import guardrail_admission

    d = guardrail_admission({"model": "openai:gpt-4o"})
    assert d.admit is True


def test_admission_rejects_fail_verdict() -> None:
    from learning.content.guardrail_enforcement import guardrail_admission

    d = guardrail_admission({"guardrail": {"status": "FAIL", "fail_reason": "copied"}})
    assert d.admit is False
    assert d.code == "guardrail_failed"
    assert d.reason == "copied"


def test_admission_admits_pass_and_review_with_status() -> None:
    from learning.content.guardrail_enforcement import guardrail_admission

    assert guardrail_admission({"guardrail": {"status": "PASS"}}).guardrail_status == "PASS"
    review = guardrail_admission({"guardrail": {"status": "REVIEW"}})
    assert review.admit is True
    assert review.guardrail_status == "REVIEW"


def test_admission_unknown_status_flags_review() -> None:
    from learning.content.guardrail_enforcement import guardrail_admission

    d = guardrail_admission({"guardrail": {"status": "???"}})
    assert d.admit is True
    assert d.guardrail_status == "REVIEW"
