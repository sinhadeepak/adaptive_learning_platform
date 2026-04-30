"""Phase 5 (P5-S37) — Pydantic payload contract conformance tests.

Locks the contracts before migrations land. Each test exercises:
 - happy-path validation (valid payload accepted)
 - cross-field consistency (model_validator catches bad combinations)
 - required-field enforcement
 - JSON round-trip (model_dump → model_validate matches)

These are pure-function tests with no DB / HTTP / async dependencies.
Run standalone via `python -c` or via pytest. No conftest needed.
"""

from __future__ import annotations

from datetime import datetime

import pytest
from pydantic import ValidationError

# ── Foundation contracts ─────────────────────────────────────────────────────

from learning.types.base import (
    EvaluationMode,
    EvaluatorMetadata,
    PartDetail,
    Resolution,
)
from learning.types.registry import (
    RegistryConformanceError,
    _reset_for_tests,
    all_type_metas,
    get_handler,
    is_supported,
    register_handler,
)


# ── Resolution contract ──────────────────────────────────────────────────────


def test_resolution_minimal_valid() -> None:
    r = Resolution(
        question_id="q1",
        type_id="MCQ_SINGLE",
        status="CORRECT",
        matched_count=1,
        total_count=1,
        evaluation_mode="DETERMINISTIC",
    )
    assert r.per_part == []
    assert r.evaluator_metadata is None


def test_resolution_with_per_part_and_metadata() -> None:
    r = Resolution(
        question_id="q1",
        type_id="ESSAY",
        status="PENDING_HUMAN_REVIEW",
        matched_count=0,
        total_count=4,
        per_part=[
            PartDetail(id="c1", matched=True, ai_confidence=0.92),
            PartDetail(id="c2", matched=False, ai_confidence=0.65),
        ],
        evaluation_mode="HYBRID",
        evaluator_metadata=EvaluatorMetadata(
            model="claude-opus-4-7",
            rubric_version=2,
            prompt_version="3.1.0",
            evaluated_at=datetime(2026, 4, 30, 12, 0, 0),
            human_review_required=True,
        ),
    )
    assert len(r.per_part) == 2
    assert r.evaluator_metadata.prompt_version == "3.1.0"


def test_resolution_negative_counts_rejected() -> None:
    with pytest.raises(ValidationError):
        Resolution(
            question_id="q1",
            type_id="MCQ_SINGLE",
            status="CORRECT",
            matched_count=-1,  # Field(ge=0)
            total_count=1,
            evaluation_mode="DETERMINISTIC",
        )


def test_part_detail_confidence_bounds() -> None:
    PartDetail(id="x", matched=True, ai_confidence=0.0)
    PartDetail(id="x", matched=True, ai_confidence=1.0)
    PartDetail(id="x", matched=True, ai_confidence=None)
    with pytest.raises(ValidationError):
        PartDetail(id="x", matched=True, ai_confidence=1.5)
    with pytest.raises(ValidationError):
        PartDetail(id="x", matched=True, ai_confidence=-0.1)


# ── Objective family ─────────────────────────────────────────────────────────


from learning.types.objective.payloads import (
    AssertionReasonPayload,
    MCQMultiPayload,
    MCQOption,
    MCQSinglePayload,
    MultiStatementOption,
    MultiStatementPayload,
    StatementItem,
    TrueFalsePayload,
)


def test_mcq_single_happy_path() -> None:
    p = MCQSinglePayload(
        stem="What is 2 + 2?",
        options=[MCQOption(id="A", text="3"), MCQOption(id="B", text="4")],
        correct_id="B",
    )
    assert p.correct_id == "B"


def test_mcq_single_correct_id_must_be_in_options() -> None:
    with pytest.raises(ValidationError):
        MCQSinglePayload(
            stem="What is 2 + 2?",
            options=[MCQOption(id="A", text="3"), MCQOption(id="B", text="4")],
            correct_id="C",  # not in options
        )


def test_mcq_single_duplicate_option_ids_rejected() -> None:
    with pytest.raises(ValidationError):
        MCQSinglePayload(
            stem="What is 2 + 2?",
            options=[MCQOption(id="A", text="3"), MCQOption(id="A", text="4")],
            correct_id="A",
        )


