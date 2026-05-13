"""Generic polymorphic seed engine — given an exam-code, the topic
list, and a per-topic factual bank, generates 200 questions per
active type round-robin across the topics.

This is the shared core behind ``neet_polymorphic.py`` /
``jee_polymorphic.py`` / ``cbse_polymorphic.py``. It mirrors the
catalog of types covered by ``upsc_polymorphic.py`` but accepts
the data instead of hard-coding it, so a fourth exam can be added
in <100 lines of pure data (no generator changes).

Each exam module provides:

    EXAM_CODE: str                   # "NEET" / "JEE" / "CBSE"
    TOPICS: tuple[(topic_id, code)]  # round-robin distribution targets
    BANK: dict[code, list[(concept, fact_short, fact_long, distractors)]]
    NUMERIC_POOL: dict[code, list[(answer, prompt)]]     # NUMERIC_INTEGER
    DECIMAL_POOL: dict[code, list[(answer, tol, unit, prompt)]]  # NUMERIC_DECIMAL
    RANGE_POOL: dict[code, list[(low, high, unit, prompt)]]      # NUMERIC_RANGE
    FORMULA_POOL: list[(expr, prompt)]                            # FORMULA_INPUT
    SEQUENCING_POOL: dict[code, list[list[str]]]                  # SEQUENCING
    CLASSIFICATION_POOL: dict[code, dict]                          # CLASSIFICATION
    CLOZE_POOL: dict[code, (template, accepted)]                   # CLOZE_PASSAGE
    MAP_POOL: list[(name, lat, lng)]                               # MAP_LOCATION

Active types covered (24; the four gated families remain skipped).
"""

from __future__ import annotations

from typing import Any

ACTIVE_TYPES: tuple[str, ...] = (
    # Objective
    "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
    # Numeric
    "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
    # Matching
    "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
    # Fill-in
    "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
    # Subjective
    "ESSAY", "DESCRIPTIVE_LONG", "CASE_STUDY", "COMPREHENSION_LONG",
    # Visual
    "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
)

QUESTIONS_PER_TYPE = 200


def _difficulty(idx: int) -> float:
    return -1.5 + (idx % 7) * 0.5


def _gen_mcq_single(idx, exam, topic, concept, fact, _long, distractors, _ctx):
    choices = [fact] + distractors[:3]
    return {
        "stem": f"With reference to {concept}, which of the following is correct?",
        "choices": choices,
        "correct_idx": 0,
        "payload": None,
    }


def _gen_mcq_multi(idx, exam, topic, concept, fact, _long, distractors, _ctx):
    choices = [fact, distractors[0], f"{concept} is a foundational concept in {exam}.", distractors[1]]
    return {
        "stem": f"Regarding {concept}, which of the following statements are correct? (Select all that apply)",
        "choices": choices,
        "correct_idx": 0,
        "payload": {
            "options": [{"id": chr(65 + i), "text": c} for i, c in enumerate(choices)],
            "correct_ids": ["A", "C"],
            "partial_credit": True,
        },
    }


def _gen_true_false(idx, exam, topic, concept, _fact, long, _distractors, _ctx):
    is_true = idx % 2 == 0
    statement = long if is_true else f"It is widely held that {concept} was deprecated by recent revisions."
    return {
        "stem": f"True or False — {statement}",
        "choices": ["True", "False"],
        "correct_idx": 0 if is_true else 1,
        "payload": {"statement": statement, "correct": is_true},
    }


def _gen_assertion_reason(idx, exam, topic, concept, _fact, long, distractors, _ctx):
    cycle = idx % 4
    options = [
        "Both A and R are true and R is the correct explanation of A.",
        "Both A and R are true but R is NOT the correct explanation of A.",
        "A is true but R is false.",
        "A is false but R is true.",
    ]
    return {
        "stem": (
            f""
            f"Assertion (A): {long} "
            f"Reason (R): {concept} relates to {distractors[0]}. "
            f"Choose the correct option:"
        ),
        "choices": options,
        "correct_idx": cycle,
        "payload": {
            "assertion": long,
            "reason": f"{concept} relates to {distractors[0]}.",
            "options": [{"id": chr(65 + i), "text": t} for i, t in enumerate(options)],
            "correct_id": chr(65 + cycle),
        },
    }


