"""Phase 1C — Institute outcomes report (PDF).

Renders a one-page printable summary for an institute admin: cohort
roll-up readiness, top-5 strongest topics, top-5 weakest topics,
trend over the last 60 days, and head-line numbers (n_students,
avg_readiness, % weak, % at-risk).

`render_pdf(tenant_id) -> bytes` returns the PDF body. If weasyprint
isn't installed (or its native deps aren't on the host), the function
raises `PdfRenderUnavailable` and the route returns a 503.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from html import escape
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.scope import tenant_user_ids

log = logging.getLogger(__name__)


class PdfRenderUnavailable(RuntimeError):
    pass


@dataclass
class OutcomesContext:
    tenant_id: str
    n_students: int
    avg_readiness: float
    weak_pct: float
    strongest: list[tuple[str, float, int]]   # (topic_id, ewa, n)
    weakest: list[tuple[str, float, int]]
    trend: list[tuple[str, float]]            # (date, avg_readiness)
    generated_at: str


async def gather(session: AsyncSession, tenant_id: str) -> OutcomesContext:
    user_ids = await tenant_user_ids(session, tenant_id)
    if not user_ids:
        return OutcomesContext(
            tenant_id=tenant_id,
            n_students=0,
            avg_readiness=0.0,
            weak_pct=0.0,
            strongest=[],
            weakest=[],
            trend=[],
            generated_at=datetime.utcnow().isoformat(timespec="seconds") + "Z",
        )

    # Headline numbers
    head = (
        await session.execute(
            text(
                """
                SELECT COUNT(DISTINCT user_id)::int AS n_students,
                       AVG(score)::real           AS avg_readiness,
                       (COUNT(*) FILTER (WHERE score < 0.4))::real
                         / NULLIF(COUNT(*), 0)::real AS weak_pct
                  FROM analytics_schema.readiness
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                   AND scope = 'GLOBAL'
                """
            ),
            {"uids": user_ids},
        )
    ).mappings().first()

    # Top topics by mastery (strongest 5 + weakest 5)
    top = (
        await session.execute(
            text(
                """
                SELECT topic_id::text AS topic_id,
                       AVG(ewa)::real AS avg_ewa,
                       COUNT(*)::int  AS n
                  FROM analytics_schema.mastery
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                 GROUP BY topic_id
                """
            ),
            {"uids": user_ids},
        )
    ).mappings().all()

    rows = [(r["topic_id"], float(r["avg_ewa"]), int(r["n"])) for r in top]
    rows.sort(key=lambda r: -r[1])
    strongest = rows[:5]
    weakest = rows[-5:][::-1]

    # 60-day cohort activity trend (questions answered per day, summed
    # across cohort then divided by n_students for a per-student average).
    trend_rows = (
        await session.execute(
            text(
                """
                SELECT activity_date::text AS d,
                       AVG(questions_answered)::real AS avg_q
                  FROM analytics_schema.daily_activity
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                   AND activity_date >= NOW()::date - INTERVAL '60 days'
                 GROUP BY activity_date
                 ORDER BY activity_date ASC
                """
            ),
            {"uids": user_ids},
        )
    ).mappings().all()
    trend = [(r["d"], float(r["avg_q"] or 0.0)) for r in trend_rows]

    return OutcomesContext(
        tenant_id=tenant_id,
        n_students=int(head["n_students"] or 0) if head else 0,
        avg_readiness=round(float(head["avg_readiness"] or 0.0), 4) if head else 0.0,
        weak_pct=round(float(head["weak_pct"] or 0.0), 4) if head else 0.0,
        strongest=strongest,
        weakest=weakest,
        trend=trend,
        generated_at=datetime.utcnow().isoformat(timespec="seconds") + "Z",
    )


def render_html(ctx: OutcomesContext) -> str:
    def _row(t: tuple[str, float, int]) -> str:
        tid, ewa, n = t
        return (
            f"<tr><td><code>{escape(tid[:8])}</code></td>"
            f"<td>{ewa:.2f}</td><td>{n}</td></tr>"
        )

    strongest_html = "".join(_row(r) for r in ctx.strongest) or "<tr><td colspan=3>—</td></tr>"
    weakest_html = "".join(_row(r) for r in ctx.weakest) or "<tr><td colspan=3>—</td></tr>"

    if ctx.trend:
        max_pts = ctx.trend[-30:]
        max_v = max((v for _, v in max_pts), default=1.0) or 1.0
        bars = "".join(
            f'<div class="bar" title="{escape(d)}: {v:.2f}" '
            f'style="height: {int((v / max_v) * 60)}px"></div>'
            for d, v in max_pts
        )
        trend_html = f'<div class="trend">{bars}</div>'
    else:
        trend_html = '<p class="muted">No trend data in the last 60 days.</p>'

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset='utf-8'>
<title>Outcomes Report — {escape(ctx.tenant_id[:8])}</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; color: #111; padding: 32px; }}
  h1 {{ font-size: 22px; margin: 0 0 4px 0; }}
  h2 {{ font-size: 14px; color: #555; margin: 0 0 24px 0; font-weight: 400; }}
  .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 16px 0 24px; }}
  .stat {{ border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; }}
  .stat .v {{ font-size: 22px; font-weight: 600; }}
  .stat .k {{ font-size: 12px; color: #666; text-transform: uppercase; }}
  table {{ border-collapse: collapse; width: 100%; margin: 8px 0 24px; font-size: 13px; }}
  th, td {{ text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }}
  th {{ font-size: 11px; text-transform: uppercase; color: #666; }}
  code {{ font-family: ui-monospace, monospace; font-size: 12px; }}
  .section {{ font-size: 16px; margin: 16px 0 6px; }}
  .trend {{ display: flex; align-items: flex-end; gap: 2px; height: 64px; border-bottom: 1px solid #ccc; }}
  .bar {{ width: 8px; background: #4a7afe; border-radius: 2px 2px 0 0; }}
  .muted {{ color: #888; font-size: 13px; }}
  .footer {{ position: fixed; bottom: 16px; right: 32px; color: #999; font-size: 10px; }}
</style>
</head>
<body>
  <h1>Institute Outcomes Report</h1>
  <h2>Tenant <code>{escape(ctx.tenant_id)}</code> · generated {escape(ctx.generated_at)}</h2>

  <div class="grid">
    <div class="stat"><div class="k">Students</div><div class="v">{ctx.n_students}</div></div>
    <div class="stat"><div class="k">Avg readiness</div><div class="v">{ctx.avg_readiness:.2f}</div></div>
    <div class="stat"><div class="k">% topics weak</div><div class="v">{ctx.weak_pct * 100:.0f}%</div></div>
  </div>

  <div class="section">Activity trend — questions/day (last 30 days)</div>
  {trend_html}

  <div class="section">Strongest topics</div>
  <table>
    <thead><tr><th>Topic</th><th>Avg EWA</th><th>n</th></tr></thead>
    <tbody>{strongest_html}</tbody>
  </table>

  <div class="section">Weakest topics</div>
  <table>
    <thead><tr><th>Topic</th><th>Avg EWA</th><th>n</th></tr></thead>
    <tbody>{weakest_html}</tbody>
  </table>

  <div class="footer">Adaptive Learning Platform · Phase 1C Outcomes Report</div>
</body>
</html>"""


def render_pdf_bytes(html: str) -> bytes:
    try:
        from weasyprint import HTML  # type: ignore
    except Exception as e:  # noqa: BLE001
        raise PdfRenderUnavailable(
            "weasyprint not installed or system libs missing"
        ) from e
    return HTML(string=html).write_pdf()


async def render(session: AsyncSession, tenant_id: str) -> tuple[bytes, str]:
    """Returns (pdf_bytes, suggested_filename)."""
    ctx = await gather(session, tenant_id)
    html = render_html(ctx)
    pdf = render_pdf_bytes(html)
    fname = f"outcomes-{tenant_id[:8]}-{datetime.utcnow().date().isoformat()}.pdf"
    return pdf, fname


async def render_html_fallback(session: AsyncSession, tenant_id: str) -> tuple[str, str]:
    ctx = await gather(session, tenant_id)
    fname = f"outcomes-{tenant_id[:8]}-{datetime.utcnow().date().isoformat()}.html"
    return render_html(ctx), fname
