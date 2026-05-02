"""Content references — teacher-curated YouTube + URL pinning (R-S1).

Adds a content-prescription leg to the diagnostic-rich student
journey. Teachers search YouTube via the official Data API v3 (with
24h Redis-backed query cache + per-creator daily quota) and pin
clips to topics, concepts, or specific questions. Students then see
the curated "Watch & Learn" shelf on topic detail and the
"Why this was wrong → Watch this" CTA on quiz results.

See R-S1 plan and the build plan at docs/architecture/content-references.md
(written alongside the first ship).
"""