def test_mcq_multi_correct_subset_of_options() -> None:
    p = MCQMultiPayload(
        stem="Pick all primes",
        options=[
            MCQOption(id="A", text="2"),
            MCQOption(id="B", text="3"),
            MCQOption(id="C", text="4"),
        ],
        correct_ids=["A", "B"],
    )
    assert sorted(p.correct_ids) == ["A", "B"]


def test_mcq_multi_unknown_correct_id_rejected() -> None:
    with pytest.raises(ValidationError):
        MCQMultiPayload(
            stem="Pick all primes",
            options=[MCQOption(id="A", text="2")],
            correct_ids=["A", "Z"],
        )


def test_assertion_reason_canonical_options() -> None:
    # A: both true, R explains A
    p = AssertionReasonPayload(
        assertion="Water freezes at 0°C",
        reason="0°C is the freezing point of water at standard pressure",
        assertion_true=True,
        reason_true=True,
        reason_explains_assertion=True,
    )
    assert p.canonical_correct() == "A"

    # B: both true but R does not explain
    p2 = AssertionReasonPayload(
        assertion="Water freezes at 0°C",
        reason="The Earth orbits the Sun",
        assertion_true=True,
        reason_true=True,
        reason_explains_assertion=False,
    )
    assert p2.canonical_correct() == "B"

    # C: A true, R false
    p3 = AssertionReasonPayload(
        assertion="Water freezes at 0°C",
        reason="Water boils at 50°C",
        assertion_true=True,
        reason_true=False,
        reason_explains_assertion=False,
    )
    assert p3.canonical_correct() == "C"

    # D: A false, R true
    p4 = AssertionReasonPayload(
        assertion="Water freezes at 50°C",
        reason="0°C is the freezing point of water at standard pressure",
        assertion_true=False,
        reason_true=True,
        reason_explains_assertion=False,
    )
    assert p4.canonical_correct() == "D"

    # E: both false
    p5 = AssertionReasonPayload(
        assertion="Water freezes at 50°C",
        reason="Water boils at 50°C",
        assertion_true=False,
        reason_true=False,
        reason_explains_assertion=False,
    )
    assert p5.canonical_correct() == "E"


def test_assertion_reason_explains_requires_both_true() -> None:
    with pytest.raises(ValidationError):
        AssertionReasonPayload(
            assertion="x",
            reason="y" * 8,
            assertion_true=False,
            reason_true=True,
            reason_explains_assertion=True,
        )


def test_multi_statement_correct_option_must_match_truly_correct() -> None:
    # Truly-correct = {1, 3}; correct option B selects [1, 3] — valid
    MultiStatementPayload(
        stem="Which statements are correct?",
        statements=[
            StatementItem(id="1", text="x" * 4, is_correct=True),
            StatementItem(id="2", text="y" * 4, is_correct=False),
            StatementItem(id="3", text="z" * 4, is_correct=True),
        ],
        options=[
            MultiStatementOption(id="A", text="Only 1", selects=["1"]),
            MultiStatementOption(id="B", text="Only 1 and 3", selects=["1", "3"]),
        ],
        correct_option_id="B",
    )
    # Now the correct option says [1] but truly-correct = {1, 3} — must fail
    with pytest.raises(ValidationError):
        MultiStatementPayload(
            stem="Which statements are correct?",
            statements=[
                StatementItem(id="1", text="x" * 4, is_correct=True),
                StatementItem(id="2", text="y" * 4, is_correct=False),
                StatementItem(id="3", text="z" * 4, is_correct=True),
            ],
            options=[
                MultiStatementOption(id="A", text="Only 1", selects=["1"]),
            ],
            correct_option_id="A",
        )


def test_true_false_round_trip() -> None:
    p = TrueFalsePayload(statement="The sky is blue today", correct=True)
    json_data = p.model_dump_json()
    p2 = TrueFalsePayload.model_validate_json(json_data)
    assert p == p2


# ── Numeric family ───────────────────────────────────────────────────────────


from learning.types.numeric.payloads import (
    FormulaInputPayload,
    NumericDecimalPayload,
    NumericIntegerPayload,
    NumericRangePayload,
)


def test_numeric_integer_happy() -> None:
    NumericIntegerPayload(stem="5 + 5 = ?", correct=10, unit=None)


def test_numeric_decimal_tolerance_must_be_positive() -> None:
    NumericDecimalPayload(stem="pi to 2dp", correct=3.14, tolerance=0.01)
    with pytest.raises(ValidationError):
        NumericDecimalPayload(stem="pi to 2dp", correct=3.14, tolerance=0.0)


