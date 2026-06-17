"""YouTube Data API v3 client — search + metadata fetch.

Graceful degrade when YOUTUBE_DATA_API_KEY is unset: the search
endpoint returns an empty result set with `note` populated so the
teacher UI can prompt them to paste a URL directly. This keeps the
service bootable in dev without a Google Cloud project.

Quota math (per Google):
  - search.list = 100 units
  - videos.list = 1 unit per ID, batched up to 50
  - default daily quota = 10,000 units
  - one search call = ~101 units → ~99 unique searches/day platform-wide
    without paid quota. The cache layer multiplies effective searches
    5-10× by deduplicating teacher queries.

Reference: https://developers.google.com/youtube/v3/docs/search/list
"""

from __future__ import annotations

import logging
import os
import re
from collections.abc import Iterable
from datetime import datetime
from typing import Any

import httpx

from learning.content.resources.schemas import SearchResultItem

log = logging.getLogger(__name__)

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
EDUCATION_CATEGORY_ID = "27"

# Reels / shorts / stub-style clips don't carry enough teaching surface
# for a learning resource. Enforce a 20-minute floor: it matches
# YouTube's own `videoDuration=long` bucket (`>20m`) and removes shorts
# (≤60s) plus most reaction / preview / promo content.
MIN_DURATION_SECONDS = 20 * 60


class YouTubeClient:
    def __init__(self, api_key: str | None, http_client: httpx.AsyncClient | None = None):
        self.api_key = api_key
        self._client = http_client

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(8.0))
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()

    async def search(
        self,
        query: str,
        *,
        max_results: int = 10,
        language: str = "en",
    ) -> list[SearchResultItem]:
        """Search YouTube for educational videos.

        Returns a list of typed items. When the API key is not configured
        returns an empty list — caller should fall back to the URL-paste
        flow and surface `note: "search_unavailable"` in the response.
        """
        if not self.is_configured:
            return []

        client = await self._http()
        # Over-fetch from YouTube: `videoDuration=long` is approximate
        # (Google's threshold ≈20m but isn't guaranteed exact), so we
        # post-filter on real `contentDetails.duration`. Asking the API
        # for ~2.5× the requested page makes it likely we still have
        # enough rows after dropping anything < MIN_DURATION_SECONDS.
        api_max = max(1, min(max_results * 3, 50))
        try:
            search_resp = await client.get(
                f"{YOUTUBE_API_BASE}/search",
                params={
                    "key": self.api_key,
                    "q": query,
                    "part": "snippet",
                    "type": "video",
                    "videoCategoryId": EDUCATION_CATEGORY_ID,
                    "videoDuration": "long",
                    "maxResults": api_max,
                    "relevanceLanguage": language,
                    "safeSearch": "strict",
                },
            )
            search_resp.raise_for_status()
            search_payload = search_resp.json()
        except httpx.HTTPError:
            log.exception("youtube_search_http_error")
            return []

        ids = [
            item["id"]["videoId"]
            for item in search_payload.get("items", [])
            if "videoId" in item.get("id", {})
        ]
        if not ids:
            return []

        # Batch the metadata call to get duration + view count.
        try:
            videos_resp = await client.get(
                f"{YOUTUBE_API_BASE}/videos",
                params={
                    "key": self.api_key,
                    "id": ",".join(ids),
                    "part": "contentDetails,statistics,snippet,status",
                },
            )
            videos_resp.raise_for_status()
            videos_payload = videos_resp.json()
        except httpx.HTTPError:
            log.exception("youtube_videos_http_error")
            videos_payload = {"items": []}

        meta_by_id = {item["id"]: item for item in videos_payload.get("items", [])}
        results: list[SearchResultItem] = []
        for item in search_payload.get("items", []):
            vid = item.get("id", {}).get("videoId")
            if not vid:
                continue
            meta = meta_by_id.get(vid, {})
            content = meta.get("contentDetails") or {}
            stats = meta.get("statistics") or {}
            snippet = item.get("snippet") or meta.get("snippet") or {}
            status = meta.get("status") or {}

            # Skip non-public videos defensively.
            if status.get("privacyStatus") and status["privacyStatus"] != "public":
                continue

            duration_seconds = _parse_iso8601_duration(content.get("duration"))
            # Defence-in-depth alongside `videoDuration=long`: drop
            # anything under the floor (or with unknown duration — a
            # learning video without a parseable duration is suspect).
            if duration_seconds is None or duration_seconds < MIN_DURATION_SECONDS:
                continue

            results.append(
                SearchResultItem(
                    video_id=vid,
                    title=snippet.get("title") or "",
                    description=snippet.get("description"),
                    channel_name=snippet.get("channelTitle"),
                    duration_seconds=duration_seconds,
                    thumbnail_url=_pick_thumbnail(snippet.get("thumbnails")),
                    published_at=_parse_dt(snippet.get("publishedAt")),
                    view_count=int(stats["viewCount"]) if "viewCount" in stats else None,
                )
            )
            if len(results) >= max_results:
                break
        return results

    async def get_video_metadata(self, video_id: str) -> SearchResultItem | None:
        """Single-video lookup. Used by the pin endpoint when the
        teacher pastes a URL — we want to populate title / channel /
        duration / thumbnail server-side rather than trust the client."""
        if not self.is_configured:
            return None

        client = await self._http()
        try:
            r = await client.get(
                f"{YOUTUBE_API_BASE}/videos",
                params={
                    "key": self.api_key,
                    "id": video_id,
                    "part": "contentDetails,statistics,snippet,status",
                },
            )
            r.raise_for_status()
            payload = r.json()
        except httpx.HTTPError:
            log.exception("youtube_metadata_http_error", extra={"video_id": video_id})
            return None

        items = payload.get("items") or []
        if not items:
            return None
        meta = items[0]
        snippet = meta.get("snippet") or {}
        content = meta.get("contentDetails") or {}
        stats = meta.get("statistics") or {}
        return SearchResultItem(
            video_id=video_id,
            title=snippet.get("title") or "",
            description=snippet.get("description"),
            channel_name=snippet.get("channelTitle"),
            duration_seconds=_parse_iso8601_duration(content.get("duration")),
            thumbnail_url=_pick_thumbnail(snippet.get("thumbnails")),
            published_at=_parse_dt(snippet.get("publishedAt")),
            view_count=int(stats["viewCount"]) if "viewCount" in stats else None,
        )

    async def check_availability(self, video_ids: Iterable[str]) -> dict[str, bool]:
        """Returns {video_id: is_available}. Used by the daily availability
        background job. An ID missing from the response means YouTube
        no longer recognises it (deleted)."""
        ids = list(video_ids)
        if not ids or not self.is_configured:
            return {vid: True for vid in ids}

        out: dict[str, bool] = {vid: False for vid in ids}
        client = await self._http()
        # Batch in groups of 50 (API max).
        for i in range(0, len(ids), 50):
            chunk = ids[i : i + 50]
            try:
                r = await client.get(
                    f"{YOUTUBE_API_BASE}/videos",
                    params={
                        "key": self.api_key,
                        "id": ",".join(chunk),
                        "part": "status",
                    },
                )
                r.raise_for_status()
                payload = r.json()
            except httpx.HTTPError:
                log.exception("youtube_availability_http_error")
                continue
            for item in payload.get("items", []):
                vid = item.get("id")
                status = (item.get("status") or {}).get("privacyStatus")
                if vid and status == "public":
                    out[vid] = True
        return out


