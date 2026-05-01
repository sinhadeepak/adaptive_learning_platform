"""Image moderation pipeline (P5-S53, closes CE-502).

Per Cat §4.6 + AIM §5.3 (Failure modes — Vision model down). Every
uploaded image runs through a content-safety filter before reaching
the peer-review queue.

Three categories per the spec:
- NSFW (nudity / sexual content)
- Violence (graphic violence / gore)
- Copyrighted-character detection (Disney / Marvel / Pixar / etc)

Provider model: AWS Rekognition primary; the local stub provider runs
an in-process fixture-based moderator for tests + dev deployments
without AWS credentials. Behaviour is provider-agnostic: returns a
ModerationVerdict with per-category confidence + a final allow/block
verdict.

The moderator NEVER decides silently. Blocked uploads return an
explicit reason the author sees in the upload UI; suspicious-but-
not-blocking results route to a separate pre-moderation queue (UI
work; this module surfaces the verdict).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal, Protocol

log = logging.getLogger(__name__)

# Per-category block thresholds. Confidence above the threshold blocks
# the upload. Locked at construction; tunable per ADR amendment.
DEFAULT_THRESHOLDS = {
    "nsfw":        0.85,   # high precision vs false positives
    "violence":    0.85,
    "copyright":   0.70,   # lower bar — known IP characters
}

# Above this confidence but below the block threshold, the image lands
# in the pre-moderation queue rather than blocking outright.
SUSPICIOUS_FLOOR = 0.50

ModerationCategory = Literal["nsfw", "violence", "copyright"]


@dataclass(frozen=True)
class CategoryScore:
    category: ModerationCategory
    confidence: float
    label: str = ""        # provider-supplied label (e.g. "Mickey Mouse")


@dataclass
class ModerationVerdict:
    """Final decision + per-category breakdown."""

    allow: bool
    requires_pre_moderation: bool   # suspicious but not blocked
    blocked_reason: str | None
    scores: list[CategoryScore]


class ImageModerator(Protocol):
    async def moderate(self, *, image_bytes: bytes, content_type: str) -> ModerationVerdict:
        ...


# ── Decision logic (pure) ─────────────────────────────────────────────────────


def decide_verdict(
    scores: list[CategoryScore],
    *,
    thresholds: dict[str, float] | None = None,
) -> ModerationVerdict:
    """Apply per-category thresholds to a list of scores. Pure function;
    each provider produces scores then hands the list here."""
    thresholds = thresholds or DEFAULT_THRESHOLDS

    blocked: list[str] = []
    suspicious: list[str] = []
    for s in scores:
        thr = thresholds.get(s.category)
        if thr is None:
            continue
        if s.confidence >= thr:
            blocked.append(f"{s.category}={s.confidence:.2f}({s.label})" if s.label else f"{s.category}={s.confidence:.2f}")
        elif s.confidence >= SUSPICIOUS_FLOOR:
            suspicious.append(f"{s.category}={s.confidence:.2f}")

    if blocked:
        return ModerationVerdict(
            allow=False,
            requires_pre_moderation=False,
            blocked_reason="image_blocked: " + "; ".join(blocked),
            scores=scores,
        )
    if suspicious:
        return ModerationVerdict(
            allow=True,
            requires_pre_moderation=True,
            blocked_reason=None,
            scores=scores,
        )
    return ModerationVerdict(
        allow=True,
        requires_pre_moderation=False,
        blocked_reason=None,
        scores=scores,
    )


# ── Stub moderator (tests + dev) ──────────────────────────────────────────────


class StubImageModerator:
    """Returns a fixed verdict — registers per-test canned responses
    by content-hash prefix. Used by image moderation tests + dev
    deployments without AWS credentials."""

    name = "stub"

    def __init__(self) -> None:
        self._canned: dict[str, list[CategoryScore]] = {}
        self._default_scores: list[CategoryScore] = [
            CategoryScore(category="nsfw", confidence=0.0),
            CategoryScore(category="violence", confidence=0.0),
            CategoryScore(category="copyright", confidence=0.0),
        ]

    def register_canned(self, hash_prefix: str, scores: list[CategoryScore]) -> None:
        self._canned[hash_prefix] = scores

    async def moderate(
        self, *, image_bytes: bytes, content_type: str,
    ) -> ModerationVerdict:
        import hashlib
        digest = hashlib.sha256(image_bytes).hexdigest()
        for prefix, scores in self._canned.items():
            if digest.startswith(prefix):
                return decide_verdict(scores)
        return decide_verdict(self._default_scores)


# ── Module-level singleton (lifespan-injected) ────────────────────────────────


_MODERATOR: ImageModerator | None = None


def get_moderator() -> ImageModerator | None:
    return _MODERATOR


def set_moderator(moderator: ImageModerator | None) -> None:
    """Lifespan hook: install the production AWS Rekognition moderator;
    tests inject the stub."""
    global _MODERATOR
    _MODERATOR = moderator


def reset_for_tests() -> None:
    set_moderator(None)


async def moderate_or_skip(
    *,
    image_bytes: bytes,
    content_type: str,
) -> ModerationVerdict:
    """Convenience entrypoint for upload routes. When no moderator is
    registered (dev without AWS), returns an allow-with-warning
    verdict so the upload pipeline still functions."""
    moderator = get_moderator()
    if moderator is None:
        log.warning("image_moderation.skipped: no moderator configured")
        return ModerationVerdict(
            allow=True,
            requires_pre_moderation=True,  # always suspicious when unmoderated
            blocked_reason=None,
            scores=[],
        )
    return await moderator.moderate(image_bytes=image_bytes, content_type=content_type)
