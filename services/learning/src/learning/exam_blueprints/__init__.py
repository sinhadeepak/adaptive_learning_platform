"""Sprint 23 (P4-S23) — exam blueprint module.

Replaces the hardcoded MOCK_BLUEPRINTS dict in adaptive/mock.py with
DB-backed blueprints. Composer is a pure function over a candidate
pool; the route fetches candidates from the Quiz bank via HTTP.

Per ADR-0012.
"""