def _gen_multi_statement(idx, exam, topic, concept, _fact, long, _distractors, _ctx):
    statements = [
        long,
        f"{concept} was first formalised in published literature in 1976.",
        f"{concept} can be described using a single closed-form equation.",
    ]
    options = ["1 and 2 only", "1 and 3 only", "2 and 3 only", "1, 2 and 3"]
    return {
        "stem": (
            f"Consider the following statements regarding {concept}:\n"
            f"1. {statements[0]}\n2. {statements[1]}\n3. {statements[2]}\n"
            f"Which of the statements given above are correct?"
        ),
        "choices": options,
        "correct_idx": 1,
        "payload": {
            "statements": [{"id": i + 1, "text": s} for i, s in enumerate(statements)],
            "options": [{"id": chr(65 + i), "text": o} for i, o in enumerate(options)],
            "correct_id": "B",
            "correct_statement_ids": [1, 3],
        },
    }


def _gen_numeric_integer(idx, exam, topic, _concept, _fact, _long, _distractors, ctx):
    pool = ctx["NUMERIC_POOL"].get(topic) or [(idx + 1, f"What integer best characterises this {topic} concept?")]
    answer, prompt = pool[idx % len(pool)]
    return {
        "stem": f"{prompt}",
        "choices": [str(answer)],
        "correct_idx": 0,
        "payload": {"answer": answer, "unit": None},
    }


def _gen_numeric_decimal(idx, exam, topic, concept, _fact, _long, _distractors, ctx):
    pool = ctx["DECIMAL_POOL"].get(topic) or [(1.0, 0.1, "", f"Estimate the decimal value relevant to {concept}.")]
    answer, tol, unit, prompt = pool[idx % len(pool)]
    return {
        "stem": f"{prompt}",
        "choices": [f"{answer} {unit}".strip()],
        "correct_idx": 0,
        "payload": {"answer": answer, "tolerance": tol, "unit": unit or None},
    }


def _gen_numeric_range(idx, exam, topic, concept, _fact, _long, _distractors, ctx):
    pool = ctx["RANGE_POOL"].get(topic) or [(1, 10, "", f"Provide a plausible range for {concept}.")]
    low, high, unit, prompt = pool[idx % len(pool)]
    return {
        "stem": f"{prompt}",
        "choices": [f"{low}-{high} {unit}".strip()],
        "correct_idx": 0,
        "payload": {"low": low, "high": high, "unit": unit or None},
    }


def _gen_formula_input(idx, exam, topic, _concept, _fact, _long, _distractors, ctx):
    pool = ctx["FORMULA_POOL"]
    expr, prompt = pool[idx % len(pool)]
    return {
        "stem": f"{prompt}",
        "choices": [expr],
        "correct_idx": 0,
        "payload": {"canonical_expr": expr, "variables": ["x", "y", "P", "R", "T", "v", "a", "F", "m"]},
    }


def _gen_match_following(idx, exam, topic, concept, _fact, _long, _distractors, ctx):
    entries = ctx["BANK"][topic]
    chosen = [entries[(idx + k) % len(entries)] for k in range(min(4, len(entries)))]
    pairs = [{"left": c[0], "right": c[1]} for c in chosen]
    return {
        "stem": f"Match List I with List II (related to {concept}):",
        "choices": [f"{p['left']} ↔ {p['right']}" for p in pairs],
        "correct_idx": 0,
        "payload": {"pairs": pairs},
    }


def _gen_sequencing(idx, exam, topic, concept, _fact, _long, _distractors, ctx):
    sequences = ctx["SEQUENCING_POOL"].get(topic) or [
        [f"{concept} step 1", f"{concept} step 2", f"{concept} step 3", f"{concept} step 4"],
    ]
    seq = sequences[idx % len(sequences)]
    return {
        "stem": f"Arrange the following in the correct order ({concept}):",
        "choices": seq,
        "correct_idx": 0,
        "payload": {"items": seq},
    }


def _gen_classification(idx, exam, topic, concept, _fact, _long, _distractors, ctx):
    bank = ctx["CLASSIFICATION_POOL"].get(topic) or {
        "categories": ["Group A", "Group B"],
        "items": [
            {"text": f"{concept} type 1", "category": "Group A"},
            {"text": f"{concept} type 2", "category": "Group B"},
        ],
    }
    return {
        "stem": f"Classify each of the following ({concept}):",
        "choices": [f"{i['text']} → {i['category']}" for i in bank["items"]],
        "correct_idx": 0,
        "payload": bank,
    }


def _gen_fill_blank_single(idx, exam, topic, concept, _fact, long, _distractors, _ctx):
    target = concept.split()[0]
    template = long.replace(target, "[BLANK]", 1)
    return {
        "stem": f"Fill in the blank: {template}",
        "choices": [target],
        "correct_idx": 0,
        "payload": {"template": template, "accepted": [[target, target.lower()]]},
    }


