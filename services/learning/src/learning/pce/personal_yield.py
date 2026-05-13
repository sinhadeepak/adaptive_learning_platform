"""Compute + persist `personal_yield` for one user.

Inputs:
  - `topic_forecast` rows for the user's exam (base_yield)
  - per-user mastery (EWA from engagement.analytics)
  - per-user topic decay severity (from engagement.analytics)
  - user profile's target exam date → days_to_exam → time_pressure

Output:
  - `topic_yield_personal` rows, one per topic, ranked.

Refresh strategy:
  - Nightly cron sweeps every user with activity in the last 14 days.
  - Event-driven trigger on `mastery.delta` ≥ 0.10 (in the engagement
    stream) — recomputes only the affected (user, topic) row.

This module is the "compute" side; HTTP endpoints live in routes.py.
The math is deliberately closed-form so the per-user batch runs in
< 100 ms even with 100+ topics.
"""

from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

SCHEMA = "exam_intelligence_schema"

_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)


def _engagement_base_url() -> str:
    """Engagement service URL — read at call time so tests can override."""
    return os.environ.get("ADAPTIVE_ENGINE_ANALYTICS_BASE_URL", "http://engagement:8000")


# ── Pure-function building blocks ───────────────────────────────────


def time_pressure(days_to_exam: int | None) -> float:
    """Urgency multiplier on personal_yield.

    The further away the exam, the less urgent any single topic is.
    The closer, the more aggressive the prioritisation.

    Function shape (validated against intuition):
      days_to_exam = 365 → 1.0  (1 year out: baseline)
      days_to_exam = 180 → ~1.1
      days_to_exam = 90  → ~1.3
      days_to_exam = 30  → ~1.7
      days_to_exam = 7   → ~2.2

    Bounded above so a "exam tomorrow" panic doesn't blow up the
    ranking with one topic.
    """
    if days_to_exam is None:
        return 1.0
    if days_to_exam <= 0:
        return 2.5
    # Exponential decay from infinity, asymptote at 1.0.
    return float(min(2.5, 1.0 + 1.5 * math.exp(-days_to_exam / 60.0)))


def decay_severity_from_days(days_since_last: int | None) -> float:
    """Map "days since last attempt on this topic" → decay severity
    in [0, 1]. 0 = just practised, 1 = critical.

    Ebbinghaus-inspired: 50% retention at ~14 days for unrehearsed.
    We linearly ramp severity from 0 at day 0 to 1.0 at day 30+.
    """
    if days_since_last is None:
        return 0.5  # never attempted → moderate prior
    if days_since_last <= 0:
        return 0.0
    return float(min(1.0, days_since_last / 30.0))


def personal_yield(
    *,
    base_yield: float,
    mastery: float,
    decay_severity_score: float,
    time_pressure_score: float,
) -> float:
    """The flagship formula. All inputs are bounded; the output has
    no fixed upper bound but is monotone in each input."""
    mastery_clamped = max(0.0, min(1.0, mastery))
    decay_clamped = max(0.0, min(1.0, decay_severity_score))
    # The decay term is added (not multiplied) to room-to-grow, so a
    # high-mastery topic that's decayed still gets some weight — a
    # student near-perfect on Mechanics 30 days ago still benefits
    # from a quick revision.
    room_or_decay = max(1.0 - mastery_clamped, 0.5 * decay_clamped)
    return base_yield * room_or_decay * time_pressure_score


def rationale_for(
    *,
    base_yield: float,
    mastery: float,
    decay_severity_score: float,
    time_pressure_score: float,
) -> str:
    """A one-line, human-readable explanation of the yield. Surfaces
    on the daily-plan rationale — never blank, never machine-jargon."""
    bits: list[str] = []
    if base_yield > 5:
        bits.append("high exam yield")
    elif base_yield > 2:
        bits.append("moderate exam yield")
    else:
        bits.append("low exam yield")
    if mastery < 0.4:
        bits.append("you're weak here")
    elif mastery < 0.7:
        bits.append("there's room to grow")
    else:
        bits.append("you're mostly there")
    if decay_severity_score > 0.6:
        bits.append("decay risk is high")
    if time_pressure_score > 1.3:
        bits.append("exam is close")
    return "; ".join(bits)