def test_numeric_range_well_ordered() -> None:
    NumericRangePayload(stem="What is the speed range?", low=10.0, high=20.0)
    with pytest.raises(ValidationError):
        NumericRangePayload(stem="What is the speed range?", low=20.0, high=10.0)


def test_formula_input_happy() -> None:
    FormulaInputPayload(
        stem="Solve x^2 - 5x + 6 = 0",
        target_expression="x = 2 or x = 3",
        equivalent_forms=["x in {2, 3}"],
        free_symbols=["x"],
    )


# ── Matching family ──────────────────────────────────────────────────────────


from learning.types.matching.payloads import (
    CategoryAssignment,
    ClassificationPayload,
    MatchItem,
    MatchPair,
    MatchTheFollowingPayload,
    SequencingPayload,
)


def test_match_the_following_pairs_consistent() -> None:
    MatchTheFollowingPayload(
        stem="Match scientists to discoveries",
        list_a=[MatchItem(id="a1", text="Newton"), MatchItem(id="a2", text="Einstein")],
        list_b=[
            MatchItem(id="b1", text="Gravity"),
            MatchItem(id="b2", text="Relativity"),
            MatchItem(id="b3", text="Quantum"),  # distractor
        ],
        correct_pairs=[
            MatchPair(left_id="a1", right_id="b1"),
            MatchPair(left_id="a2", right_id="b2"),
        ],
    )


def test_match_the_following_unpaired_left_rejected() -> None:
    with pytest.raises(ValidationError):
        MatchTheFollowingPayload(
            stem="Match scientists to discoveries",
            list_a=[MatchItem(id="a1", text="Newton"), MatchItem(id="a2", text="Einstein")],
            list_b=[MatchItem(id="b1", text="Gravity")],
            correct_pairs=[MatchPair(left_id="a1", right_id="b1")],  # a2 not paired
        )


def test_sequencing_correct_order_must_equal_items() -> None:
    SequencingPayload(
        stem="Order events",
        items=[
            MatchItem(id="x1", text="1857 War"),
            MatchItem(id="x2", text="1885 INC founded"),
            MatchItem(id="x3", text="1947 Independence"),
        ],
        correct_order=["x1", "x2", "x3"],
    )
    with pytest.raises(ValidationError):
        SequencingPayload(
            stem="Order events",
            items=[
                MatchItem(id="x1", text="A"),
                MatchItem(id="x2", text="B"),
            ],
            correct_order=["x1"],  # missing x2
        )


def test_classification_all_items_assigned() -> None:
    ClassificationPayload(
        stem="Classify",
        items=[
            MatchItem(id="i1", text="Tiger"),
            MatchItem(id="i2", text="Eagle"),
        ],
        categories=[
            MatchItem(id="c1", text="Mammal"),
            MatchItem(id="c2", text="Bird"),
        ],
        correct_assignments=[
            CategoryAssignment(item_id="i1", category_id="c1"),
            CategoryAssignment(item_id="i2", category_id="c2"),
        ],
    )
    with pytest.raises(ValidationError):
        ClassificationPayload(
            stem="Classify",
            items=[MatchItem(id="i1", text="Tiger"), MatchItem(id="i2", text="Eagle")],
            categories=[MatchItem(id="c1", text="Mammal"), MatchItem(id="c2", text="Bird")],
            correct_assignments=[CategoryAssignment(item_id="i1", category_id="c1")],
        )


# ── Fill-in family ───────────────────────────────────────────────────────────


from learning.types.fill_in.payloads import (
    BlankSpec,
    ClozeBlank,
    ClozePassagePayload,
    FillBlankMultiPayload,
    FillBlankSinglePayload,
    ShortTextPayload,
)


def test_fill_blank_single_requires_marker_in_stem() -> None:
    FillBlankSinglePayload(
        stem="Mitochondria are the ___ of the cell",
        accepted=["powerhouse"],
    )
    with pytest.raises(ValidationError):
        FillBlankSinglePayload(
            stem="Mitochondria are the powerhouse of the cell",  # no blank marker
            accepted=["powerhouse"],
        )


