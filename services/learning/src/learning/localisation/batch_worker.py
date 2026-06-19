"""Background drain loop for a translation batch.

Each task runs in its own session+commit so one failure never rolls
back a sibling. A crashed/restarted worker resumes by re-querying
PENDING tasks (next_pending_task claims PENDING->RUNNING)."""

from __future__ import annotations

import logging

from learning.ai_gateway import AIGateway
from learning.localisation import batch_repo
from learning.localisation.translate_one import translate_question_into

logger = logging.getLogger(__name__)


async def run_batch(session_factory, gateway: AIGateway, batch_id: str) -> None:
    while True:
        async with session_factory() as session:
            task = await batch_repo.next_pending_task(session, batch_id)
            await session.commit()
        if task is None:
            break
        async with session_factory() as session:
            try:
                res = await translate_question_into(
                    session, gateway,
                    question_id=task["questionId"], target_lang=task["language"])
                await batch_repo.complete_task(session, task_id=task["id"], version=res["version"])
                await session.commit()
            except Exception as e:  # noqa: BLE001
                await session.rollback()
                async with session_factory() as s2:
                    await batch_repo.fail_task(s2, task_id=task["id"], error=str(e))
                    await s2.commit()
                logger.warning("batch task %s failed: %s", task["id"], e)
    async with session_factory() as session:
        await batch_repo.finalize_batch_if_done(session, batch_id)
        await session.commit()