def _gen_fill_blank_multi(idx, exam, topic, concept, _fact, long, _distractors, _ctx):
    template = (
        f"The concept of {concept} is most clearly demonstrated in [BLANK] and is "
        f"foundationally related to [BLANK] in the {exam} curriculum."
    )
    return {
        "stem": f"Complete the statement (related to: {long[:80]}…):",
        "choices": ["chapter on " + concept + " · prerequisite chapter"],
        "correct_idx": 0,
        "payload": {
            "template": template,
            "accepted": [
                [f"chapter on {concept}", f"the {concept} chapter", concept],
                ["prerequisite chapter", "preceding topic", "earlier unit"],
            ],
        },
    }


def _gen_cloze(idx, exam, topic, concept, _fact, _long, _distractors, ctx):
    template, accepted = ctx["CLOZE_POOL"].get(topic) or (
        f"The {concept} concept involves [BLANK] which interacts with [BLANK] under [BLANK] conditions.",
        [["the primary entity"], ["the secondary entity"], ["standard"]],
    )
    return {
        "stem": f"Complete the cloze passage:",
        "choices": [template[:60] + "…"],
        "correct_idx": 0,
        "payload": {"template": template, "accepted": accepted},
    }


def _gen_short_text(idx, exam, topic, concept, fact, _long, _distractors, _ctx):
    return {
        "stem": f"In one sentence (≤30 words), explain '{concept}'.",
        "choices": [fact],
        "correct_idx": 0,
        "payload": {
            "expected_word_count_range": [10, 30],
            "model_answer": fact,
            "rubric": [
                {"criterion": "factual_accuracy", "weight": 60, "description": f"Mentions {concept} accurately."},
                {"criterion": "concision",        "weight": 40, "description": "Stays within the 30-word limit."},
            ],
        },
    }


def _gen_essay(idx, exam, topic, concept, _fact, long, _distractors, _ctx):
    return {
        "stem": (
            f""
            f"Discuss in 250 words: {long} "
            f"Critically examine the contemporary relevance of {concept}."
        ),
        "choices": ["See rubric for evaluation criteria."],
        "correct_idx": 0,
        "payload": {
            "expected_word_count_range": [200, 300],
            "model_answer_outline": [
                f"Introduction defining {concept}",
                "Historical / theoretical context",
                "Current relevance with two examples",
                "Conclusion balancing critique with value",
            ],
            "rubric": [
                {"criterion": "structure",         "weight": 20, "description": "Intro / body / conclusion structure."},
                {"criterion": "factual_grounding", "weight": 30, "description": "Cites at least 2 supporting facts."},
                {"criterion": "analytical_depth",  "weight": 30, "description": "Goes beyond description to analysis."},
                {"criterion": "language",          "weight": 20, "description": "Clarity, grammar, register."},
            ],
        },
    }


def _gen_descriptive_long(idx, exam, topic, concept, _fact, long, _distractors, _ctx):
    return {
        "stem": (
            f""
            f"In approximately 1000-1500 words, examine: {long} "
            f"Substantiate with evidence and counter-arguments."
        ),
        "choices": ["See rubric for evaluation criteria."],
        "correct_idx": 0,
        "payload": {
            "expected_word_count_range": [800, 1500],
            "model_answer_outline": [
                f"Introduction — context of {concept}",
                "Historical background and evolution",
                "Major arguments in favour",
                "Critiques and counter-arguments",
                "Comparative perspective",
                "Way forward",
            ],
            "rubric": [
                {"criterion": "depth_of_analysis", "weight": 35, "description": "Depth of analysis."},
                {"criterion": "balance",            "weight": 25, "description": "Balanced view."},
                {"criterion": "evidence",           "weight": 25, "description": "Use of facts and examples."},
                {"criterion": "structure_language", "weight": 15, "description": "Structure, grammar, clarity."},
            ],
        },
    }