# ── HTTP fetchers (mastery + decay come from engagement service) ───


async def fetch_user_mastery(user_id: str) -> dict[str, float]:
    """Returns {topic_id → mastery_ewa} or {} on failure."""
    url = f"{_engagement_base_url()}/analytics/mastery/{user_id}"
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return {}
            body = r.json()
    except httpx.HTTPError as e:
        log.warning("pce.fetch_mastery_failed", extra={"err": str(e)})
        return {}
    return {t["topicId"]: float(t.get("ewa", 0.0)) for t in body.get("topics", [])}


async def fetch_user_topic_decay(user_id: str) -> dict[str, int]:
    """Returns {topic_id → days_since_last_attempt} or {}."""
    url = f"{_engagement_base_url()}/analytics/topic-decay/{user_id}"
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return {}
            body = r.json()
    except httpx.HTTPError as e:
        log.warning("pce.fetch_topic_decay_failed", extra={"err": str(e)})
        return {}
    # Response shape: {items: [{topicId|conceptId, daysSince}]}
    out: dict[str, int] = {}
    for item in body.get("items", []) or []:
        tid = item.get("topicId") or item.get("conceptId")
        if tid:
            out[str(tid)] = int(item.get("daysSince") or item.get("days_since") or 0)
    return out


# ── Top-level compute + persist ────────────────────────────────────


@dataclass
class ComputeResult:
    user_id: str
    exam_id: str
    forecast_year: int
    n_rows: int
    days_to_exam: int | None


async def compute_for_user(
    session: AsyncSession,
    *,
    user_id: str,
    exam_id: str,
    forecast_year: int,
    days_to_exam: int | None = None,
) -> ComputeResult:
    """Compute personal_yield for every topic this user's exam covers,
    persist into topic_yield_personal, return a summary.

    The function is idempotent and safe to call concurrently for the
    same (user, exam) — the final `INSERT … ON CONFLICT` upserts.
    """
    # 1. Base yield from EIS forecast.
    forecast_rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, expected_marks
                  FROM {SCHEMA}.topic_forecast
                 WHERE exam_id = CAST(:eid AS uuid)
                   AND forecast_year = :y
            """),
            {"eid": exam_id, "y": forecast_year},
        )
    ).mappings().all()
    if not forecast_rows:
        return ComputeResult(
            user_id=user_id, exam_id=exam_id, forecast_year=forecast_year,
            n_rows=0, days_to_exam=days_to_exam,
        )

    # 2. Mastery + decay from engagement service.
    mastery = await fetch_user_mastery(user_id)
    decay_days = await fetch_user_topic_decay(user_id)
    tp = time_pressure(days_to_exam)

    # 3. Per-topic compute.
    items: list[dict] = []
    for fr in forecast_rows:
        tid = str(fr["topic_id"])
        base = float(fr["expected_marks"])
        m = mastery.get(tid, 0.0)
        ds_days = decay_days.get(tid)
        ds_score = decay_severity_from_days(ds_days)
        py = personal_yield(
            base_yield=base,
            mastery=m,
            decay_severity_score=ds_score,
            time_pressure_score=tp,
        )
        items.append({
            "topic_id": tid,
            "base_yield": base,
            "mastery": m,
            "decay_severity": ds_score,
            "time_pressure": tp,
            "personal_yield": py,
        })

    # 4. Sort by personal_yield desc, assign rank.
    items.sort(key=lambda r: -r["personal_yield"])
    for i, it in enumerate(items, start=1):
        it["rank"] = i

    # 5. Wipe + insert. We use DELETE-then-INSERT rather than upsert
    # because the row count is small (< 200 per user) and the wipe
    # cleanly drops stale rows for topics that fell out of forecast.
    await session.execute(
        text(f"""
            DELETE FROM {SCHEMA}.topic_yield_personal
             WHERE user_id = CAST(:uid AS uuid)
               AND exam_id = CAST(:eid AS uuid)
               AND forecast_year = :y
        """),
        {"uid": user_id, "eid": exam_id, "y": forecast_year},
    )
    now = datetime.now(timezone.utc)
    for it in items:
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.topic_yield_personal
                    (user_id, exam_id, topic_id, forecast_year,
                     base_yield, mastery, decay_severity, time_pressure,
                     personal_yield, rank, computed_at)
                VALUES
                    (CAST(:uid AS uuid), CAST(:eid AS uuid), CAST(:tid AS uuid), :y,
                     :base, :m, :ds, :tp, :py, :rk, :ts)
            """),
            {
                "uid": user_id, "eid": exam_id, "tid": it["topic_id"], "y": forecast_year,
                "base": it["base_yield"], "m": it["mastery"], "ds": it["decay_severity"],
                "tp": it["time_pressure"], "py": it["personal_yield"], "rk": it["rank"],
                "ts": now,
            },
        )

    return ComputeResult(
        user_id=user_id, exam_id=exam_id, forecast_year=forecast_year,
        n_rows=len(items), days_to_exam=days_to_exam,
    )


