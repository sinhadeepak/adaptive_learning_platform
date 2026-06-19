"""Shared helpers for turning a question row into a translatable payload."""

from __future__ import annotations

from typing import Any


def synth_legacy_payload(row: Any) -> dict[str, Any] | None:
    """Build the canonical MCQ_SINGLE payload from legacy choices+correct_idx
    columns when `payload` JSONB is NULL (the seeded rows)."""
    choices = row.get("choices") or []
    if not choices:
        return None
    options = [{"id": chr(ord("A") + i), "text": str(c)} for i, c in enumerate(choices)]
    correct_idx = int(row.get("correct_idx") or 0)
    correct_id = options[correct_idx]["id"] if correct_idx < len(options) else options[0]["id"]
    return {"stem": row.get("stem") or "", "options": options, "correct_id": correct_id}


def collect_strings(node: Any) -> list[str]:
    """Flatten all string leaves of a payload (used for glossary matching)."""
    out: list[str] = []
    if isinstance(node, str):
        out.append(node)
    elif isinstance(node, dict):
        for v in node.values():
            out.extend(collect_strings(v))
    elif isinstance(node, list):
        for v in node:
            out.extend(collect_strings(v))
    return out
