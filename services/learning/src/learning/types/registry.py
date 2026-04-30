"""Type Handler registry — read-only after startup.

Per ADR-0018 §"Registry". Adding a new type is one new module + one
`register_handler()` call. Conformance test (in tests/) fails fast at
startup if any handler is missing a required Protocol method or
attribute.
"""

from __future__ import annotations

from pydantic import BaseModel

from learning.types.base import (
    PROTOCOL_ATTRS,
    PROTOCOL_METHODS,
    EvaluationMode,
    QuestionTypeHandler,
)


class TypeMeta(BaseModel):
    """Type registry entry surfaced via `GET /content/types`."""

    type_id: str
    family: str
    evaluation_mode: EvaluationMode
    supports_partial: bool
    media_kinds: list[str]


_HANDLERS: dict[str, QuestionTypeHandler] = {}
_FROZEN: bool = False


class RegistryConformanceError(Exception):
    """Raised at startup if a handler is missing a Protocol method/attr."""


def register_handler(handler: QuestionTypeHandler) -> None:
    """Register a type handler. Validates Protocol conformance; raises
    RegistryConformanceError on missing method/attr."""
    if _FROZEN:
        raise RuntimeError("Type registry is frozen; cannot register after startup")

    missing_attrs = [a for a in PROTOCOL_ATTRS if not hasattr(handler, a)]
    if missing_attrs:
        raise RegistryConformanceError(
            f"Handler missing required attrs: {missing_attrs}"
        )

    missing_methods = [
        m for m in PROTOCOL_METHODS
        if not callable(getattr(handler, m, None))
    ]
    if missing_methods:
        raise RegistryConformanceError(
            f"Handler {handler.type_id} missing required methods: {missing_methods}"
        )

    if handler.type_id in _HANDLERS:
        raise RegistryConformanceError(
            f"Handler for type_id={handler.type_id} already registered"
        )

    _HANDLERS[handler.type_id] = handler


def freeze_registry() -> None:
    """Lock the registry. Called at end of service startup."""
    global _FROZEN
    _FROZEN = True


def get_handler(type_id: str) -> QuestionTypeHandler:
    """Look up a handler. Raises KeyError if unknown."""
    if type_id not in _HANDLERS:
        raise KeyError(f"Unknown question type_id: {type_id}")
    return _HANDLERS[type_id]


def is_supported(type_id: str) -> bool:
    return type_id in _HANDLERS


def all_type_metas() -> list[TypeMeta]:
    """Used by `GET /content/types`. Ordered alphabetically by type_id
    for deterministic output."""
    return sorted(
        [
            TypeMeta(
                type_id=h.type_id,
                family=h.family,
                evaluation_mode=h.evaluation_mode,
                supports_partial=h.supports_partial,
                media_kinds=h.media_kinds,
            )
            for h in _HANDLERS.values()
        ],
        key=lambda m: m.type_id,
    )


def filter_by_family(family: str) -> list[TypeMeta]:
    return [m for m in all_type_metas() if m.family == family]


def _reset_for_tests() -> None:
    """Test-only — clears the registry. Never called in production."""
    global _FROZEN
    _HANDLERS.clear()
    _FROZEN = False
