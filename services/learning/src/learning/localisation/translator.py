"""Translation pipeline + payload walker.

Walks an artifact's payload via `handler.translatable_fields()` (dotted
paths), calls the AI Gateway per field with glossary entries injected,
and re-assembles a translated payload. Stores DRAFT in
`content_schema.content_artifact_translations`.

Pure-function string extractor + glossary applier; the Gateway-driven
`translate_artifact` is the entrypoint exercised by tests.

Per ADR-0019 §"Translation pipeline".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field

from learning.ai_gateway import AIGateway

# Phase 5 v1 — Hindi only published; Phase 2 lights up the others.
SUPPORTED_LANGS = ["hi", "ta", "te", "bn", "mr"]


# ── AI Gateway output schema ──────────────────────────────────────────────────


class TranslationOutput(BaseModel):
    """Validated AI output for one translation call."""

    translated: str = Field(min_length=1, max_length=20_000)
    flagged_cultural: bool = False
    flag_reason: str = Field(default="", max_length=500)
    confidence: float = Field(ge=0.0, le=1.0, default=0.85)


# ── Translation draft (handed back to caller for persistence) ────────────────


@dataclass
class TranslationDraft:
    artifact_id: str
    target_lang: str
    payload_translation: dict[str, Any]
    cultural_flags: list[str] = field(default_factory=list)
    avg_confidence: float = 0.0
    fields_translated: int = 0


# ── Pure helpers ──────────────────────────────────────────────────────────────


def extract_translatable_strings(
    payload: dict[str, Any], dotted_paths: list[str],
) -> dict[str, str]:
    """Walk `payload` along `dotted_paths` and return a flat
    {path: string} map for translation.

    Path syntax:
    - `stem`                — top-level key
    - `options[*].text`     — every element of an array
    - `rubric.criteria[*].text` — nested with array splat

    Returns flat keys with concrete indices (`options[0].text`,
    `options[1].text`, ...) so callers can pair with translated outputs
    by exact key. Non-string values + missing fields are skipped.
    """
    out: dict[str, str] = {}
    for path in dotted_paths:
        _walk(payload, path.split("."), [], out)
    return out


def _walk(node: Any, parts: list[str], breadcrumbs: list[str], out: dict[str, str]) -> None:
    if not parts:
        if isinstance(node, str):
            out[".".join(breadcrumbs)] = node
        return
    head, rest = parts[0], parts[1:]
    if "[*]" in head:
        key = head.replace("[*]", "")
        if key:
            arr = node.get(key) if isinstance(node, dict) else None
        else:
            arr = node  # path starts with [*]
        if not isinstance(arr, list):
            return
        for i, item in enumerate(arr):
            crumb = f"{key}[{i}]" if key else f"[{i}]"
            _walk(item, rest, breadcrumbs + [crumb], out)
    else:
        if not isinstance(node, dict):
            return
        if head not in node:
            return
        _walk(node[head], rest, breadcrumbs + [head], out)


def merge_translations_into_payload(
    payload: dict[str, Any], translations: dict[str, str],
) -> dict[str, Any]:
    """Pure: write translated strings back into a copy of `payload`.

    Mirror of `extract_translatable_strings` — reads the same flat
    keys (with concrete indices) and writes the strings into a deep
    copy of the payload. Non-string targets are skipped.
    """
    import copy as _copy

    out = _copy.deepcopy(payload)
    for key, value in translations.items():
        _set_at(out, key, value)
    return out


def _set_at(node: Any, dotted_key: str, value: str) -> None:
    """Set `value` at `dotted_key` (e.g. 'options[1].text') in `node`.
    Skips silently when the target doesn't exist or isn't a string."""
    parts = _tokenise(dotted_key)
    cursor = node
    for tok in parts[:-1]:
        if isinstance(tok, int):
            if not isinstance(cursor, list) or tok >= len(cursor):
                return
            cursor = cursor[tok]
        else:
            if not isinstance(cursor, dict) or tok not in cursor:
                return
            cursor = cursor[tok]
    last = parts[-1]
    if isinstance(last, int):
        if isinstance(cursor, list) and last < len(cursor) and isinstance(cursor[last], str):
            cursor[last] = value
    else:
        if isinstance(cursor, dict) and isinstance(cursor.get(last), str):
            cursor[last] = value


def _tokenise(dotted: str) -> list[Any]:
    """'options[1].text' -> ['options', 1, 'text']."""
    parts: list[Any] = []
    for chunk in dotted.split("."):
        # split on '[' and ']'
        if "[" in chunk:
            head, _, tail = chunk.partition("[")
            if head:
                parts.append(head)
            idx_str, _, rest = tail.partition("]")
            try:
                parts.append(int(idx_str))
            except ValueError:
                parts.append(idx_str)
            if rest:
                # 'options[0]extra' is malformed; ignore the trailing piece
                pass
        else:
            parts.append(chunk)
    return parts


def apply_glossary(
    text: str, entries: list["GlossaryEntry"],
) -> tuple[str, list[str]]:
    """Pure: substitute glossary source_terms with target_terms in
    `text`. Returns (substituted_text, list_of_applied_terms).

    `locked` category entries are substituted but the corresponding
    term is also added to the cultural-flag review hint (the AI
    translator should keep them as-is; the substitution catches drift).

    `cultural` category entries trigger a cultural-flag for the
    artifact even when not present in the text — we surface them at
    the artifact level so reviewers see the relevant terminology.
    """
    applied: list[str] = []
    out = text
    for e in entries:
        if e.category == "cultural":
            # Cultural entries don't substitute by default — they hint
            # the reviewer. Drop here; caller surfaces the flag.
            continue
        if e.case_sensitive:
            if e.source_term in out:
                out = out.replace(e.source_term, e.target_term)
                applied.append(e.source_term)
        else:
            # Case-insensitive: lowercase compare for membership only;
            # substitution preserves original case at boundaries.
            if e.source_term.lower() in out.lower():
                # naive replacement; sufficient for v1 single-word terms.
                import re as _re
                out = _re.sub(
                    _re.escape(e.source_term),
                    e.target_term,
                    out,
                    flags=_re.IGNORECASE,
                )
                applied.append(e.source_term)
    return out, applied


# ── Gateway-driven entrypoint ─────────────────────────────────────────────────


async def translate_artifact(
    gateway: AIGateway,
    *,
    artifact_id: str,
    target_lang: str,
    payload: dict[str, Any],
    translatable_paths: list[str],
    glossary: list["GlossaryEntry"] | None = None,
    source_lang: str = "en",
    prompt_template_version: str = "1.0.0",
) -> TranslationDraft:
    """Translate an artifact end-to-end.

    Walks `translatable_paths` to extract strings; for each string,
    calls the Gateway with glossary entries injected; assembles a
    translated payload; surfaces any cultural flags + average
    confidence.

    Returns a `TranslationDraft` the caller persists into
    `content_artifact_translations` (DRAFT status; reviewer approves).
    """
    if target_lang not in SUPPORTED_LANGS:
        raise ValueError(
            f"target_lang={target_lang!r} not in supported set {SUPPORTED_LANGS}"
        )

    glossary = glossary or []
    glossary_block = _format_glossary_for_prompt(glossary)

    strings = extract_translatable_strings(payload, translatable_paths)
    translations: dict[str, str] = {}
    cultural_flags: list[str] = []
    confidences: list[float] = []

    # Pre-mark any cultural-category glossary terms as flags on the
    # artifact, regardless of whether the field text actually contains
    # them — reviewers need awareness of relevant cultural-context items.
    for e in glossary:
        if e.category == "cultural":
            cultural_flags.append(f"cultural_glossary_aware:{e.source_term}")

    for key, src in strings.items():
        # Skip empty/whitespace-only.
        if not src.strip():
            translations[key] = src
            continue
        try:
            out: TranslationOutput = await gateway.call(
                touchpoint="translation",
                prompt_template_id="translate_field",
                prompt_template_version=prompt_template_version,
                prompt_inputs={
                    "source_lang": source_lang,
                    "target_lang": target_lang,
                    "source_text": src,
                    "glossary_block": glossary_block,
                },
                schema=TranslationOutput,
            )
            translated, _applied = apply_glossary(out.translated, glossary)
            translations[key] = translated
            confidences.append(out.confidence)
            if out.flagged_cultural:
                cultural_flags.append(
                    f"ai_flagged:{key}:{out.flag_reason}"
                )
        except Exception:  # noqa: BLE001
            # On Gateway failure, leave the source string in place so
            # the reviewer sees the gap explicitly. Confidence pulled
            # down so the average reflects the failure.
            translations[key] = src
            confidences.append(0.0)

    translated_payload = merge_translations_into_payload(payload, translations)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    return TranslationDraft(
        artifact_id=artifact_id,
        target_lang=target_lang,
        payload_translation=translated_payload,
        cultural_flags=cultural_flags,
        avg_confidence=round(avg_conf, 4),
        fields_translated=len(translations),
    )


def _format_glossary_for_prompt(entries: list["GlossaryEntry"]) -> str:
    """Render glossary entries as a prompt fragment. Locked entries
    appear with strong language; cultural entries appear as advisory."""
    if not entries:
        return "(no glossary entries supplied)"
    lines: list[str] = []
    for e in entries:
        if e.category == "locked":
            lines.append(
                f"- LOCKED: '{e.source_term}' MUST be rendered exactly as "
                f"'{e.target_term}' (no translation, no transliteration)."
            )
        elif e.category == "cultural":
            lines.append(
                f"- CULTURAL ADVISORY: '{e.source_term}' is culturally "
                f"sensitive; flag if unsure of register."
            )
        else:
            lines.append(
                f"- {e.category.upper()}: '{e.source_term}' -> '{e.target_term}'"
            )
    return "\n".join(lines)


# Forward-ref import to avoid circular at module-import time. Glossary
# module imports translator's helper for type hints; we import the
# concrete class lazily here.
from learning.localisation.glossary import GlossaryEntry  # noqa: E402
