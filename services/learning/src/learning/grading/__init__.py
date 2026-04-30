"""Phase 5 (P5-S38) — HTTP wrapper over the Type Dispatcher.

Quiz Go branches on question_type and POSTs to /grading/grade for
non-DETERMINISTIC types (and during initial rollout, also for
DETERMINISTIC types as an integration test). The Resolution emitted
here is consumed by Quiz/Test orchestration's scoring profile.
"""