def test_fill_blank_multi_placeholder_consistency() -> None:
    FillBlankMultiPayload(
        stem="The capital of {{1}} is {{2}}",
        blanks=[
            BlankSpec(id="1", accepted=["India"]),
            BlankSpec(id="2", accepted=["New Delhi", "Delhi"]),
        ],
    )
    with pytest.raises(ValidationError):
        FillBlankMultiPayload(
            stem="The capital of {{1}} is unknown",
            blanks=[
                BlankSpec(id="1", accepted=["India"]),
                BlankSpec(id="2", accepted=["Delhi"]),  # placeholder {{2}} missing
            ],
        )


def test_cloze_passage_blanks_referenced() -> None:
    ClozePassagePayload(
        passage="The {{1}} sat on the {{2}}.",
        blanks=[
            ClozeBlank(id="1", accepted=["cat", "dog"]),
            ClozeBlank(id="2", accepted=["mat", "rug"]),
        ],
    )


def test_short_text_requires_concepts() -> None:
    ShortTextPayload(
        stem="Define photosynthesis",
        model_answer="Plants use sunlight, CO2, water to make glucose and O2.",
        key_concepts=["sunlight", "glucose", "oxygen"],
    )


# ── Subjective family ────────────────────────────────────────────────────────


from learning.types.subjective.payloads import (
    CaseStudyPayload,
    ChildReference,
    ComprehensionLongPayload,
    DescriptiveLongPayload,
    EssayPayload,
    Rubric,
    RubricCriterion,
)


def _valid_rubric() -> Rubric:
    return Rubric(
        version=1,
        criteria=[
            RubricCriterion(id="c1", text="Defines key terms", weight=30),
            RubricCriterion(id="c2", text="Uses examples", weight=40),
            RubricCriterion(id="c3", text="Concludes coherently", weight=30),
        ],
    )


def test_essay_word_count_range_well_ordered() -> None:
    EssayPayload(
        stem="Discuss Gandhian philosophy in modern India",
        expected_word_count_range=(200, 300),
        model_answer="Gandhian philosophy remains relevant because..." * 3,
        rubric=_valid_rubric(),
    )
    with pytest.raises(ValidationError):
        EssayPayload(
            stem="Discuss Gandhian philosophy in modern India",
            expected_word_count_range=(300, 200),  # min > max
            model_answer="x" * 50,
            rubric=_valid_rubric(),
        )


def test_rubric_weights_must_sum_to_100() -> None:
    Rubric(
        version=1,
        criteria=[
            RubricCriterion(id="a", text="x" * 4, weight=50),
            RubricCriterion(id="b", text="y" * 4, weight=50),
        ],
    )
    with pytest.raises(ValidationError):
        Rubric(
            version=1,
            criteria=[
                RubricCriterion(id="a", text="x" * 4, weight=40),
                RubricCriterion(id="b", text="y" * 4, weight=40),
            ],
        )


def test_descriptive_long_round_trip() -> None:
    p = DescriptiveLongPayload(
        stem="Derive the time complexity of QuickSort worst case",
        expected_word_count_range=(150, 400),
        model_answer="QuickSort recurrence T(n) = T(n-1) + O(n) yields O(n^2)..." * 2,
        rubric=_valid_rubric(),
    )
    p2 = DescriptiveLongPayload.model_validate_json(p.model_dump_json())
    assert p == p2


def test_case_study_ordinals_dense() -> None:
    CaseStudyPayload(
        scenario="A 4-page corporate scenario describing the launch of..." * 8,
        child_questions=[
            ChildReference(question_id="q1", ordinal=1),
            ChildReference(question_id="q2", ordinal=2),
            ChildReference(question_id="q3", ordinal=3),
        ],
    )
    with pytest.raises(ValidationError):
        CaseStudyPayload(
            scenario="x" * 50,
            child_questions=[
                ChildReference(question_id="q1", ordinal=1),
                ChildReference(question_id="q2", ordinal=3),  # gap
            ],
        )


def test_comprehension_long_min_passage() -> None:
    ComprehensionLongPayload(
        passage="x" * 250,  # ≥ 200
        child_questions=[
            ChildReference(question_id=f"q{i}", ordinal=i) for i in range(1, 4)
        ],
    )


# ── Visual family ────────────────────────────────────────────────────────────


