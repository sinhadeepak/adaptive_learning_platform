import pytest
from sqlalchemy import text

from learning.localisation import batch_repo


async def _seed_question(session, qid: str) -> None:
    await session.execute(text("""
        INSERT INTO content_schema.questions
          (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
        VALUES (:id, :id, 'Stem text', '["a","b"]'::jsonb, 0, 'en', 'PUBLISHED', :id, 'MCQ_SINGLE')
        ON CONFLICT (id) DO NOTHING
    """), {"id": qid})


@pytest.mark.asyncio
async def test_create_batch_fans_out_tasks(content_session):
    q1 = "00000000-0000-0000-0000-0000000a0001"
    q2 = "00000000-0000-0000-0000-0000000a0002"
    await _seed_question(content_session, q1)
    await _seed_question(content_session, q2)
    out = await batch_repo.create_batch(
        content_session, created_by=None, question_ids=[q1, q2],
        target_langs=["hi", "ta"], overwrite_existing=False)
    await content_session.commit()
    assert out["totalTasks"] == 4  # 2 questions × 2 langs
    got = await batch_repo.get_batch(content_session, out["batchId"])
    assert len(got["tasks"]) == 4
    assert got["tasks"][0]["stem"] == "Stem text"


@pytest.mark.asyncio
async def test_skip_existing_published(content_session):
    q = "00000000-0000-0000-0000-0000000a0003"
    await _seed_question(content_session, q)
    await content_session.execute(text("""
        INSERT INTO content_schema.content_artifact_translations
          (artifact_id, language, payload_translation, status, version)
        VALUES (:q, 'hi', '{}'::jsonb, 'PUBLISHED', 1)
        ON CONFLICT (artifact_id, language) DO UPDATE SET status='PUBLISHED'
    """), {"q": q})
    out = await batch_repo.create_batch(
        content_session, created_by=None, question_ids=[q],
        target_langs=["hi", "ta"], overwrite_existing=False)
    await content_session.commit()
    got = await batch_repo.get_batch(content_session, out["batchId"])
    statuses = {(t["language"], t["status"]) for t in got["tasks"]}
    assert ("hi", "SKIPPED") in statuses
    assert ("ta", "PENDING") in statuses


@pytest.mark.asyncio
async def test_claim_complete_and_finalize(content_session):
    q = "00000000-0000-0000-0000-0000000a0004"
    await _seed_question(content_session, q)
    out = await batch_repo.create_batch(
        content_session, created_by=None, question_ids=[q], target_langs=["hi"])
    await content_session.commit()
    task = await batch_repo.next_pending_task(content_session, out["batchId"])
    assert task["language"] == "hi"
    await batch_repo.complete_task(content_session, task_id=task["id"], version=1)
    await batch_repo.finalize_batch_if_done(content_session, out["batchId"])
    await content_session.commit()
    got = await batch_repo.get_batch(content_session, out["batchId"])
    assert got["batch"]["status"] == "DONE"
    assert got["batch"]["doneTasks"] == 1