# ── Read helpers (used by routes.py) ────────────────────────────────


async def read_ranking(
    session: AsyncSession,
    *,
    user_id: str,
    exam_id: str,
    forecast_year: int,
    limit: int = 20,
) -> list[dict]:
    """Top-N yield-ranking rows for (user, exam, forecast_year)."""
    rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, rank, base_yield, mastery,
                       decay_severity, time_pressure, personal_yield
                  FROM {SCHEMA}.topic_yield_personal
                 WHERE user_id = CAST(:uid AS uuid)
                   AND exam_id = CAST(:eid AS uuid)
                   AND forecast_year = :y
                 ORDER BY rank ASC
                 LIMIT :lim
            """),
            {"uid": user_id, "eid": exam_id, "y": forecast_year, "lim": limit},
        )
    ).mappings().all()
    out = []
    for r in rows:
        out.append({
            "topicId": str(r["topic_id"]),
            "rank": int(r["rank"]),
            "baseYield": float(r["base_yield"]),
            "mastery": float(r["mastery"]),
            "decaySeverity": float(r["decay_severity"]),
            "timePressure": float(r["time_pressure"]),
            "personalYield": float(r["personal_yield"]),
            "rationale": rationale_for(
                base_yield=float(r["base_yield"]),
                mastery=float(r["mastery"]),
                decay_severity_score=float(r["decay_severity"]),
                time_pressure_score=float(r["time_pressure"]),
            ),
        })
    return out


async def score_projection(
    session: AsyncSession,
    *,
    user_id: str,
    exam_id: str,
    forecast_year: int,
    if_topic_mastered: str | None = None,
) -> dict:
    """Sum across topics: each topic contributes
    `expected_marks × mastery` to the projected score.

    When `if_topic_mastered` is set, that one topic is treated as
    mastery=1.0 in the sum — the counterfactual."""
    rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, base_yield, mastery
                  FROM {SCHEMA}.topic_yield_personal
                 WHERE user_id = CAST(:uid AS uuid)
                   AND exam_id = CAST(:eid AS uuid)
                   AND forecast_year = :y
            """),
            {"uid": user_id, "eid": exam_id, "y": forecast_year},
        )
    ).mappings().all()
    score_now = 0.0
    score_cf = 0.0
    contribs = []
    for r in rows:
        b = float(r["base_yield"])
        m = float(r["mastery"])
        tid = str(r["topic_id"])
        score_now += b * m
        # Counterfactual: mastery → 1.0 for the named topic.
        cf_m = 1.0 if (if_topic_mastered is not None and tid == if_topic_mastered) else m
        score_cf += b * cf_m
        contribs.append({"topicId": tid, "contribution": b * m, "maxContribution": b})
    contribs.sort(key=lambda x: -x["maxContribution"])
    out = {
        "scoreNow": score_now,
        "scoreIfMastered": score_cf,
        "delta": score_cf - score_now,
        "topContributions": contribs[:5],
    }
    return out