from learning.types.visual.payloads import (
    CircleShape,
    DiagramHotspotPayload,
    DiagramLabelPayload,
    GeoPoint,
    GeoPolygon,
    HotspotRegion,
    LabelOption,
    MapLocationPayload,
    Marker,
    MarkerLabelPair,
    PictorialIdentifyPayload,
    PictorialOption,
    PolygonShape,
    RectShape,
)


def test_diagram_hotspot_exactly_one_correct() -> None:
    DiagramHotspotPayload(
        stem="Click on the right ventricle",
        image_media_id="m1",
        hotspots=[
            HotspotRegion(
                id="h1",
                label="Right ventricle",
                shape=CircleShape(cx=100, cy=100, r=40),
                is_correct=True,
            ),
            HotspotRegion(
                id="h2",
                label="Left ventricle",
                shape=RectShape(x=200, y=100, width=50, height=50),
                is_correct=False,
            ),
        ],
    )
    with pytest.raises(ValidationError):
        DiagramHotspotPayload(
            stem="Click on the right ventricle",
            image_media_id="m1",
            hotspots=[
                HotspotRegion(
                    id="h1",
                    label="x",
                    shape=CircleShape(cx=100, cy=100, r=40),
                    is_correct=True,
                ),
                HotspotRegion(
                    id="h2",
                    label="y",
                    shape=CircleShape(cx=200, cy=200, r=40),
                    is_correct=True,  # second correct → invalid
                ),
            ],
        )


def test_polygon_shape_min_3_points() -> None:
    PolygonShape(points=[(0, 0), (10, 0), (5, 10)])
    with pytest.raises(ValidationError):
        PolygonShape(points=[(0, 0), (10, 0)])


def test_diagram_label_pairs_consistent() -> None:
    DiagramLabelPayload(
        stem="Label the cell organelles",
        image_media_id="m1",
        markers=[Marker(id="m1", x=100, y=100), Marker(id="m2", x=200, y=200)],
        labels=[
            LabelOption(id="l1", text="Mitochondria"),
            LabelOption(id="l2", text="Nucleus"),
            LabelOption(id="l3", text="Vacuole"),  # distractor
        ],
        correct_pairs=[
            MarkerLabelPair(marker_id="m1", label_id="l1"),
            MarkerLabelPair(marker_id="m2", label_id="l2"),
        ],
    )


def test_map_location_custom_requires_media() -> None:
    MapLocationPayload(
        stem="Click on Maharashtra",
        base_map="india",
        correct_region=GeoPolygon(
            points=[
                GeoPoint(lat=15.6, lng=72.8),
                GeoPoint(lat=22.0, lng=72.8),
                GeoPoint(lat=22.0, lng=80.0),
                GeoPoint(lat=15.6, lng=80.0),
            ]
        ),
    )
    with pytest.raises(ValidationError):
        MapLocationPayload(
            stem="Click on a region",
            base_map="custom",  # missing custom_map_media_id
            correct_region=GeoPolygon(
                points=[GeoPoint(lat=0, lng=0), GeoPoint(lat=1, lng=0), GeoPoint(lat=1, lng=1)]
            ),
        )


def test_pictorial_identify_correct_in_options() -> None:
    PictorialIdentifyPayload(
        stem="Identify this monument",
        image_media_id="m1",
        options=[
            PictorialOption(id="A", text="Hampi"),
            PictorialOption(id="B", text="Hampi temple"),
            PictorialOption(id="C", text="Khajuraho"),
            PictorialOption(id="D", text="Konark"),
        ],
        correct_id="A",
    )


# ── Audio/Video family (gated) ───────────────────────────────────────────────


from learning.types.audio_video.payloads import (
    AudioVideoChildReference,
    ListeningCompPayload,
    VideoQuestionPayload,
)


def test_listening_comp_ordinals_dense() -> None:
    ListeningCompPayload(
        audio_media_id="a1",
        transcript="Speaker A: Hello, how are you? Speaker B: I'm well, thanks." * 3,
        child_questions=[
            AudioVideoChildReference(question_id="q1", ordinal=1, timestamp_seconds=10.0),
            AudioVideoChildReference(question_id="q2", ordinal=2),
        ],
    )


def test_video_question_min_one_child() -> None:
    VideoQuestionPayload(
        video_media_id="v1",
        child_questions=[
            AudioVideoChildReference(question_id="q1", ordinal=1, timestamp_seconds=42.0),
        ],
    )


# ── Interactive family (gated) ───────────────────────────────────────────────


