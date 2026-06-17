"""Phase 1D-5 — Comparative rank trajectory.

For a user's mock-test history, plots their score trajectory against
cohort reference bands derived from `real_exam_outcomes`:

  - p25 band = 25th-percentile mock-score among students whose real_rank ended above 50K
  - p50 band = median mock-score among the full opt-in cohort
  - p75 band = 75th-percentile mock-score among students whose real_rank ended below 5K

We pull the user's MOCK and MOCK_BLUEPRINT sessions via HTTP from quiz
(AP-01 — no cross-DB joins) and convert to a per-mock score time series.

Reference bands are cached in-process for 10 minutes; rebuilds happen
on cache miss. K-anonymity floor of 30 — when not enough data exists in
a band, that line falls back to a static placeholder.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.config import settings
from engagement.analytics.db import sessionmaker

log = logging.getLogger(__name__)

_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=8.0, write=5.0, pool=5.0)
_REF_CACHE_TTL = 600.0   # 10 minutes
_REF_CACHE: dict[str, tuple[float, tuple[float | None, float | None, float | None]]] = {}
_K_ANON = 30


@dataclass
class TrajectoryPoint:
    session_id: str
    mock_date: str
    user_score_pct: float          # 0..100
    served_count: int
    correct_count: int
    mode: str


@dataclass
class TrajectoryReport:
    user_id: str
    exam_code: str
    points: list[TrajectoryPoint]
    rolling_projection: float | None       # 0..100 — 5-mock simple-MA forecast
    p25_reference: float | None            # static national reference (placeholder)
    p50_reference: float | None
    p75_reference: float | None
    notes: list[str]


# Static fallback used when fewer than _K_ANON real-outcome samples exist.
_STATIC_BANDS: dict[str, tuple[float, float, float]] = {
    "NEET": (45.0, 60.0, 78.0),
    "JEE": (40.0, 55.0, 72.0),
    "UPSC": (35.0, 50.0, 65.0),
    "CBSE": (55.0, 70.0, 85.0),
}


async def _compute_reference_bands(
    session: AsyncSession, exam_code: str
) -> tuple[float | None, float | None, float | None]:
    """Compute (p25_high_rank_band, p50_overall, p75_top_rank_band) from
    `real_exam_outcomes` joined with the quiz batch mock-summary
    endpoint (AP-01 — no cross-DB joins). Empty -> static fallback.
    """
    rank_rows = (
        await session.execute(
            text(
                """
                SELECT user_id::text, real_rank
                  FROM analytics_schema.real_exam_outcomes
                 WHERE exam_code = :ec
                   AND real_rank IS NOT NULL
                """
            ),
            {"ec": exam_code},
        )
    ).all()
    if not rank_rows:
        return (None, None, None)
    rank_by_uid = {r[0]: int(r[1]) for r in rank_rows}
    user_ids = list(rank_by_uid.keys())

    # Fetch mock summaries via the quiz batch endpoint.
    base = settings.quiz_base_url.rstrip("/")
    summaries: dict[str, float] = {}
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as c:
            r = await c.post(
                f"{base}/quiz/internal/users/mock-summaries",
                json={"userIds": user_ids},
            )
            if r.status_code == 200:
                for row in r.json().get("items", []):
                    uid = str(row.get("userId") or "")
                    avg = float(row.get("avgScorePct") or 0.0)
                    if uid and avg > 0:
                        summaries[uid] = avg
    except httpx.HTTPError as err:
        log.warning("rank_trajectory.quiz_fetch_failed", exc_info=err)
        return (None, None, None)

    pcts_top: list[float] = []     # AIR < 5K
    pcts_low: list[float] = []     # AIR > 50K
    pcts_all: list[float] = []
    for uid, avg in summaries.items():
        rank = rank_by_uid.get(uid)
        pcts_all.append(avg)
        if rank is not None and rank < 5000:
            pcts_top.append(avg)
        if rank is not None and rank > 50000:
            pcts_low.append(avg)

    def _percentile(xs: list[float], p: float) -> float | None:
        if len(xs) < _K_ANON:
            return None
        ys = sorted(xs)
        i = max(0, min(len(ys) - 1, int(round((len(ys) - 1) * p))))
        return round(ys[i], 2)

    return (
        _percentile(pcts_low, 0.25),
        _percentile(pcts_all, 0.50),
        _percentile(pcts_top, 0.75),
    )


async def _reference_bands(
    exam_code: str,
) -> tuple[float | None, float | None, float | None]:
    """Cached fetch — returns (p25, p50, p75) using real-exam-outcome
    data when available, falls back to static placeholders by exam."""
    now = time.monotonic()
    cached = _REF_CACHE.get(exam_code.upper())
    if cached and now - cached[0] < _REF_CACHE_TTL:
        return cached[1]
    try:
        async with sessionmaker()() as session:
            p25, p50, p75 = await _compute_reference_bands(session, exam_code)
    except Exception as err:
        log.warning("rank_trajectory.bands_compute_failed", exc_info=err)
        p25 = p50 = p75 = None
    fallback = _STATIC_BANDS.get(exam_code.upper(), (None, None, None))
    bands = (
        p25 if p25 is not None else fallback[0],
        p50 if p50 is not None else fallback[1],
        p75 if p75 is not None else fallback[2],
    )
    _REF_CACHE[exam_code.upper()] = (now, bands)
    return bands


async def compute(
    *,
    user_id: str,
    exam_code: str,
) -> TrajectoryReport:
    notes: list[str] = []
    quiz_base = settings.quiz_base_url.rstrip("/") if hasattr(settings, "quiz_base_url") else None
    if quiz_base is None:
        # Fall back to the conventional URL
        quiz_base = "http://quiz:8000"

    points: list[TrajectoryPoint] = []
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as c:
            r = await c.get(
                f"{quiz_base}/quiz/sessions",
                params={"userId": user_id, "limit": 200},
            )
            if r.status_code == 200:
                body = r.json()
                items = body.get("items", body if isinstance(body, list) else [])
                for s in items:
                    mode = s.get("mode") or ""
                    if mode not in ("MOCK", "MOCK_BLUEPRINT"):
                        continue
                    if s.get("status") != "SUBMITTED":
                        continue
                    served = int(s.get("servedCount") or 0)
                    correct = int(s.get("correctCount") or 0)
                    if served == 0:
                        continue
                    pct = round((correct / served) * 100.0, 2)
                    started = s.get("startedAt") or s.get("submittedAt") or ""
                    points.append(
                        TrajectoryPoint(
                            session_id=s.get("sessionId") or s.get("id") or "",
                            mock_date=str(started)[:10],
                            user_score_pct=pct,
                            served_count=served,
                            correct_count=correct,
                            mode=mode,
                        )
                    )
    except httpx.HTTPError as err:
        log.warning("rank_trajectory.quiz_fetch_failed", exc_info=err)
        notes.append("Couldn't load mock history right now — try again in a moment.")

    points.sort(key=lambda p: p.mock_date)

    rolling = None
    if len(points) >= 3:
        recent = points[-min(5, len(points)):]
        rolling = round(sum(p.user_score_pct for p in recent) / len(recent), 2)

    p25, p50, p75 = await _reference_bands(exam_code)

    if not points:
        notes.append("No submitted mocks yet — finish a mock to see your trajectory.")

    return TrajectoryReport(
        user_id=user_id,
        exam_code=exam_code,
        points=points,
        rolling_projection=rolling,
        p25_reference=p25,
        p50_reference=p50,
        p75_reference=p75,
        notes=notes,
    )
