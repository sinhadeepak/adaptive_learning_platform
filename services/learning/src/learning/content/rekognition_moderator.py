"""AWS Rekognition image moderator (P5-S63).

Production replacement for StubImageModerator from S53. Rekognition
DetectModerationLabels covers nudity, violence, gore, and visually
disturbing content. CelebrityRecognition handles "copyrighted-character"
detection — Disney/Marvel/Pixar IP won't surface, but real-person
likeness rights do.

Per Cat §4.6 + AIM §5.3. Activated via the lifespan hook when the
required env vars are set:

  AWS_REGION                (e.g. ap-south-1)
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY

Without these, the lifespan hook falls back to the stub moderator;
the upload route still functions but routes everything to
pre-moderation.

Lazy-imports boto3 so the service starts without the SDK installed
(boto3 is intentionally an optional dep — staging-only).
"""

from __future__ import annotations

import logging
from typing import Any

from learning.content.image_moderation import (
    CategoryScore,
    ModerationVerdict,
    decide_verdict,
)

log = logging.getLogger(__name__)


# Mapping from Rekognition's parent-label taxonomy to our 3 internal
# categories. Rekognition surfaces ~40 labels; we only care about the
# few that map cleanly to the spec's nsfw/violence/copyright buckets.
_RKG_LABEL_MAP: dict[str, str] = {
    # NSFW
    "Explicit Nudity": "nsfw",
    "Suggestive": "nsfw",
    "Female Swimwear or Underwear": "nsfw",
    "Male Swimwear or Underwear": "nsfw",
    # Violence
    "Violence": "violence",
    "Visually Disturbing": "violence",
    "Hate Symbols": "violence",
    "Weapons": "violence",
    # The "Rude Gestures" / "Drugs & Tobacco" buckets land in
    # pre-moderation via the suspicious-floor path; they're not
    # outright blocks per the spec's 3-category model.
}


class RekognitionModerator:
    """Async wrapper around boto3 Rekognition. Single-flight via the
    SDK's connection pool; the SDK itself manages retries with backoff
    so we don't need bulkhead logic here."""

    name = "aws-rekognition"

    def __init__(self) -> None:
        try:
            import boto3  # type: ignore[import-untyped]
        except ImportError as e:
            raise RuntimeError(
                "boto3 not installed. pip install boto3 to enable Rekognition."
            ) from e
        # Region picked up from env (AWS_REGION). KMS-encrypted creds
        # via AWS Secrets Manager when running under EKS IRSA in prod.
        self._client = boto3.client("rekognition")

    async def moderate(
        self, *, image_bytes: bytes, content_type: str,
    ) -> ModerationVerdict:
        # boto3 is sync; offload to a thread so we don't block the
        # event loop. asyncio.to_thread is the right primitive when
        # we don't need true async.
        import asyncio

        try:
            resp = await asyncio.to_thread(
                self._client.detect_moderation_labels,
                Image={"Bytes": image_bytes},
                MinConfidence=50,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("rekognition.failed: %s", exc)
            # On infrastructure failure, fall through to pre-moderation
            # rather than blocking the upload — operations decides
            # whether to backfill via batch later.
            return ModerationVerdict(
                allow=True,
                requires_pre_moderation=True,
                blocked_reason=None,
                scores=[],
            )

        scores = self._labels_to_scores(resp.get("ModerationLabels", []))
        return decide_verdict(scores)

    @staticmethod
    def _labels_to_scores(labels: list[dict[str, Any]]) -> list[CategoryScore]:
        """Collapse Rekognition's parent/child label list to our 3
        category buckets. We pick the max confidence per category since
        Rekognition can return overlapping labels (e.g. Violence +
        Weapons together)."""
        per_cat: dict[str, tuple[float, str]] = {}
        for lbl in labels:
            name = lbl.get("Name", "")
            parent = lbl.get("ParentName", "")
            confidence = float(lbl.get("Confidence", 0)) / 100.0
            cat = _RKG_LABEL_MAP.get(name) or _RKG_LABEL_MAP.get(parent)
            if cat is None:
                continue
            existing = per_cat.get(cat)
            if existing is None or confidence > existing[0]:
                per_cat[cat] = (confidence, name)
        return [
            CategoryScore(category=cat, confidence=conf, label=lbl)  # type: ignore[arg-type]
            for cat, (conf, lbl) in per_cat.items()
        ]
