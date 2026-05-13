"""Phase 1D-7 — Cross-tenant mock leaderboard with national rank.

Opt-in only: only users with `users.opt_in_national_leaderboard = true`
contribute to or see their rank on the national leaderboard. Below the
k-anonymity floor (100 opted-in users for an exam), the leaderboard
returns `hidden=true`.

Display names: when `users.public_display_name` is null, we redact to
"Student #" + first 6 chars of user_id.

V1 implementation: aggregate per-user mock totals from quiz service via
HTTP (AP-01), join with auth opt-in flag via HTTP to identity service.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass

import httpx

from engagement.analytics.config import settings

log = logging.getLogger(__name__)

K_ANON_FLOOR = 100
_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=8.0, write=5.0, pool=5.0)


@dataclass
class LeaderboardEntry:
    rank: int
    user_id: str
    display_name: str
    score_pct: float
    n_mocks: int


@dataclass
class LeaderboardResponse:
    exam_code: str
    hidden: bool
    total_opt_in: int
    entries: list[LeaderboardEntry]
    notes: list[str]


@dataclass
class NationalRank:
    user_id: str
    exam_code: str
    opted_in: bool
    rank: int | None
    total_opt_in: int
    percentile: float | None
    score_pct: float | None
    notes: list[str]


def _redact(user_id: str, public_name: str | None) -> str:
    if public_name:
        return public_name
    h = hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:6].upper()
    return f"Student #{h}"


async def _fetch_opted_in_users(exam_code: str) -> dict[str, str | None]:
    """Returns {user_id: public_display_name | None} for opted-in users.

    v1: best-effort — calls identity service. Returns {} on failure
    (callers treat empty as 'no opted-in cohort yet').
    """
    base = "http://identity:8000"  # ADR-0005 service
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as c:
            r = await c.get(
                f"{base}/internal/profile/opted-in-leaderboard",
                params={"examCode": exam_code},
            )
            if r.status_code == 200:
                return {
                    u["userId"]: u.get("publicDisplayName")
                    for u in r.json().get("users", [])
                }
    except httpx.HTTPError as e:
        log.warning("opted_in_fetch_failed", error=str(e))
    return {}


async def _fetch_user_mock_scores(
    user_ids: list[str], exam_code: str   # noqa: ARG001 — exam_code reserved for future per-exam scoping
) -> dict[str, tuple[float, int]]:
    """Returns {user_id: (avg_score_pct, n_mocks)} via the quiz batch
    endpoint (single round-trip). Empty dict on any failure.

    `exam_code` reserved — quiz currently doesn't tag sessions by exam,
    but once the field lands we'll filter at the SQL level.
    """
    if not user_ids:
        return {}
    base = settings.quiz_base_url.rstrip("/")
    out: dict[str, tuple[float, int]] = {}
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as c:
            r = await c.post(
                f"{base}/quiz/internal/users/mock-summaries",
                json={"userIds": user_ids},
            )
            if r.status_code != 200:
                log.warning("batch_mock_summaries non-200: %s", r.status_code)
                return {}
            for row in r.json().get("items", []):
                uid = str(row.get("userId") or "")
                avg = float(row.get("avgScorePct") or 0.0)
                n = int(row.get("nMocks") or 0)
                if uid and n > 0:
                    out[uid] = (avg, n)
    except httpx.HTTPError as e:
        log.warning("batch_mock_summaries failed: %s", e)
    return out


async def leaderboard(
    *,
    exam_code: str,
    limit: int = 50,
) -> LeaderboardResponse:
    opted = await _fetch_opted_in_users(exam_code)
    if len(opted) < K_ANON_FLOOR:
        return LeaderboardResponse(
            exam_code=exam_code,
            hidden=True,
            total_opt_in=len(opted),
            entries=[],
            notes=[
                f"Only {len(opted)} opted-in users — need at least {K_ANON_FLOOR} "
                "for a public leaderboard. Cohort growing.",
            ],
        )
    scores = await _fetch_user_mock_scores(list(opted.keys()), exam_code)
    rows = sorted(
        [(uid, *scores[uid]) for uid in scores],
        key=lambda t: -t[1],
    )
    entries = [
        LeaderboardEntry(
            rank=i + 1,
            user_id=uid,
            display_name=_redact(uid, opted.get(uid)),
            score_pct=round(score, 2),
            n_mocks=n,
        )
        for i, (uid, score, n) in enumerate(rows[:limit])
    ]
    return LeaderboardResponse(
        exam_code=exam_code,
        hidden=False,
        total_opt_in=len(opted),
        entries=entries,
        notes=[],
    )


async def user_rank(
    *,
    user_id: str,
    exam_code: str,
) -> NationalRank:
    opted = await _fetch_opted_in_users(exam_code)
    if user_id not in opted:
        return NationalRank(
            user_id=user_id,
            exam_code=exam_code,
            opted_in=False,
            rank=None,
            total_opt_in=len(opted),
            percentile=None,
            score_pct=None,
            notes=["Opt in from your profile to see your national rank."],
        )
    scores = await _fetch_user_mock_scores(list(opted.keys()), exam_code)
    sorted_scores = sorted(
        [(uid, *scores[uid]) for uid in scores], key=lambda t: -t[1],
    )
    user_score = scores.get(user_id)
    if user_score is None:
        return NationalRank(
            user_id=user_id,
            exam_code=exam_code,
            opted_in=True,
            rank=None,
            total_opt_in=len(opted),
            percentile=None,
            score_pct=None,
            notes=["You haven't submitted a mock for this exam yet."],
        )
    rank = next(
        (i + 1 for i, (uid, _s, _n) in enumerate(sorted_scores) if uid == user_id),
        None,
    )
    pctile = (
        round(((len(sorted_scores) - rank + 1) / len(sorted_scores)) * 100, 2)
        if rank is not None
        else None
    )
    return NationalRank(
        user_id=user_id,
        exam_code=exam_code,
        opted_in=True,
        rank=rank,
        total_opt_in=len(opted),
        percentile=pctile,
        score_pct=round(user_score[0], 2),
        notes=[],
    )