# ─────────────────────────────────────────────────────────────────────────
# Module-level singleton + helpers
# ─────────────────────────────────────────────────────────────────────────

_singleton: YouTubeClient | None = None


def get_client() -> YouTubeClient:
    global _singleton
    if _singleton is None:
        _singleton = YouTubeClient(api_key=os.environ.get("YOUTUBE_DATA_API_KEY"))
    return _singleton


def set_client(client: YouTubeClient | None) -> None:
    """Test seam — overrides the module singleton with a stub."""
    global _singleton
    _singleton = client


_VIDEO_ID_RE = re.compile(
    r"(?:v=|/embed/|/watch\?v=|youtu\.be/|/shorts/)([A-Za-z0-9_-]{11})"
)


def extract_video_id(url: str) -> str | None:
    """Extract a YouTube video ID from a URL. Accepts the common
    formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
    youtube.com/shorts/ID, and bare IDs."""
    if not url:
        return None
    s = url.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", s):
        return s
    m = _VIDEO_ID_RE.search(s)
    return m.group(1) if m else None


# ─────────────────────────────────────────────────────────────────────────
# Internal parsers
# ─────────────────────────────────────────────────────────────────────────


def _parse_iso8601_duration(s: str | None) -> int | None:
    """YouTube returns ISO 8601 durations (e.g. PT3M42S, PT1H5M, PT45S).
    Translate to total seconds. Returns None on parse failure."""
    if not s:
        return None
    m = re.fullmatch(
        r"PT(?:(?P<h>\d+)H)?(?:(?P<m>\d+)M)?(?:(?P<s>\d+)S)?",
        s.strip(),
    )
    if not m:
        return None
    h = int(m.group("h") or 0)
    mi = int(m.group("m") or 0)
    se = int(m.group("s") or 0)
    return h * 3600 + mi * 60 + se


def _pick_thumbnail(thumbs: dict[str, Any] | None) -> str | None:
    if not thumbs:
        return None
    # Prefer 'medium' (320×180) for grid display; fall back to 'high'/'default'.
    for key in ("medium", "high", "default", "standard", "maxres"):
        if key in thumbs and "url" in thumbs[key]:
            return thumbs[key]["url"]
    return None


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        # YouTube returns RFC3339 with 'Z' suffix.
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
