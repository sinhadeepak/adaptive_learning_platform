"""Sprint 26 (P4-S26) — concept prerequisite graph activation.

The `prerequisites` JSONB column has shipped on catalog_schema.topics since
Sprint 1 but was never read. This module turns it on: traversal helpers,
gate computation against user mastery, and HTTP endpoints surfacing both.

Pure-function traversal in `traversal.py` has no DB or HTTP coupling and
is fully unit-testable. Routes + the engagement mastery fan-out live in
`routes.py`; SQL reads live in `repositories.py`.
"""
