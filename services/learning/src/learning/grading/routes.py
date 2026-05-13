"""POST /grading/grade endpoint — Type Dispatcher behind HTTP."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from learning.content.db import sessionmaker as content_sessionmaker
from learning.types import Resolution, get_handler, is_supported

import logging

log = logging.getLogger(__name__)

router = APIRouter(prefix="/grading", tags=["grading"])

CONTENT_SCHEMA = "content_schema"


class GradeRequest(BaseModel):
    question_id: str = Field(min_length=1)
    question_type: str = Field(min_length=1)
    # P5-S50: payload is now optional. When omitted/empty, alp-learning
    # fetches it from content_schema.questions by id. Lets Quiz Go
    # (which only mirrors choices/correct_idx) submit non-MCQ types
    # without round-tripping the typed payload.
    payload: dict[str, Any] = Field(default_factory=dict)
    response: dict[str, Any]
    language: str = "en"


class BatchGradeRequest(BaseModel):
    items: list[GradeRequest] = Field(min_length=1, max_length=200)


class BatchGradeResponse(BaseModel):
    resolutions: list[Resolution]


def _problem(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"code": code, "message": message},
    )


def _normalise_payload(
    payload: dict[str, Any],
    *,
    question_type: str,
    stem: str,
) -> dict[str, Any]:
    """Bring a legacy-shaped payload up to the current handler schema.

    Some early seeds stored SEQUENCING / CLASSIFICATION / MATCH_*
    payloads as bare `{"items": [...strings...]}` lists without `stem`
    or `correct_order`. Handler schemas require both, so without this
    step every grade for a legacy row returns 400. Strategy: derive
    `stem` from the question row, normalise items to `{id, text}` with
    deterministic ids, and assume the seed order is the correct one
    (which matches every shipping fixture).
    """
    qt = (question_type or "").upper()

    # Always promote stem if the JSONB row has none but the column does.
    if "stem" not in payload or not payload.get("stem"):
        if stem:
            payload["stem"] = stem

    if qt == "SEQUENCING":
        raw_items = payload.get("items") or []
        if raw_items and all(isinstance(it, str) for it in raw_items):
            payload["items"] = [
                {"id": f"i{i}", "text": str(t)} for i, t in enumerate(raw_items)
            ]
        # Treat the stored order as the correct order when no explicit
        # correct_order is provided. This matches every existing fixture
        # — they list items in solution order.
        if "correct_order" not in payload or not payload.get("correct_order"):
            items = payload.get("items") or []
            payload["correct_order"] = [
                (it["id"] if isinstance(it, dict) and "id" in it else f"i{i}")
                for i, it in enumerate(items)
            ]
        return payload

    if qt == "FILL_BLANK_SINGLE":
        # Seed: {accepted: [["Cell","cell"]], template: "...[BLANK]..."}
        # Schema: {stem: "...___...", accepted: ["Cell","cell"]}
        if "stem" not in payload or not payload.get("stem"):
            tpl = payload.get("template") or stem or ""
            payload["stem"] = tpl.replace("[BLANK]", "___") if "[BLANK]" in tpl else tpl
        # If the stem still has no placeholder but `accepted` is set,
        # mask the first occurrence of the canonical answer with `___`
        # so the schema validator is happy.
        if "___" not in payload["stem"] and "{{1}}" not in payload["stem"]:
            raw_acc = payload.get("accepted") or []
            first_word: str | None = None
            if raw_acc and isinstance(raw_acc[0], list) and raw_acc[0]:
                first_word = str(raw_acc[0][0])
            elif raw_acc and isinstance(raw_acc[0], str):
                first_word = str(raw_acc[0])
            if first_word:
                import re as _re
                masked, n = _re.subn(
                    rf"\b{_re.escape(first_word)}\b",
                    "___",
                    payload["stem"],
                    count=1,
                    flags=_re.IGNORECASE,
                )
                if n > 0:
                    payload["stem"] = masked
                else:
                    payload["stem"] = payload["stem"].rstrip(".") + " ___."
        # Flatten accepted: [[a,b]] → [a,b]; [[a],[b]] → [a,b]
        raw_acc = payload.get("accepted")
        if isinstance(raw_acc, list) and raw_acc and isinstance(raw_acc[0], list):
            flat: list[str] = []
            for entry in raw_acc:
                for v in entry:
                    if isinstance(v, str) and v:
                        flat.append(v)
            payload["accepted"] = flat
        return payload

    if qt in ("FILL_BLANK_MULTI", "CLOZE_PASSAGE"):
        # Seed: {accepted: [[a,b],[c,d]], template: "...[BLANK]...[BLANK]..."}
        # Schema: {stem | passage, blanks: [{id, accepted: [...]}, ...]}
        tpl = payload.get("template") or payload.get("stem") or payload.get("passage") or stem or ""
        # Materialise placeholders [BLANK] → {{1}}, {{2}}, …
        if "[BLANK]" in tpl:
            new_tpl = tpl
            i = 0
            while "[BLANK]" in new_tpl:
                i += 1
                new_tpl = new_tpl.replace("[BLANK]", "{{" + str(i) + "}}", 1)
            tpl = new_tpl
        if qt == "CLOZE_PASSAGE":
            payload["passage"] = tpl
        else:
            payload["stem"] = tpl
        # Build blanks[] from accepted[][]. Drop empty rows.
        raw_acc = payload.get("accepted") or []
        blanks: list[dict[str, Any]] = []
        if isinstance(raw_acc, list):
            for i, syns in enumerate(raw_acc, start=1):
                if isinstance(syns, list):
                    accepted = [str(s) for s in syns if isinstance(s, str) and s]
                elif isinstance(syns, str):
                    accepted = [syns]
                else:
                    accepted = []
                if accepted:
                    blanks.append({"id": str(i), "accepted": accepted})
        if blanks and "blanks" not in payload:
            payload["blanks"] = blanks
        return payload

    if qt == "ASSERTION_REASON":
        # Seed shape: {assertion, reason, options: [...], correct_id: "A".."D"}
        # Canonical schema needs the three booleans derived from correct_id:
        #   A → both true + explains;  B → both true, doesn't explain;
        #   C → a true, r false;       D → a false, r true;
        #   E → both false.
        cid = str(payload.get("correct_id") or "").upper()
        mapping = {
            "A": (True,  True,  True),
            "B": (True,  True,  False),
            "C": (True,  False, False),
            "D": (False, True,  False),
            "E": (False, False, False),
        }
        if cid in mapping and "assertion_true" not in payload:
            at, rt, e = mapping[cid]
            payload["assertion_true"] = at
            payload["reason_true"] = rt
            payload["reason_explains_assertion"] = e
        return payload

    if qt == "MULTI_STATEMENT":
        # Seed: {options:[{id,text}], correct_id, statements:[{id:int,text}], correct_statement_ids:[int]}
        # Canonical: {stem, statements:[{id,text,is_correct}], options:[{id,text,selects:[str]}], correct_option_id}
        correct_statement_ids_raw = payload.get("correct_statement_ids") or []
        correct_str_ids = {str(s) for s in correct_statement_ids_raw}
        # Stringify statement ids + tag is_correct.
        raw_stmts = payload.get("statements") or []
        if raw_stmts and isinstance(raw_stmts[0], dict) and "is_correct" not in raw_stmts[0]:
            payload["statements"] = [
                {
                    "id": str(s.get("id", "")),
                    "text": str(s.get("text", "")),
                    "is_correct": str(s.get("id", "")) in correct_str_ids,
                }
                for s in raw_stmts
            ]
        # Promote correct_id → correct_option_id.
        if "correct_option_id" not in payload and "correct_id" in payload:
            payload["correct_option_id"] = str(payload["correct_id"])
        # Add `selects` per option — only the correct option's selects
        # is enforced, so give the rest an empty list rather than
        # parsing the human-readable text.
        raw_opts = payload.get("options") or []
        correct_oid = payload.get("correct_option_id") or ""
        if raw_opts and isinstance(raw_opts[0], dict) and "selects" not in raw_opts[0]:
            new_opts: list[dict[str, Any]] = []
            for o in raw_opts:
                oid = str(o.get("id", ""))
                selects = sorted(correct_str_ids) if oid == correct_oid else []
                new_opts.append({"id": oid, "text": str(o.get("text", "")), "selects": selects})
            payload["options"] = new_opts
        return payload

    if qt == "MATCH_THE_FOLLOWING":
        # Legacy: {"pairs": [{"left": "...", "right": "..."}, …]}
        # Canonical: list_a [{id,text}], list_b [{id,text}], correct_pairs [{left_id,right_id}]
        pairs = payload.get("pairs")
        if isinstance(pairs, list) and pairs and "list_a" not in payload:
            list_a: list[dict[str, Any]] = []
            list_b: list[dict[str, Any]] = []
            correct_pairs: list[dict[str, Any]] = []
            for i, p in enumerate(pairs):
                if not isinstance(p, dict):
                    continue
                lid, rid = f"a{i}", f"b{i}"
                list_a.append({"id": lid, "text": str(p.get("left") or "")})
                list_b.append({"id": rid, "text": str(p.get("right") or "")})
                correct_pairs.append({"left_id": lid, "right_id": rid})
            payload["list_a"] = list_a
            payload["list_b"] = list_b
            payload["correct_pairs"] = correct_pairs
        return payload

    if qt == "CLASSIFICATION":
        raw_categories = payload.get("categories") or []
        # Build a name → category-id map so we can derive
        # correct_assignments from the per-item `category` text field.
        cat_map: dict[str, str] = {}
        if raw_categories and all(isinstance(c, str) for c in raw_categories):
            new_cats: list[dict[str, Any]] = []
            for i, name in enumerate(raw_categories):
                cid = f"c{i}"
                cat_map[str(name)] = cid
                new_cats.append({"id": cid, "text": str(name)})
            payload["categories"] = new_cats
        else:
            for i, c in enumerate(raw_categories):
                if isinstance(c, dict):
                    cid = str(c.get("id") or f"c{i}")
                    cat_map[str(c.get("text") or c.get("name") or cid)] = cid

        raw_items = payload.get("items") or []
        normalised_items: list[dict[str, Any]] = []
        derived_assignments: list[dict[str, Any]] = []
        for i, it in enumerate(raw_items):
            iid = f"i{i}"
            if isinstance(it, dict):
                iid = str(it.get("id") or iid)
                text = str(it.get("text") or "")
                category_text = str(it.get("category") or "")
                normalised_items.append({"id": iid, "text": text})
                if category_text and category_text in cat_map:
                    derived_assignments.append(
                        {"item_id": iid, "category_id": cat_map[category_text]}
                    )
            else:
                normalised_items.append({"id": iid, "text": str(it)})
        payload["items"] = normalised_items
        if "correct_assignments" not in payload or not payload.get("correct_assignments"):
            payload["correct_assignments"] = derived_assignments
        return payload

    return payload


async def _fetch_payload_by_id(question_id: str) -> dict[str, Any] | None:
    """Fetch typed payload from content_schema.questions by id.

    Returns the payload JSONB or None if the question has no typed
    payload (legacy MCQ rows pre-S37). Used when Quiz Go submits a
    non-MCQ response without round-tripping the full payload."""
    try:
        async with content_sessionmaker()() as s:
            rows = (
                await s.execute(
                    text(f"""
                        SELECT payload, choices, correct_idx, stem, language, question_type
                          FROM {CONTENT_SCHEMA}.questions
                         WHERE id = :qid
                    """),
                    {"qid": question_id},
                )
            ).mappings().all()
    except Exception:
        return None
    if not rows:
        return None
    row = rows[0]
    if row.get("payload"):
        return _normalise_payload(
            dict(row["payload"]),
            question_type=str(row.get("question_type") or ""),
            stem=row.get("stem") or "",
        )
    # Legacy MCQ_SINGLE row — synthesise the canonical payload from
    # choices + correct_idx so the type handler validates cleanly.
    choices = row.get("choices") or []
    correct_idx = int(row.get("correct_idx") or 0)
    options = [
        {"id": chr(ord("A") + i), "text": str(c)}
        for i, c in enumerate(choices)
    ]
    if not options:
        return None
    correct_id = options[correct_idx]["id"] if correct_idx < len(options) else options[0]["id"]
    return {
        "stem": row.get("stem") or "",
        "options": options,
        "correct_id": correct_id,
    }


@router.post("/grade", response_model=Resolution)
async def grade(req: GradeRequest) -> Resolution:
    """Single-item grading. Returns Resolution; never marks.

    Quiz Go calls this for AI_ASSISTED / HYBRID / HUMAN types. During
    Phase 5 initial rollout, DETERMINISTIC types also go through this
    endpoint (Quiz Go inlines them only after smoke validates parity).

    P5-S50: when `payload` is omitted, alp-learning fetches it from
    content_schema.questions by id. Lets Quiz Go submit non-MCQ types
    without mirroring the full typed payload.
    """
    if not is_supported(req.question_type):
        raise _problem(
            "unknown_question_type",
            f"question_type={req.question_type!r} is not registered",
            http_status=400,
        )

    payload = req.payload
    if not payload:
        fetched = await _fetch_payload_by_id(req.question_id)
        if fetched is None:
            raise _problem(
                "payload_missing",
                f"payload not provided and question {req.question_id!r} "
                "has no payload in content_schema",
                http_status=400,
            )
        payload = fetched

    handler = get_handler(req.question_type)
    # The handler's evaluate signature receives `response` only; we
    # inject question_id via a wrapper dict so the handler can attach
    # it to the Resolution.
    response_with_id = {**req.response, "question_id": req.question_id}
    try:
        return await handler.evaluate(payload, response_with_id, req.language)
    except Exception as e:
        from pydantic import ValidationError as PydanticValidationError

        # Validation failures usually mean the stored seed payload
        # doesn't conform to the current handler schema (the
        # normaliser above handles the common shapes; anything new
        # falls through here). Returning HTTP 400 blocks the entire
        # quiz session — the better fall-back is a soft Resolution
        # tagged PENDING_HUMAN_REVIEW so Quiz Go records an answer,
        # the session proceeds, and the bad payload is logged for
        # author triage. The student loses one mark on that item;
        # the alternative is "We couldn't record that answer."
        if isinstance(e, PydanticValidationError):
            log.warning(
                "grading.payload_validation_fallback",
                extra={
                    "question_id": req.question_id,
                    "question_type": req.question_type,
                    "error": str(e),
                },
            )
            return Resolution(
                question_id=req.question_id,
                type_id=req.question_type,
                status="PENDING_HUMAN_REVIEW",
                matched_count=0,
                total_count=0,
                evaluation_mode="DETERMINISTIC",
            )
        raise _problem(
            "grading_failed",
            f"evaluator raised: {type(e).__name__}: {e}",
            http_status=500,
        ) from e


@router.post("/batch", response_model=BatchGradeResponse)
async def grade_batch(req: BatchGradeRequest) -> BatchGradeResponse:
    """Bulk grading on quiz submit. Each item evaluates independently;
    one item's failure does not block the rest. Failed items return a
    PENDING_HUMAN_REVIEW Resolution as a safe default."""
    resolutions: list[Resolution] = []
    for item in req.items:
        try:
            resolutions.append(await grade(item))
        except HTTPException as e:
            # Coerce HTTP errors into a Resolution so the batch caller
            # gets a uniform shape per item. HTTP-status info is lost
            # but the caller can inspect the resolution status.
            resolutions.append(
                Resolution(
                    question_id=item.question_id,
                    type_id=item.question_type,
                    status="PENDING_HUMAN_REVIEW",
                    matched_count=0,
                    total_count=0,
                    evaluation_mode="DETERMINISTIC",
                )
            )
    return BatchGradeResponse(resolutions=resolutions)
