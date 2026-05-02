"""Mission — Phase 6 S50.

Generates and persists one daily mission per user. Mission card on
the Home page reads from this module; engagement's process_session
consumer writes back completion state.

Five mission kinds (per ADR-0024):
  refresh_decay · weak_concept_drill · bloom_lift · revision_set · mock_segment
"""
