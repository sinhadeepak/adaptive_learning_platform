"""Type Handler bootstrap — registers all 9 v1 deterministic handlers.

Called once at service startup (from learning.main lifespan). Adding
the 22nd type means: write one new handler module + add one
register_handler() call here.

Per ADR-0018 §"Registry": registry is read-only after startup;
registration failure (missing Protocol method/attr) blocks deployment.
"""

from __future__ import annotations

from learning.types.numeric.handlers import (
    FormulaInputHandler,
    NumericDecimalHandler,
    NumericIntegerHandler,
    NumericRangeHandler,
)
from learning.types.objective.handlers import (
    AssertionReasonHandler,
    MCQMultiHandler,
    MCQSingleHandler,
    MultiStatementHandler,
    TrueFalseHandler,
)
from learning.types.registry import freeze_registry, register_handler


def register_all_v1_handlers() -> None:
    """Register every v1 deterministic handler. Idempotent only at
    process boundary — calling twice raises (registry is read-only)."""
    # Objective family (5)
    register_handler(MCQSingleHandler())
    register_handler(MCQMultiHandler())
    register_handler(TrueFalseHandler())
    register_handler(AssertionReasonHandler())
    register_handler(MultiStatementHandler())
    # Numeric family (4)
    register_handler(NumericIntegerHandler())
    register_handler(NumericDecimalHandler())
    register_handler(NumericRangeHandler())
    register_handler(FormulaInputHandler())
    # Matching family (3) — wires up in S39
    # Fill-in family (4) — wires up in S39
    # Subjective family (4) — wires up in S42
    # Visual family (4) — wires up in S44
    # Audio/Video + Interactive (5 gated stubs) — wire up in S47

    freeze_registry()