def _gen_case_study(idx, exam, topic, concept, _fact, _long, _distractors, _ctx):
    return {
        "stem": (
            f""
            f"You are a researcher tasked with applying {concept} in a real-world scenario. "
            f"A constraint emerges that complicates the canonical approach. "
            f"\n\n(a) Identify the issues in this case (~150 words)."
            f"\n(b) Outline the options available and your preferred course (~250 words)."
            f"\n(c) Discuss what systemic measures could prevent recurrence (~150 words)."
        ),
        "choices": ["See rubric for evaluation criteria."],
        "correct_idx": 0,
        "payload": {
            "case_facts": f"Real-world application of {concept} with an unusual constraint.",
            "sub_questions": [
                {"id": "a", "prompt": "Identify the issues.", "expected_word_count_range": [120, 200]},
                {"id": "b", "prompt": "Options and preferred course.", "expected_word_count_range": [200, 300]},
                {"id": "c", "prompt": "Systemic measures.", "expected_word_count_range": [120, 200]},
            ],
            "rubric": [
                {"criterion": "issue_identification", "weight": 30, "description": "Names issues correctly."},
                {"criterion": "decision_quality",     "weight": 35, "description": "Course of action defensible."},
                {"criterion": "systemic_view",        "weight": 20, "description": "Systemic prevention."},
                {"criterion": "language",             "weight": 15, "description": "Clarity, grammar."},
            ],
        },
    }


def _gen_comprehension(idx, exam, topic, concept, _fact, long, _distractors, _ctx):
    passage = (
        f"{long} Interpretations of {concept} have evolved over decades. "
        f"Critics argue that the traditional reading is too narrow; proponents counter "
        f"that broader readings invite over-extension. Recent treatments lean towards "
        f"a purposive interpretation, though commentators differ on whether this "
        f"strengthens or undermines the underlying discipline."
    )
    return {
        "stem": (
            f"Read the passage and answer:\n\n{passage}\n\n"
            f"(1) State the central argument in 50 words.\n"
            f"(2) What do critics and proponents argue?\n"
            f"(3) Which interpretive approach is implied to be dominant?"
        ),
        "choices": ["See rubric for evaluation criteria."],
        "correct_idx": 0,
        "payload": {
            "passage": passage,
            "sub_questions": [
                {"id": "1", "prompt": "Central argument (≤50 words)."},
                {"id": "2", "prompt": "Critics' vs proponents' position."},
                {"id": "3", "prompt": "Dominant interpretive approach."},
            ],
            "rubric": [
                {"criterion": "comprehension", "weight": 60, "description": "Captures author's argument accurately."},
                {"criterion": "concision",     "weight": 25, "description": "Within word limits."},
                {"criterion": "language",      "weight": 15, "description": "Clarity, grammar."},
            ],
        },
    }


def _gen_diagram_hotspot(idx, exam, topic, concept, _fact, _long, _distractors, _ctx):
    return {
        "stem": f"On the diagram, click on the location associated with '{concept}'.",
        "choices": ["See diagram canvas."],
        "correct_idx": 0,
        "payload": {
            "image_url": f"/seed-media/{exam.lower()}-{topic.lower()}-{idx % 10}.svg",
            "shapes": [
                {"id": "target", "kind": "circle",
                 "cx": 300 + (idx % 10) * 5, "cy": 250 + (idx % 7) * 4, "radius": 28},
            ],
            "tolerance_px": 30,
            "concept": concept,
        },
    }


def _gen_diagram_label(idx, exam, topic, _concept, _fact, _long, _distractors, _ctx):
    return {
        "stem": f"Drag each label to its correct location on the diagram.",
        "choices": ["See diagram canvas."],
        "correct_idx": 0,
        "payload": {
            "image_url": f"/seed-media/{exam.lower()}-{topic.lower()}-label-{idx % 10}.svg",
            "markers": [
                {"id": "m1", "x": 120, "y": 80,  "label": "Primary feature"},
                {"id": "m2", "x": 200, "y": 220, "label": "Secondary feature"},
                {"id": "m3", "x": 320, "y": 360, "label": "Tertiary feature"},
            ],
            "tolerance_px": 25,
        },
    }


def _gen_map_location(idx, exam, topic, concept, _fact, _long, _distractors, ctx):
    pool = ctx["MAP_POOL"]
    name, lat, lng = pool[idx % len(pool)]
    return {
        "stem": f"Locate '{name}' on the map ({concept}).",
        "choices": [f"{name} ({lat:.2f}°N, {lng:.2f}°E)"],
        "correct_idx": 0,
        "payload": {
            "target_lat": lat,
            "target_lng": lng,
            "tolerance_deg": 0.5,
            "label": name,
        },
    }


def _gen_pictorial(idx, exam, topic, concept, _fact, _long, distractors, _ctx):
    choices = [concept] + distractors[:3]
    return {
        "stem": f"Identify the structure / personality / artefact shown.",
        "choices": choices,
        "correct_idx": 0,
        "payload": {
            "image_url": f"/seed-media/{exam.lower()}-{topic.lower()}-pic-{idx % 10}.jpg",
            "options": [{"id": chr(65 + i), "text": c} for i, c in enumerate(choices)],
            "correct_id": "A",
        },
    }


