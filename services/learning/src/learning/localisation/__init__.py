"""Phase 5 (P5-S43) — Localisation pipeline.

Per ADR-0019 §"Localisation pipeline". Translates artifacts via the
AI Gateway with glossary injection + per-language reviewer queue +
optional cultural review.

Module layout:
- translator: payload walker + per-field Gateway call
- glossary:   CRUD + bulk import
- calibration: 5% deterministic sampling + Cohen's kappa per criterion

Hindi at v1; Tamil/Telugu/Bengali/Marathi pipeline-ready (the schema
+ code don't hard-code language codes — just the prompt template).
"""

from __future__ import annotations

from learning.localisation.calibration import (
    cohens_kappa,
    sample_for_calibration_pipeline,
)
from learning.localisation.glossary import (
    GlossaryEntry,
    GlossaryEntryIn,
    list_for_lookup,
    upsert_entry,
)
from learning.localisation.translator import (
    SUPPORTED_LANGS,
    TranslationDraft,
    apply_glossary,
    extract_translatable_strings,
    translate_artifact,
)

__all__ = [
    "SUPPORTED_LANGS",
    "TranslationDraft",
    "apply_glossary",
    "cohens_kappa",
    "extract_translatable_strings",
    "GlossaryEntry",
    "GlossaryEntryIn",
    "list_for_lookup",
    "sample_for_calibration_pipeline",
    "translate_artifact",
    "upsert_entry",
]
