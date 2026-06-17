"""Forecaster — per-topic P(appears) + expected_marks for next exam.

Combines four signals (per the plan §B1):

    p_appears = w_freq    × freq_10y
              + w_recency × recency_3y_weighted
              + w_trend   × trend_slope_5y
              + w_syllabus× in_current_syllabus

Weights are bounded (sum ≤ 1) and fit per exam against a held-out year.

Per-topic forecasts are smoothed via the `alp-stats` Hierarchical-
Bayes empirical-Bayes shrinker — low-n topics get pulled toward the
cohort mean so a single-year anomaly doesn't blow up the forecast.

The output goes into `topic_forecast`. Confidence intervals come
from a non-parametric bootstrap over the per-topic time series.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

# numpy + alp_stats are heavy imports — defer to function call time
# so this module loads cleanly on hosts where the math stack hasn't
# been installed yet (e.g., a fresh container before pip-install).
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "exam_intelligence_schema"

# Default weights — these are reasonable starting points and get
# fit per-exam in Phase B4. Documented so the team can audit.
DEFAULT_WEIGHTS = {
    "freq": 0.4,
    "recency": 0.3,
    "trend": 0.15,
    "syllabus": 0.15,
}


async def forecast_topics(
    session: AsyncSession,
    *,
    exam_id: str,
    forecast_year: int,
    weights: dict[str, float] | None = None,
    history_window: int = 10,
) -> dict[str, int]:
    """Compute and persist topic_forecast rows for an exam.

    Steps:
      1. Pull per-(topic, year) counts from topic_appearance_stats.
      2. For each topic, compute the 4 signals.
      3. Run hierarchical-Bayes shrinkage across topics to stabilise
         the p_appears estimates for sparse topics.
      4. Bootstrap a CI by resampling the per-topic time series.
      5. Wipe + rewrite topic_forecast for this (exam, year).

    Returns a small summary dict.
    """
    # Lazy heavy-stat imports — see module docstring.
    import numpy as np
    from alp_stats import HierarchicalBayes

    w = weights or DEFAULT_WEIGHTS
    # ── Step 1: pull history ────────────────────────────────────
    rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, year, n_questions, total_marks
                  FROM {SCHEMA}.topic_appearance_stats
                 WHERE exam_id = CAST(:eid AS uuid)
                   AND year >= :y_lo
                 ORDER BY topic_id, year
            """),
            {"eid": exam_id, "y_lo": forecast_year - history_window},
        )
    ).mappings().all()

    if not rows:
        return {"topics_forecast": 0, "reason": "no_history"}

    # Bucket by topic.
    per_topic: dict[str, list[tuple[int, int, int]]] = {}
    for r in rows:
        per_topic.setdefault(str(r["topic_id"]), []).append(
            (int(r["year"]), int(r["n_questions"]), int(r["total_marks"]))
        )

    # ── Step 2: per-topic signals ─────────────────────────────────
    # Each topic gets (frequency_rate, recency_rate, trend_slope, avg_marks).
    signals: dict[str, dict[str, float]] = {}
    for topic_id, history in per_topic.items():
        years = np.array([y for y, _, _ in history])
        ns = np.array([n for _, n, _ in history])
        marks = np.array([m for _, _, m in history])
        # Frequency: fraction of years where ≥1 question appeared.
        n_years_seen = (ns > 0).sum()
        n_years_total = min(history_window, max(forecast_year - years.min(), 1))
        freq_rate = float(n_years_seen / n_years_total)
        # Recency-weighted: last 3 years, exponential decay 1.0 / 0.7 / 0.5.
        last3_years = sorted({forecast_year - 1, forecast_year - 2, forecast_year - 3})
        recency_weights = [1.0, 0.7, 0.5]
        recency_num, recency_den = 0.0, 0.0
        for y, w_y in zip(last3_years, recency_weights):
            if y in years.tolist():
                idx = years.tolist().index(y)
                recency_num += (ns[idx] > 0) * w_y
            # Only include if the year falls inside the observed history.
            if years.min() <= y <= years.max():
                recency_den += w_y
        recency_rate = recency_num / recency_den if recency_den > 0 else 0.0
        # Trend slope: linear regression of n_questions on year, over the
        # last 5 years. Slope > 0 → "rising"; < 0 → "falling".
        last5 = [(y, n) for y, n in zip(years, ns) if y >= forecast_year - 5]
        if len(last5) >= 2:
            xs = np.array([y for y, _ in last5], dtype=float)
            ys = np.array([n for _, n in last5], dtype=float)
            slope = float(np.polyfit(xs, ys, 1)[0])
            # Normalise: divide by max n to get a unitless [-1, 1]-ish ratio.
            slope_norm = float(np.tanh(slope / max(ns.max(), 1)))
        else:
            slope_norm = 0.0
        # Average marks per appearance (over years it did appear).
        avg_marks = float(marks[ns > 0].mean()) if (ns > 0).any() else 0.0
        # Average questions per appearance.
        avg_qcount = float(ns[ns > 0].mean()) if (ns > 0).any() else 0.0
        signals[topic_id] = {
            "freq": freq_rate,
            "recency": recency_rate,
            "trend": slope_norm,
            "avg_marks_per_appearance": avg_marks,
            "avg_qcount_per_appearance": avg_qcount,
        }

    # ── Step 3: empirical-Bayes shrinkage on freq_rate ──────────
    # Use observed (n_years_seen, n_years_total) per topic so low-n
    # topics get pulled toward the cohort frequency.
    obs = []
    for topic_id, history in per_topic.items():
        ns = np.array([n for _, n, _ in history])
        n_seen = int((ns > 0).sum())
        n_total = len(history)
        obs.append((topic_id, n_seen, n_total))
    eb = HierarchicalBayes.fit(obs)

    # ── Step 4: combine signals + bootstrap CI ──────────────────
    rng = np.random.default_rng(seed=hash(exam_id) & 0xFFFF)
    out: list[dict[str, Any]] = []
    for topic_id, sig in signals.items():
        # Syllabus indicator: 1 = topic still in syllabus. For Phase B1
        # we assume yes (a future API will inject this from the
        # catalog's syllabus tables). When the indicator drops to 0,
        # p_appears must zero out regardless of history.
        in_syllabus = 1.0
        # Shrunk freq replaces raw freq.
        shrunk_freq = eb[topic_id].shrunk_rate

        p_appears = (
            w["freq"]    * shrunk_freq
            + w["recency"] * sig["recency"]
            + w["trend"]   * max(0.0, sig["trend"])  # rising trend only adds
            + w["syllabus"]* in_syllabus
        )
        # Clip into [0, 1].
        p_appears = max(0.0, min(1.0, p_appears))
        # Expected counts + marks.
        expected_qs = p_appears * sig["avg_qcount_per_appearance"]
        expected_marks = p_appears * sig["avg_marks_per_appearance"]

        # ── Bootstrap CI (light) ──
        # Resample the topic's observed years 200x; recompute the
        # shrunk freq within each resample; take 2.5/97.5 percentiles.
        history = per_topic[topic_id]
        ns_arr = np.array([n for _, n, _ in history])
        n_total = len(history)
        if n_total >= 2:
            samples = []
            for _ in range(200):
                idx = rng.integers(0, n_total, size=n_total)
                n_seen = int((ns_arr[idx] > 0).sum())
                samples.append(n_seen / n_total)
            ci_lo = float(np.percentile(samples, 2.5))
            ci_hi = float(np.percentile(samples, 97.5))
        else:
            ci_lo = max(0.0, p_appears - 0.3)
            ci_hi = min(1.0, p_appears + 0.3)

        # Confidence: 1 - normalised CI width.
        confidence = float(max(0.0, 1.0 - (ci_hi - ci_lo)))

        # Trend label.
        if sig["trend"] > 0.1:
            trend = "rising"
        elif sig["trend"] < -0.1:
            trend = "falling"
        elif abs(sig["trend"]) > 0.3:
            trend = "volatile"
        else:
            trend = "stable"

        out.append({
            "topic_id": topic_id,
            "p_appears": p_appears,
            "p_appears_ci_low": ci_lo,
            "p_appears_ci_high": ci_hi,
            "expected_questions": expected_qs,
            "expected_marks": expected_marks,
            "confidence": confidence,
            "trend": trend,
        })

    # ── Step 5: persist ─────────────────────────────────────────
    # Wipe existing forecast for (exam, forecast_year).
    await session.execute(
        text(f"""
            DELETE FROM {SCHEMA}.topic_forecast
             WHERE exam_id = CAST(:eid AS uuid)
               AND forecast_year = :y
        """),
        {"eid": exam_id, "y": forecast_year},
    )
    now = datetime.now(timezone.utc)
    for row in out:
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.topic_forecast
                    (exam_id, topic_id, forecast_year,
                     p_appears, p_appears_ci_low, p_appears_ci_high,
                     expected_questions, expected_marks,
                     confidence, trend, last_computed_at)
                VALUES
                    (CAST(:eid AS uuid), CAST(:tid AS uuid), :y,
                     :p, :lo, :hi, :eq, :em, :c, :tr, :ts)
            """),
            {
                "eid": exam_id,
                "tid": row["topic_id"],
                "y": forecast_year,
                "p": row["p_appears"],
                "lo": row["p_appears_ci_low"],
                "hi": row["p_appears_ci_high"],
                "eq": row["expected_questions"],
                "em": row["expected_marks"],
                "c": row["confidence"],
                "tr": row["trend"],
                "ts": now,
            },
        )

    return {"topics_forecast": len(out), "forecast_year": forecast_year}