_GENERATORS: dict[str, Any] = {
    "MCQ_SINGLE":            _gen_mcq_single,
    "MCQ_MULTI":             _gen_mcq_multi,
    "TRUE_FALSE":            _gen_true_false,
    "ASSERTION_REASON":      _gen_assertion_reason,
    "MULTI_STATEMENT":       _gen_multi_statement,
    "NUMERIC_INTEGER":       _gen_numeric_integer,
    "NUMERIC_DECIMAL":       _gen_numeric_decimal,
    "NUMERIC_RANGE":         _gen_numeric_range,
    "FORMULA_INPUT":         _gen_formula_input,
    "MATCH_THE_FOLLOWING":   _gen_match_following,
    "SEQUENCING":            _gen_sequencing,
    "CLASSIFICATION":        _gen_classification,
    "FILL_BLANK_SINGLE":     _gen_fill_blank_single,
    "FILL_BLANK_MULTI":      _gen_fill_blank_multi,
    "CLOZE_PASSAGE":         _gen_cloze,
    "SHORT_TEXT":            _gen_short_text,
    "ESSAY":                 _gen_essay,
    "DESCRIPTIVE_LONG":      _gen_descriptive_long,
    "CASE_STUDY":            _gen_case_study,
    "COMPREHENSION_LONG":    _gen_comprehension,
    "DIAGRAM_HOTSPOT":       _gen_diagram_hotspot,
    "DIAGRAM_LABEL":         _gen_diagram_label,
    "MAP_LOCATION":          _gen_map_location,
    "PICTORIAL_IDENTIFY":    _gen_pictorial,
}


def build_questions(
    *,
    exam_code: str,
    topics: tuple[tuple[str, str], ...],
    bank: dict[str, list[tuple[str, str, str, list[str]]]],
    numeric_pool: dict[str, list[tuple[int, str]]] | None = None,
    decimal_pool: dict[str, list[tuple[float, float, str, str]]] | None = None,
    range_pool: dict[str, list[tuple[float, float, str, str]]] | None = None,
    formula_pool: list[tuple[str, str]] | None = None,
    sequencing_pool: dict[str, list[list[str]]] | None = None,
    classification_pool: dict[str, dict] | None = None,
    cloze_pool: dict[str, tuple[str, list[list[str]]]] | None = None,
    map_pool: list[tuple[str, float, float]] | None = None,
    questions_per_type: int = QUESTIONS_PER_TYPE,
) -> list[dict[str, Any]]:
    """Generate ``questions_per_type`` questions per active type, distributed
    round-robin across ``topics``. Returns a list ready for SQL insertion.
    """
    ctx = {
        "BANK": bank,
        "NUMERIC_POOL": numeric_pool or {},
        "DECIMAL_POOL": decimal_pool or {},
        "RANGE_POOL": range_pool or {},
        "FORMULA_POOL": formula_pool or [
            ("v=u+a*t", "Equation of motion (final velocity)."),
            ("F=m*a", "Newton's second law."),
            ("(P*R*T)/100", "Simple interest formula (P,R,T)."),
        ],
        "SEQUENCING_POOL": sequencing_pool or {},
        "CLASSIFICATION_POOL": classification_pool or {},
        "CLOZE_POOL": cloze_pool or {},
        "MAP_POOL": map_pool or [
            ("Origin", 0.0, 0.0), ("North Pole", 90.0, 0.0), ("Equator-East", 0.0, 80.0),
            ("South Pole", -90.0, 0.0),
        ],
    }

    out: list[dict[str, Any]] = []
    for type_id in ACTIVE_TYPES:
        gen = _GENERATORS[type_id]
        for idx in range(questions_per_type):
            topic_id, topic_code = topics[idx % len(topics)]
            entries = bank[topic_code]
            concept, fact, long, distractors = entries[idx % len(entries)]
            base = gen(idx, exam_code, topic_code, concept, fact, long, distractors, ctx)
            out.append(
                {
                    "type_id": type_id,
                    "topic_id": topic_id,
                    "idx": idx,
                    "stem": base["stem"],
                    "choices": base["choices"],
                    "correct_idx": base["correct_idx"],
                    "difficulty_b": _difficulty(idx),
                    "payload": base["payload"],
                }
            )
    return out