from learning.types.interactive.payloads import (
    AdaptiveDifficultyPayload,
    DifficultyVariant,
    KBCLifelinePayload,
    RevealStep,
    TimedRevealPayload,
)


def test_kbc_audience_poll_distribution_required_when_lifeline_set() -> None:
    KBCLifelinePayload(
        inner_question_id="q1",
        available_lifelines=["50_50"],
    )
    KBCLifelinePayload(
        inner_question_id="q1",
        available_lifelines=["audience_poll"],
        audience_poll_distribution={"A": 60.0, "B": 20.0, "C": 15.0, "D": 5.0},
    )
    with pytest.raises(ValidationError):
        KBCLifelinePayload(
            inner_question_id="q1",
            available_lifelines=["audience_poll"],
            # missing distribution
        )


def test_timed_reveal_strict_increasing() -> None:
    TimedRevealPayload(
        inner_question_id="q1",
        initial_stem="Identify this country from the outline",
        reveal_schedule=[
            RevealStep(at_seconds=10, additional_info="Flag appears"),
            RevealStep(at_seconds=20, additional_info="Capital city revealed"),
        ],
    )
    with pytest.raises(ValidationError):
        TimedRevealPayload(
            inner_question_id="q1",
            initial_stem="Identify this country",
            reveal_schedule=[
                RevealStep(at_seconds=20, additional_info="x" * 4),
                RevealStep(at_seconds=10, additional_info="y" * 4),
            ],
        )


def test_adaptive_difficulty_starting_in_pool() -> None:
    AdaptiveDifficultyPayload(
        variants=[
            DifficultyVariant(question_id="q1", difficulty_level=1),
            DifficultyVariant(question_id="q2", difficulty_level=3),
            DifficultyVariant(question_id="q3", difficulty_level=5),
        ],
        starting_difficulty=3,
    )
    with pytest.raises(ValidationError):
        AdaptiveDifficultyPayload(
            variants=[
                DifficultyVariant(question_id="q1", difficulty_level=1),
                DifficultyVariant(question_id="q2", difficulty_level=2),
            ],
            starting_difficulty=4,  # not in pool
        )


# ── Registry conformance ─────────────────────────────────────────────────────


class _GoodHandler:
    """Stand-in handler exercising every Protocol attr + method.
    Used to test the registry contract; not a real type implementation."""

    type_id = "TEST_TYPE"
    family = "Test"
    payload_schema = MCQSinglePayload  # any BaseModel subclass works
    response_schema = MCQSinglePayload
    evaluation_mode: EvaluationMode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def author_validate(self, payload):
        return []

    async def ai_generate_draft(self, prompt, context):
        raise NotImplementedError

    async def ai_quality_check(self, payload):
        raise NotImplementedError

    def translatable_fields(self, payload):
        return ["stem"]

    def merge_translation(self, payload, lang, translation):
        return payload

    def render_payload(self, payload, mode, lang):
        return payload

    async def evaluate(self, payload, response, lang):
        raise NotImplementedError

    def review_checklist(self, lang):
        return []


class _BadHandlerMissingMethod:
    type_id = "BAD_TYPE"
    family = "Bad"
    payload_schema = MCQSinglePayload
    response_schema = MCQSinglePayload
    evaluation_mode: EvaluationMode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    # missing all the methods


def test_registry_accepts_good_handler() -> None:
    _reset_for_tests()
    register_handler(_GoodHandler())
    assert is_supported("TEST_TYPE")
    assert get_handler("TEST_TYPE").type_id == "TEST_TYPE"
    metas = all_type_metas()
    assert len(metas) == 1
    assert metas[0].type_id == "TEST_TYPE"


def test_registry_rejects_handler_missing_methods() -> None:
    _reset_for_tests()
    with pytest.raises(RegistryConformanceError) as exc:
        register_handler(_BadHandlerMissingMethod())
    assert "missing required methods" in str(exc.value)


def test_registry_rejects_duplicate_type_id() -> None:
    _reset_for_tests()
    register_handler(_GoodHandler())
    with pytest.raises(RegistryConformanceError) as exc:
        register_handler(_GoodHandler())
    assert "already registered" in str(exc.value)


def test_registry_unknown_type_id_raises() -> None:
    _reset_for_tests()
    with pytest.raises(KeyError):
        get_handler("NONEXISTENT_TYPE")
