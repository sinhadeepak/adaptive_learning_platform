"""job_repo round-trips a second job kind via the template_id param."""
from __future__ import annotations

import asyncio
from uuid import uuid4

import asyncpg
import pytest

from learning.content.db import sessionmaker
from learning.exam_builder import job_repo


@pytest.fixture(autouse=True)
def _clean() -> None:
    async def _t() -> None:
        c = await asyncpg.connect(host="localhost", port=35432, user="postgres",
                                  password="postgres", database="learning_test")
        try:
            await c.execute("TRUNCATE content_schema.ai_generation_jobs")
        finally:
            await c.close()
    asyncio.run(_t())


def test_custom_template_id_round_trips() -> None:
    admin = str(uuid4())

    async def _run() -> dict:
        async with sessionmaker()() as s:
            jid = await job_repo.create_research_job(
                s, request_input={"code": "X"}, requested_by=admin,
                template_id="exam_topics_fill",
            )
            await s.commit()
        async with sessionmaker()() as s:
            # Default kind does NOT see it (scoped by template_id).
            miss = await job_repo.get_research_job(s, job_id=jid, requested_by=admin)
            hit = await job_repo.get_research_job(
                s, job_id=jid, requested_by=admin, template_id="exam_topics_fill")
        return {"miss": miss, "hit": hit}

    out = asyncio.run(_run())
    assert out["miss"] is None
    assert out["hit"] is not None and out["hit"]["status"] == "pending"
