"""Topic importance compute — hybrid PYQ + admin override.

Public API:
    topic_importance_map(session, exam_id) -> dict[UUID, ImportanceWeight]
    topic_importance(session, exam_id, topic_id) -> ImportanceWeight | None
    invalidate_cache(exam_id)

The map is bulk-fetched once per request (no N+1) and cached in-process
for 24h. Admin override writes call invalidate_cache().
"""

from __future__ import annotations

from learning.importance.service import (
    ImportanceSource,
    ImportanceWeight,
    invalidate_cache,
    topic_importance,
    topic_importance_map,
)

__all__ = [
    "ImportanceSource",
    "ImportanceWeight",
    "invalidate_cache",
    "topic_importance",
    "topic_importance_map",
]
