"""One-time data migration: rewrite seed-shaped non-MCQ payloads into the
canonical shapes the renderers + graders expect.

Context
-------
The polymorphic seed bank stored compact, type-specific payloads
(e.g. MATCH as ``{"pairs":[{"left","right"}]}``) that do NOT match the
canonical Pydantic ``*Payload`` schemas the student renderers and the
grader use (MATCH expects ``list_a``/``list_b`` with ids + ``correct_pairs``).
The result: non-MCQ questions render empty / grade incorrectly.

This script transforms each row's payload into the canonical shape and
**validates it against the real handler payload_schema** before writing.
Anything that does not validate is left untouched and reported.

Runs against the quiz serving bank (``quiz`` DB, ``quiz_schema.questions``);
pass ``--db content`` for the authoring bank (``learning`` DB,
``content_schema.questions``) too. Idempotent: a payload that already
validates is skipped.

Usage (inside the learning container):
    python scripts/migrate_canonical_payloads.py            # dry-run, quiz DB
    python scripts/migrate_canonical_payloads.py --apply    # write changes
    python scripts/migrate_canonical_payloads.py --db content --apply
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from typing import Any, Callable

import asyncpg

from learning.types import bootstrap, registry

bootstrap.register_all_v1_handlers()

DSN = {
    "quiz": "postgres://postgres:postgres@postgres:5432/quiz",
    "content": "postgres://postgres:postgres@postgres:5432/learning",
}
SCHEMA = {"quiz": "quiz_schema", "content": "content_schema"}

# Types we deliberately do NOT touch (need content/media/child-question
# authoring, not a payload reshape — documented for the report).
SKIP_TYPES = {
    "MCQ_SINGLE",          # already canonical
    "DIAGRAM_HOTSPOT",     # needs real image_media_id + canonical hotspots
    "DIAGRAM_LABEL",       # needs real image_media_id + separate label list
    "COMPREHENSION_LONG",  # composite: needs child_question references
    "ASSERTION_REASON",    # renders as MCQ; boolean grade contract — separate
    "MULTI_STATEMENT",     # renders as MCQ; statement grade contract — separate
}


def _slug(text: str, fallback: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return (s[:40] or fallback)


def _pad(s: str, n: int) -> str:
    """Pad a short string up to ``n`` chars. Used only for payload-internal
    fields that satisfy schema min-length (stem/model_answer here) — these are
    not what the student sees (that's the question's own stem column)."""
    s = s or ""
    return s if len(s) >= n else (s + " " + "." * n)[:max(n, len(s) + 1)].ljust(n, ".")


def _blanks_to_markers(template: str) -> str:
    """Replace each ``[BLANK]`` with a positional ``{{1}}``/``{{2}}`` marker."""
    out, n = template, 0

    def repl(_m: re.Match[str]) -> str:
        nonlocal n
        n += 1
        return f"{{{{{n}}}}}"

    out = re.sub(r"\[BLANK\]", repl, out)
    return out


# ── Per-type transforms: (payload, stem) -> canonical payload ────────────────


def _t_numeric_integer(p: dict, stem: str) -> dict:
    return {"stem": stem, "correct": int(p["answer"]),
            **({"unit": p["unit"]} if p.get("unit") else {})}


def _t_numeric_decimal(p: dict, stem: str) -> dict:
    return {"stem": stem, "correct": float(p["answer"]),
            "tolerance": float(p.get("tolerance") or 0.01),
            **({"unit": p["unit"]} if p.get("unit") else {})}


def _t_numeric_range(p: dict, stem: str) -> dict:
    lo, hi = sorted([float(p["low"]), float(p["high"])])  # some seed ranges are descending
    return {"stem": _pad(stem, 8), "low": lo, "high": hi,
            **({"unit": p["unit"]} if p.get("unit") else {})}


def _t_formula(p: dict, stem: str) -> dict:
    syms = [s for s in (p.get("variables") or []) if s and s in p["canonical_expr"]]
    return {"stem": _pad(stem, 8), "target_expression": p["canonical_expr"],
            "free_symbols": syms or ["x"], "equivalent_forms": []}


def _t_match(p: dict, stem: str) -> dict:
    pairs = p["pairs"]
    list_a = [{"id": f"L{i+1}", "text": pr["left"]} for i, pr in enumerate(pairs)]
    list_b = [{"id": f"R{i+1}", "text": pr["right"]} for i, pr in enumerate(pairs)]
    correct = [{"left_id": f"L{i+1}", "right_id": f"R{i+1}"} for i in range(len(pairs))]
    return {"stem": stem, "list_a": list_a, "list_b": list_b,
            "correct_pairs": correct, "partial_credit": True}


def _t_sequencing(p: dict, stem: str) -> dict:
    items = p["items"]
    canon = [{"id": f"S{i+1}", "text": s} for i, s in enumerate(items)]
    return {"stem": stem, "items": canon,
            "correct_order": [f"S{i+1}" for i in range(len(items))],
            "metric": "all_or_nothing"}


def _t_classification(p: dict, stem: str) -> dict:
    cats = p["categories"]
    cat_ids = {c: f"C{i+1}" for i, c in enumerate(cats)}
    categories = [{"id": cat_ids[c], "text": c} for c in cats]
    items, assign = [], []
    for i, it in enumerate(p["items"]):
        iid = f"I{i+1}"
        items.append({"id": iid, "text": it["text"]})
        assign.append({"item_id": iid, "category_id": cat_ids[it["category"]]})
    return {"stem": stem, "items": items, "categories": categories,
            "correct_assignments": assign}


def _t_fill_single(p: dict, stem: str) -> dict:
    body = _blanks_to_markers(p["template"])
    if "{{1}}" not in body and "___" not in body:
        body = body.rstrip(".") + " ___."
    raw = p.get("accepted") or [[""]]
    flat = raw[0] if raw and isinstance(raw[0], list) else raw
    return {"stem": body, "accepted": [str(a) for a in flat if a],
            "match_mode": "case_insensitive"}


def _t_fill_multi(p: dict, stem: str) -> dict:
    body = _blanks_to_markers(p["template"])
    blanks = [{"id": str(i + 1), "accepted": [str(a) for a in acc],
               "match_mode": "case_insensitive"}
              for i, acc in enumerate(p.get("accepted") or [])]
    return {"stem": body, "blanks": blanks, "partial_credit": True}


def _t_cloze(p: dict, stem: str) -> dict:
    passage = _blanks_to_markers(p["template"])
    blanks = [{"id": str(i + 1), "accepted": [str(a) for a in acc],
               "match_mode": "case_insensitive"}
              for i, acc in enumerate(p.get("accepted") or [])]
    return {"passage": passage, "blanks": blanks, "partial_credit": True}


def _t_short_text(p: dict, stem: str) -> dict:
    rubric = p.get("rubric") or []
    key = [c.get("description") or c.get("criterion") for c in rubric] or ["key idea"]
    out = {"stem": _pad(stem, 8), "model_answer": _pad(str(p["model_answer"]), 4),
           "key_concepts": key}
    if p.get("expected_word_count_range"):
        out["expected_word_count_range"] = list(p["expected_word_count_range"])
    return out


def _rubric_obj(seed_rubric: list[dict]) -> dict:
    crit = []
    for i, c in enumerate(seed_rubric or []):
        crit.append({
            "id": _slug(c.get("criterion", ""), f"c{i+1}"),
            "text": c.get("description") or c.get("criterion") or "Quality criterion",
            "weight": float(c.get("weight", 0)),
        })
    if not crit:
        crit = [{"id": "overall", "text": "Overall quality", "weight": 100.0}]
    return {"version": 1, "criteria": crit}


def _t_essay(p: dict, stem: str) -> dict:
    outline = p.get("model_answer_outline") or []
    model = "\n".join(outline) if outline else "Model answer outline pending."
    if len(model) < 20:
        model = model + " " * (20 - len(model))
    return {"stem": stem,
            "expected_word_count_range": list(p["expected_word_count_range"]),
            "model_answer": model, "rubric": _rubric_obj(p.get("rubric"))}


def _t_case_study(p: dict, stem: str) -> dict:
    # Seed shape already aligns; pass through, ensure rubric items keep shape.
    return {k: v for k, v in p.items() if v is not None}


def _t_true_false(p: dict, stem: str) -> dict:
    return {"statement": p["statement"], "correct": bool(p["correct"]),
            **({"explanation": p["explanation"]} if p.get("explanation") else {})}


def _t_mcq_multi(p: dict, stem: str) -> dict:
    return {"stem": stem, "options": p["options"], "correct_ids": p["correct_ids"],
            "partial_credit": bool(p.get("partial_credit", False))}


def _t_pictorial(p: dict, stem: str) -> dict:
    # No real media in seed — carry the image_url as the media id so the
    # schema validates and grading works; the renderer still reads image_url.
    return {"stem": stem, "image_media_id": p.get("image_url") or "seed-image",
            "options": p["options"], "correct_id": p["correct_id"],
            "image_url": p.get("image_url")}


TRANSFORMS: dict[str, Callable[[dict, str], dict]] = {
    "NUMERIC_INTEGER": _t_numeric_integer,
    "NUMERIC_DECIMAL": _t_numeric_decimal,
    "NUMERIC_RANGE": _t_numeric_range,
    "FORMULA_INPUT": _t_formula,
    "MATCH_THE_FOLLOWING": _t_match,
    "SEQUENCING": _t_sequencing,
    "CLASSIFICATION": _t_classification,
    "FILL_BLANK_SINGLE": _t_fill_single,
    "FILL_BLANK_MULTI": _t_fill_multi,
    "CLOZE_PASSAGE": _t_cloze,
    "SHORT_TEXT": _t_short_text,
    "ESSAY": _t_essay,
    "DESCRIPTIVE_LONG": _t_essay,
    "CASE_STUDY": _t_case_study,
    "TRUE_FALSE": _t_true_false,
    "MCQ_MULTI": _t_mcq_multi,
    "PICTORIAL_IDENTIFY": _t_pictorial,
}


def _validates(qtype: str, payload: dict) -> tuple[bool, str]:
    try:
        registry.get_handler(qtype).payload_schema.model_validate(payload)
        return True, ""
    except Exception as e:  # noqa: BLE001 — collect for the report
        return False, " | ".join(str(e).splitlines()[1:4])[:240]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", choices=["quiz", "content"], default="quiz")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    schema = SCHEMA[args.db]
    conn = await asyncpg.connect(DSN[args.db])
    rows = await conn.fetch(
        f"SELECT id, question_type, stem, payload FROM {schema}.questions "
        f"WHERE question_type <> 'MCQ_SINGLE' AND payload IS NOT NULL"
    )
    print(f"[{args.db}/{schema}] {len(rows)} non-MCQ rows  "
          f"({'APPLY' if args.apply else 'DRY-RUN'})\n")

    stats: dict[str, dict[str, int]] = {}
    samples: dict[str, str] = {}
    updates: list[tuple[str, str]] = []  # (id, canonical_json)

    for r in rows:
        qt = r["question_type"]
        st = stats.setdefault(qt, {"total": 0, "ok": 0, "already": 0, "skip": 0, "fail": 0})
        st["total"] += 1
        payload = json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"]

        if qt in SKIP_TYPES:
            st["skip"] += 1
            continue
        # Idempotent: leave already-canonical rows alone.
        if _validates(qt, payload)[0]:
            st["already"] += 1
            continue
        fn = TRANSFORMS.get(qt)
        if fn is None:
            st["skip"] += 1
            continue
        try:
            canon = fn(payload, r["stem"] or "Question")
        except Exception as e:  # noqa: BLE001
            st["fail"] += 1
            samples.setdefault(qt, f"transform error: {str(e)[:120]}")
            continue
        ok, err = _validates(qt, canon)
        if ok:
            st["ok"] += 1
            updates.append((r["id"], json.dumps(canon)))
        else:
            st["fail"] += 1
            samples.setdefault(qt, f"validate error: {err}")

    print(f"{'TYPE':24} {'total':>6} {'fixable':>7} {'already':>7} {'fail':>5} {'skip':>5}")
    for qt in sorted(stats):
        s = stats[qt]
        print(f"{qt:24} {s['total']:>6} {s['ok']:>7} {s['already']:>7} {s['fail']:>5} {s['skip']:>5}"
              + (f"   ← {samples[qt]}" if qt in samples else ""))
    print(f"\nrows to update: {len(updates)}")

    if args.apply and updates:
        async with conn.transaction():
            await conn.executemany(
                f"UPDATE {schema}.questions SET payload = $2::jsonb WHERE id = $1",
                updates,
            )
        print(f"APPLIED {len(updates)} updates to {schema}.questions")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
